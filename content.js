// Find Me People - Content Script
// Scans every page for customer service contact information

(function () {
  "use strict";

  const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const INTL_PHONE_REGEX = /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{0,4}/g;

  // Keywords that indicate customer service / support context
  const SUPPORT_KEYWORDS = [
    "support", "customer service", "customer support", "help desk",
    "helpdesk", "contact us", "contact", "get in touch", "reach us",
    "call us", "email us", "write to us", "speak to", "talk to",
    "assistance", "service desk", "care team", "customer care",
    "billing support", "technical support", "tech support",
  ];

  // Keywords that indicate the email/phone is likely support-related
  const SUPPORT_EMAIL_HINTS = [
    "support", "help", "care", "service", "contact", "info",
    "assist", "billing", "sales", "hello", "team", "feedback",
    "cs@", "customerservice", "customer.service",
  ];

  // Selectors likely to contain contact info
  const CONTACT_SELECTORS = [
    'footer', '[class*="footer"]', '[id*="footer"]',
    '[class*="contact"]', '[id*="contact"]',
    '[class*="support"]', '[id*="support"]',
    '[class*="help"]', '[id*="help"]',
    'a[href^="mailto:"]', 'a[href^="tel:"]',
    '[class*="customer"]', '[id*="customer"]',
    '[aria-label*="contact"]', '[aria-label*="support"]',
  ];

  // Pages likely to have contact info
  const CONTACT_PAGE_PATTERNS = [
    /\/contact/i, /\/support/i, /\/help/i, /\/about/i,
    /\/customer-service/i, /\/get-in-touch/i, /\/reach-us/i,
  ];

  // Day name regex parts
  const DAY_NAMES = "(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
  const DAY_FULL = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const DAY_SHORT = ["sun","mon","tue","wed","thu","fri","sat"];

  // Hours patterns - match "Mon-Fri 9am-5pm", "Monday: 9:00 - 17:00", "9am - 5pm", etc.
  const TIME = "(?:1[0-2]|[1-9])(?::[0-5]\\d)?\\s*(?:am|pm|AM|PM)|(?:[01]?\\d|2[0-3]):[0-5]\\d";
  const HOURS_LINE_REGEX = new RegExp(
    "(" + DAY_NAMES + "(?:\\s*[-–to]+\\s*" + DAY_NAMES + ")?)" +
    "[:\\s]+(" + TIME + ")\\s*[-–to]+\\s*(" + TIME + ")",
    "gi"
  );
  // Just a time range like "9am - 5pm" (not anchored to day)
  const TIME_RANGE_REGEX = new RegExp(
    "(" + TIME + ")\\s*[-–]+\\s*(" + TIME + ")",
    "gi"
  );

  // Keywords that indicate hours context
  const HOURS_KEYWORDS = [
    "hours of operation", "business hours", "opening hours", "open hours",
    "store hours", "office hours", "hours", "open", "we're open",
    "operating hours", "working hours",
  ];

  function scanPage() {
    const results = { emails: [], phones: [], links: [], context: [], hours: [] };
    const seen = new Set();
    const hoursSeen = new Set();

    // 1. Scan mailto: and tel: links (highest confidence)
    document.querySelectorAll('a[href^="mailto:"]').forEach((el) => {
      const email = el.href.replace("mailto:", "").split("?")[0].toLowerCase();
      if (!seen.has(email) && email.includes("@")) {
        seen.add(email);
        const context = getContext(el);
        const score = scoreEmail(email, context);
        results.emails.push({ value: email, context, score, source: "mailto" });
      }
    });

    document.querySelectorAll('a[href^="tel:"]').forEach((el) => {
      const phone = el.href.replace("tel:", "").replace(/\s/g, "");
      if (!seen.has(phone) && phone.length >= 10) {
        seen.add(phone);
        const context = getContext(el);
        results.phones.push({ value: formatPhone(phone), context, score: 90, source: "tel" });
      }
    });

    // 1b. Cloudflare email obfuscation -- many enterprise sites wrap addresses
    // as <a class="__cf_email__" data-cfemail="HEX">[email&nbsp;protected]</a>
    // and rely on a CF script to decode them in the browser. The decoded text
    // sometimes never lands in the DOM (script blocked, error, lazy load), so
    // we decode the data-cfemail attribute directly. This is the same XOR-key
    // scheme CF uses, equivalent to the JS they ship.
    document.querySelectorAll('[data-cfemail]').forEach((el) => {
      const email = decodeCfEmail(el.getAttribute('data-cfemail'));
      if (!email || !email.includes('@')) return;
      const lower = email.toLowerCase();
      if (seen.has(lower)) return;
      seen.add(lower);
      const context = getContext(el);
      const score = scoreEmail(lower, context);
      results.emails.push({ value: lower, context, score, source: "cf" });
    });

    // 2. Scan contact-likely sections
    CONTACT_SELECTORS.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          const text = el.textContent || "";
          extractFromText(text, el, results, seen);
        });
      } catch (e) {}
    });

    // 3. Scan the full page body for remaining matches
    const bodyText = document.body ? document.body.innerText : "";
    extractFromText(bodyText, document.body, results, seen);

    // 4. Look for contact page links
    document.querySelectorAll("a").forEach((a) => {
      const href = a.href || "";
      const text = (a.textContent || "").toLowerCase();
      if (
        CONTACT_PAGE_PATTERNS.some((p) => p.test(href)) ||
        SUPPORT_KEYWORDS.some((kw) => text.includes(kw))
      ) {
        if (href && !seen.has(href) && href.startsWith("http")) {
          seen.add(href);
          results.links.push({
            url: href,
            text: a.textContent.trim().substring(0, 60),
          });
        }
      }
    });

    // 5. Scan for hours of operation
    extractHours(results, hoursSeen);

    // Sort by relevance score
    results.emails.sort((a, b) => b.score - a.score);
    results.phones.sort((a, b) => b.score - a.score);

    // Dedupe links
    const linksSeen = new Set();
    results.links = results.links.filter((l) => {
      const key = new URL(l.url).pathname;
      if (linksSeen.has(key)) return false;
      linksSeen.add(key);
      return true;
    });

    return results;
  }

  function extractHours(results, hoursSeen) {
    // 1. Try schema.org JSON-LD structured data first (highest confidence)
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        items.forEach((item) => {
          collectSchemaHours(item, results, hoursSeen);
        });
      } catch (e) {}
    });

    // 2. Try microdata (itemprop="openingHours")
    document.querySelectorAll('[itemprop="openingHours"]').forEach((el) => {
      const content = el.getAttribute("content") || el.textContent.trim();
      if (content && !hoursSeen.has(content)) {
        hoursSeen.add(content);
        const parsed = parseSchemaOpeningHours(content);
        if (parsed) {
          results.hours.push({
            display: parsed.display,
            days: parsed.days,
            score: 95,
            source: "microdata",
          });
        }
      }
    });

    // 3. Scan body text for hours patterns
    const candidates = new Set();

    // Look in elements whose class/id mentions hours
    document.querySelectorAll(
      '[class*="hour"], [id*="hour"], [class*="schedule"], [id*="schedule"], ' +
      '[class*="open"], [id*="open"], footer, [class*="footer"]'
    ).forEach((el) => {
      const text = (el.textContent || "").substring(0, 500);
      if (text) candidates.add(text);
    });

    // Also scan elements containing hours keywords
    const allText = document.body ? document.body.innerText : "";
    HOURS_KEYWORDS.forEach((kw) => {
      const idx = allText.toLowerCase().indexOf(kw);
      if (idx !== -1) {
        const snippet = allText.substring(idx, idx + 300);
        candidates.add(snippet);
      }
    });

    candidates.forEach((text) => {
      const matches = parseHoursFromText(text);
      matches.forEach((m) => {
        const key = m.display.toLowerCase();
        if (!hoursSeen.has(key)) {
          hoursSeen.add(key);
          results.hours.push(m);
        }
      });
    });

    // Sort by score
    results.hours.sort((a, b) => b.score - a.score);
    // Cap at 7 entries (one per day)
    results.hours = results.hours.slice(0, 7);
  }

  function collectSchemaHours(item, results, hoursSeen) {
    if (!item || typeof item !== "object") return;

    if (item.openingHours) {
      const hours = Array.isArray(item.openingHours) ? item.openingHours : [item.openingHours];
      hours.forEach((h) => {
        if (typeof h === "string" && !hoursSeen.has(h)) {
          hoursSeen.add(h);
          const parsed = parseSchemaOpeningHours(h);
          if (parsed) {
            results.hours.push({
              display: parsed.display,
              days: parsed.days,
              score: 100,
              source: "json-ld",
            });
          }
        }
      });
    }

    if (item.openingHoursSpecification) {
      const specs = Array.isArray(item.openingHoursSpecification)
        ? item.openingHoursSpecification
        : [item.openingHoursSpecification];
      specs.forEach((spec) => {
        const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];
        const dayNames = days.filter(Boolean).map(simplifyDayName);
        const opens = formatTime(spec.opens);
        const closes = formatTime(spec.closes);
        if (dayNames.length && opens && closes) {
          const dayLabel = dayNames.length > 1 ? dayNames[0] + "-" + dayNames[dayNames.length - 1] : dayNames[0];
          const display = dayLabel + ": " + opens + " - " + closes;
          if (!hoursSeen.has(display)) {
            hoursSeen.add(display);
            results.hours.push({
              display,
              days: dayNames,
              opens,
              closes,
              score: 100,
              source: "json-ld",
            });
          }
        }
      });
    }

    // Recurse into nested schema objects
    Object.values(item).forEach((v) => {
      if (v && typeof v === "object") collectSchemaHours(v, results, hoursSeen);
    });
  }

  function simplifyDayName(d) {
    if (!d) return "";
    const s = String(d).toLowerCase().replace(/.*\//, "");
    return s.charAt(0).toUpperCase() + s.slice(1, 3);
  }

  function formatTime(t) {
    if (!t) return "";
    // Convert "09:00" to "9am", etc.
    const m = String(t).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return String(t);
    let h = parseInt(m[1], 10);
    const min = m[2];
    const ampm = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return min === "00" ? h + ampm : h + ":" + min + ampm;
  }

  function parseSchemaOpeningHours(str) {
    // Schema format: "Mo,Tu,We,Th,Fr 09:00-17:00" or "Mo-Fr 09:00-17:00"
    const m = str.match(/([A-Za-z,\-]+)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
    if (!m) return null;
    const dayPart = m[1];
    const opens = formatTime(m[2]);
    const closes = formatTime(m[3]);
    return {
      display: dayPart + ": " + opens + " - " + closes,
      days: dayPart.split(/[,-]/),
      opens,
      closes,
    };
  }

  function parseHoursFromText(text) {
    const found = [];
    HOURS_LINE_REGEX.lastIndex = 0;
    let match;
    let count = 0;
    while ((match = HOURS_LINE_REGEX.exec(text)) !== null && count < 10) {
      count++;
      const day = match[1].trim();
      const open = match[2].trim();
      const close = match[3].trim();
      const display = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase() + ": " + open + " - " + close;
      found.push({
        display,
        opens: open,
        closes: close,
        days: [day],
        score: 80,
        source: "text",
      });
    }
    return found;
  }

  function extractFromText(text, parentEl, results, seen) {
    // Emails
    const emailMatches = text.match(EMAIL_REGEX) || [];
    emailMatches.forEach((email) => {
      email = email.toLowerCase();
      if (
        !seen.has(email) &&
        !email.endsWith(".png") &&
        !email.endsWith(".jpg") &&
        !email.endsWith(".svg") &&
        !email.includes("sentry") &&
        !email.includes("webpack") &&
        !email.includes("example.com")
      ) {
        seen.add(email);
        const context = parentEl ? getContext(parentEl) : "";
        const score = scoreEmail(email, context);
        results.emails.push({ value: email, context, score, source: "text" });
      }
    });

    // Phones
    const phoneMatches = [
      ...(text.match(PHONE_REGEX) || []),
      ...(text.match(INTL_PHONE_REGEX) || []),
    ];
    phoneMatches.forEach((phone) => {
      const cleaned = phone.replace(/[^\d+]/g, "");
      if (!seen.has(cleaned) && cleaned.length >= 10 && cleaned.length <= 15) {
        seen.add(cleaned);
        const context = parentEl ? getContext(parentEl) : "";
        const score = scorePhone(context);
        results.phones.push({
          value: formatPhone(phone),
          context,
          score,
          source: "text",
        });
      }
    });
  }

  function getContext(el) {
    if (!el) return "";
    // Walk up to find meaningful context
    let node = el;
    for (let i = 0; i < 3; i++) {
      if (node.parentElement) node = node.parentElement;
    }
    const text = (node.textContent || "").substring(0, 200).replace(/\s+/g, " ").trim();
    return text;
  }

  // Cloudflare email-protection decoder: the data-cfemail attribute is hex.
  // The first byte is the XOR key; each subsequent pair is one decoded char.
  // Returns null on malformed input rather than a partial / garbage email.
  function decodeCfEmail(encoded) {
    if (!encoded || encoded.length < 4 || encoded.length % 2 !== 0) return null;
    if (!/^[0-9a-fA-F]+$/.test(encoded)) return null;
    try {
      const key = parseInt(encoded.substring(0, 2), 16);
      let email = "";
      for (let i = 2; i < encoded.length; i += 2) {
        email += String.fromCharCode(parseInt(encoded.substring(i, i + 2), 16) ^ key);
      }
      return email;
    } catch (_) {
      return null;
    }
  }

  function scoreEmail(email, context) {
    let score = 50;
    const combined = (email + " " + context).toLowerCase();

    // Boost for support-related email prefixes
    if (SUPPORT_EMAIL_HINTS.some((h) => email.includes(h))) score += 30;

    // Boost for support context
    if (SUPPORT_KEYWORDS.some((kw) => combined.includes(kw))) score += 20;

    // Penalty for likely non-support emails
    if (email.includes("noreply") || email.includes("no-reply")) score -= 40;
    if (email.includes("marketing") || email.includes("newsletter")) score -= 20;
    if (email.includes("privacy") || email.includes("legal")) score -= 10;
    if (email.includes("jobs") || email.includes("careers") || email.includes("hr@")) score -= 30;

    // Boost if found in footer or contact section
    if (context.toLowerCase().includes("footer")) score += 10;

    return Math.max(0, Math.min(100, score));
  }

  function scorePhone(context) {
    let score = 50;
    const lower = context.toLowerCase();
    if (SUPPORT_KEYWORDS.some((kw) => lower.includes(kw))) score += 30;
    if (lower.includes("toll") || lower.includes("free")) score += 10;
    if (lower.includes("fax")) score -= 30;
    return Math.max(0, Math.min(100, score));
  }

  function formatPhone(phone) {
    // Clean up and return readable format
    return phone.replace(/\s+/g, " ").trim();
  }

  // Run scan and store results
  const results = scanPage();

  // Listen for popup requests
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "getContacts") {
      sendResponse(results);
    }
    return true;
  });

  // Also store in session for badge updates
  const totalFound =
    results.emails.length + results.phones.length;
  chrome.runtime.sendMessage({
    action: "updateBadge",
    count: totalFound,
  }).catch(() => {});

  // Auto-rescan on DOM changes. SPA pages (Spirit, modern support sites)
  // hydrate after document_idle and lazy-load contact info; the initial scan
  // misses it. Debouncing on 1s of mutation idle keeps scanPage runs to at
  // most once per second of page activity, which is plenty for catching
  // newly-rendered footers, expanded chat panels, and fetched contact pages.
  // Mutating the existing results object in place keeps the onMessage
  // listener pointing at fresh data without re-registering.
  if (document.body && typeof MutationObserver !== "undefined") {
    const RESCAN_DEBOUNCE_MS = 1000;
    let rescanTimer = null;

    const rescanAndUpdate = () => {
      const fresh = scanPage();
      results.emails = fresh.emails;
      results.phones = fresh.phones;
      results.links = fresh.links;
      results.context = fresh.context;
      results.hours = fresh.hours;

      const total = results.emails.length + results.phones.length;
      chrome.runtime.sendMessage({
        action: "updateBadge",
        count: total,
      }).catch(() => {});
    };

    const observer = new MutationObserver(() => {
      if (rescanTimer) clearTimeout(rescanTimer);
      rescanTimer = setTimeout(rescanAndUpdate, RESCAN_DEBOUNCE_MS);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
})();
