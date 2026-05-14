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

    // 3b. Scan same-origin iframes. Sites that embed contact widgets,
    // support chat panels, or "contact us" forms via iframe on their own
    // subdomain hide the contact info inside an iframe document our normal
    // body scan can't see. Cross-origin iframes are blocked by the browser
    // security model and are skipped silently. Same-origin (including same
    // sub-origin) is readable per the same-origin policy.
    scanSameOriginIframes(results, seen);

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

  // Walk every iframe on the page; for any that is same-origin (i.e. we can
  // access contentDocument without SecurityError), recurse the scanner's
  // text-extraction step into its body. Bounded to one level of recursion
  // to avoid pathological deeply-nested iframe trees from chat widgets.
  function scanSameOriginIframes(results, seen, depth) {
    depth = depth || 0;
    if (depth > 1) return; // cap recursion
    const frames = document.querySelectorAll("iframe");
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      let doc = null;
      try {
        // Accessing contentDocument on a cross-origin iframe throws
        // SecurityError -- we catch it and continue. Same-origin returns
        // the inner Document we can scan.
        doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
      } catch (_) {
        doc = null;
      }
      if (!doc || !doc.body) continue;

      // Extract from the iframe's body innerText, plus any mailto/tel anchors
      // it carries -- those are higher-confidence than free text.
      try {
        doc.querySelectorAll('a[href^="mailto:"]').forEach((el) => {
          const email = (el.getAttribute("href") || "").replace("mailto:", "").split("?")[0].toLowerCase();
          if (!email || seen.has(email) || !email.includes("@")) return;
          seen.add(email);
          const context = "iframe: " + (frame.title || frame.name || frame.src || "(embedded)");
          results.emails.push({
            value: email,
            context,
            score: scoreEmail(email, context),
            source: "iframe-mailto",
          });
        });
        doc.querySelectorAll('a[href^="tel:"]').forEach((el) => {
          const phone = (el.getAttribute("href") || "").replace("tel:", "").replace(/\s/g, "");
          if (!phone || seen.has(phone) || phone.length < 10) return;
          seen.add(phone);
          const context = "iframe: " + (frame.title || frame.name || frame.src || "(embedded)");
          results.phones.push({
            value: formatPhone(phone),
            context,
            score: 90,
            source: "iframe-tel",
          });
        });

        const text = (doc.body && doc.body.innerText) || "";
        if (text) {
          extractFromText(text, doc.body, results, seen);
        }
      } catch (_) {
        // SecurityError mid-walk (happens when an iframe re-navigates to a
        // cross-origin URL between our access check and the read). Skip.
      }
    }
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
    // Normalize whatever the input format (raw 10/11-digit string from tel:
    // links, or a free-text match like "1-800-555-1212" or "123.456.7890")
    // into a consistent US display format: (NNN) NNN-NNNN. International or
    // shorter numbers fall through to a light whitespace cleanup so we
    // don't mangle them.
    const raw = String(phone).trim();
    const digits = raw.replace(/\D/g, "");

    // Plain US 10-digit
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    // US 11-digit with leading country code 1 -- drop the 1 for display since
    // domestic readers parse "(800) 555-1212" faster than "+1 (800) 555-1212".
    // The E.164 conversion in popup.js / content.js (toE164) re-adds it for
    // VOIP deep links, so call/dialer routing is unaffected.
    if (digits.length === 11 && digits.startsWith("1")) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    // Anything else (international, partial 7-digit local, vanity numbers
    // with letters that got stripped to fewer than 10 digits): preserve
    // whatever the page had, just collapse whitespace.
    return raw.replace(/\s+/g, " ");
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

      ensureSidePanel(results);
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

  // ===================================================================
  // SHARED ACTIONS: Compose templates and VOIP deep links
  // Mirrors the popup's tables so the side panel can hand off contacts
  // to the user's chosen mail client or dialer with the same UX. Kept
  // in sync manually with popup.js -- if you add a service or template,
  // update both files.
  // ===================================================================

  const VOIP_SERVICES = [
    { id: "tel",      name: "Phone",        buildUrl: (e164) => `tel:${e164}` },
    { id: "whatsapp", name: "WhatsApp",     buildUrl: (e164) => `https://wa.me/${e164.replace(/^\+/, "")}` },
    { id: "gvoice",   name: "Google Voice", buildUrl: (e164) => `https://voice.google.com/u/0/calls?a=nc,${encodeURIComponent(e164)}` },
    { id: "facetime", name: "FaceTime",     buildUrl: (e164) => `facetime-audio:${e164}` },
    { id: "teams",    name: "Teams",        buildUrl: (e164) => `https://teams.microsoft.com/l/call/0/0?users=4:${encodeURIComponent(e164)}` },
  ];

  const EMAIL_TEMPLATES = [
    { id: "blank",     label: "Blank",     subject: "",                     body: "" },
    { id: "refund",    label: "Refund",    subject: "Refund Request",       body: ["Hello,", "", "I'd like to request a refund for [order number / purchase date].", "", "Reason: [briefly describe]", "", "Please let me know what additional information you need to process this. I appreciate your help.", "", "Thank you,", "[Your name]"].join("\n") },
    { id: "complaint", label: "Complaint", subject: "Customer Complaint",   body: ["Hello,", "", "I'm writing to share a concern about a recent experience with [product/service].", "", "What happened:", "[describe the issue]", "", "What I'd like to see resolved:", "[desired outcome]", "", "I appreciate your time and look forward to your response.", "", "Best regards,", "[Your name]"].join("\n") },
    { id: "cancel",    label: "Cancel",    subject: "Cancellation Request", body: ["Hello,", "", "I'd like to cancel my [account / subscription / service].", "", "Account details: [email or account number]", "Effective date: [date or \"as soon as possible\"]", "", "Please confirm the cancellation and let me know if anything further is needed on my end.", "", "Thank you,", "[Your name]"].join("\n") },
    { id: "billing",   label: "Billing",   subject: "Billing Question",     body: ["Hello,", "", "I have a question about a charge on my account:", "", "- Date: [date]", "- Amount: [amount]", "- Description: [what was charged]", "", "[Your question or concern]", "", "Could you please look into this and get back to me?", "", "Thank you,", "[Your name]"].join("\n") },
    { id: "support",   label: "Support",   subject: "Support Request",      body: ["Hello,", "", "I'm having an issue I'd appreciate help with.", "", "What's happening:", "[describe]", "", "What I've already tried:", "[any troubleshooting]", "", "Any guidance would be appreciated.", "", "Thanks,", "[Your name]"].join("\n") },
  ];

  // Default (mailto:) was dropped -- relied on the OS having a configured
  // mail handler, which most users don't. Two-option universe: Gmail
  // (default selection) + Outlook.
  const EMAIL_CLIENTS = [
    { id: "gmail",   name: "Gmail",   buildUrl: ({ to, subject, body }) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` },
    { id: "outlook", name: "Outlook", buildUrl: ({ to, subject, body }) => `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` },
  ];

  const SP_CLIENT_KEY = "fmp_side_panel_email_client";

  function toE164(phone) {
    let s = String(phone).replace(/[^\d+]/g, "");
    if (s.startsWith("+")) return s;
    if (s.length === 10) return "+1" + s;
    if (s.length === 11 && s.startsWith("1")) return "+" + s;
    return "+" + s;
  }

  // Content-script open-URL: anchor click works for both protocol URIs
  // (mailto:, tel:, facetime-audio:) and HTTPS, since the click is a real
  // user gesture and the page context isn't subject to the MV3 popup
  // window's popup-blocker quirks. Attached to documentElement to avoid
  // host-page body listeners.
  function spOpenUrl(url) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.documentElement.appendChild(a);
    a.click();
    document.documentElement.removeChild(a);
  }

  async function spGetClient() {
    // Normalize legacy "default" (and any unknown value) to "gmail" so users
    // who set a preference under the old 3-option picker still land on a
    // working chip.
    if (!chrome.storage || !chrome.storage.local) return "gmail";
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([SP_CLIENT_KEY], (r) => {
          const stored = r[SP_CLIENT_KEY];
          resolve(stored === "gmail" || stored === "outlook" ? stored : "gmail");
        });
      } catch (_) {
        resolve("gmail");
      }
    });
  }

  function spSetClient(id) {
    if (!chrome.storage || !chrome.storage.local) return;
    try {
      chrome.storage.local.set({ [SP_CLIENT_KEY]: id });
    } catch (_) {}
  }

  // ===================================================================
  // SIDE PANEL OVERLAY
  // Injects a small green tab on the right edge of every page that
  // expands into a panel listing the same ranked contacts the popup
  // shows. Lets users surface contacts without clicking the toolbar.
  // Lives in a shadow DOM so the host page's CSS can't touch it.
  // Master toggle (default on) is stored in chrome.storage.local and
  // surfaced in the popup. Per-domain dismissal ("Hide on this site")
  // is stored under a hostname-keyed entry with a 7-day TTL.
  // ===================================================================

  const SP_HOST_ID = "fmp-side-panel-host";
  const SP_MASTER_KEY = "fmp_side_panel_enabled";
  const SP_DISMISS_PREFIX = "fmp_side_panel_dismissed_";
  const SP_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  async function spGetMaster() {
    if (!chrome.storage || !chrome.storage.local) return true;
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([SP_MASTER_KEY], (r) => {
          resolve(r[SP_MASTER_KEY] !== false);
        });
      } catch (_) {
        resolve(true);
      }
    });
  }

  async function spIsDismissedForDomain() {
    if (!chrome.storage || !chrome.storage.local) return false;
    const key = SP_DISMISS_PREFIX + window.location.hostname;
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (r) => {
          const ts = r[key];
          resolve(!!ts && Date.now() - ts < SP_DISMISS_TTL_MS);
        });
      } catch (_) {
        resolve(false);
      }
    });
  }

  function spDismissForDomain() {
    if (!chrome.storage || !chrome.storage.local) return;
    const key = SP_DISMISS_PREFIX + window.location.hostname;
    try {
      chrome.storage.local.set({ [key]: Date.now() });
    } catch (_) {}
  }

  function spEscape(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function spBuildBody(currentResults, currentClient) {
    const total = currentResults.emails.length + currentResults.phones.length;

    let html = `
      <div class="tab" data-sp-action="expand" role="button" aria-label="Open Find Me People panel" title="Find Me People (${total} contact${total === 1 ? "" : "s"})">
        <span class="tab-icon">&#128100;</span>
        ${total > 0 ? `<span class="tab-count">${total}</span>` : ""}
      </div>
      <div class="panel" role="dialog" aria-label="Find Me People contacts">
        <div class="header">
          <span class="title"><span class="logo">&#128100;</span> Find Me People</span>
          <button class="icon-btn" data-sp-action="collapse" aria-label="Collapse">&minus;</button>
        </div>
        <div class="status">${total > 0 ? `Found ${total} contact${total === 1 ? "" : "s"} on this page` : "No contacts found"}</div>
        <div class="scroll">
    `;

    if (currentResults.emails.length) {
      html += `<div class="section"><div class="section-title">Email</div>`;
      // Section-level client picker -- one preference for every template chip below
      html += `<div class="client-picker"><span class="picker-label">Templates open in</span>`;
      EMAIL_CLIENTS.forEach((c) => {
        const sel = c.id === currentClient ? " selected" : "";
        html += `<button class="chip sm${sel}" data-sp-set-client="${c.id}">${spEscape(c.name)}</button>`;
      });
      html += `</div>`;

      currentResults.emails.slice(0, 5).forEach((e, idx) => {
        const sc = e.score >= 70 ? "high" : e.score >= 40 ? "mid" : "low";
        const lbl = e.score >= 70 ? "Likely support" : e.score >= 40 ? "Possible" : "Low match";
        const escVal = spEscape(e.value);
        const rowId = `email-${idx}`;
        const tplChips = EMAIL_TEMPLATES.map(
          (t) => `<button class="chip" data-sp-template="${t.id}" data-sp-email="${escVal}">${spEscape(t.label)}</button>`
        ).join("");
        html += `
          <div class="row">
            <div class="row-main" data-sp-copy="${escVal}">
              <div class="val">${escVal}</div>
              <div class="meta">
                <span>Click to copy</span>
                <span class="score score-${sc}">${lbl}</span>
              </div>
            </div>
            <button class="row-toggle" data-sp-toggle="${rowId}">Compose <span class="caret">&#9662;</span></button>
            <div class="row-actions" data-sp-panel="${rowId}">
              <div class="chips">${tplChips}</div>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    if (currentResults.phones.length) {
      html += `<div class="section"><div class="section-title">Phone</div>`;
      currentResults.phones.slice(0, 5).forEach((p, idx) => {
        const sc = p.score >= 70 ? "high" : p.score >= 40 ? "mid" : "low";
        const lbl = p.score >= 70 ? "Likely support" : p.score >= 40 ? "Possible" : "Low match";
        const escVal = spEscape(p.value);
        const escE164 = spEscape(toE164(p.value));
        const rowId = `phone-${idx}`;
        const voipChips = VOIP_SERVICES.map(
          (s) => `<button class="chip" data-sp-voip="${s.id}" data-sp-phone="${escE164}">${spEscape(s.name)}</button>`
        ).join("");
        html += `
          <div class="row">
            <div class="row-main" data-sp-copy="${escVal}">
              <div class="val">${escVal}</div>
              <div class="meta">
                <span>Click to copy</span>
                <span class="score score-${sc}">${lbl}</span>
              </div>
            </div>
            <button class="row-toggle" data-sp-toggle="${rowId}">Call <span class="caret">&#9662;</span></button>
            <div class="row-actions" data-sp-panel="${rowId}">
              <div class="chips">${voipChips}</div>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    html += `
        </div>
        <div class="footer">
          <button class="text-btn" data-sp-action="dismiss-site">Hide on this site</button>
        </div>
      </div>
      <div class="copied-toast">Copied</div>
    `;
    return html;
  }

  const SP_CSS = `
    :host {
      all: initial;
      position: fixed;
      top: 30%;
      right: 0;
      z-index: 2147483640;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.4;
    }
    * { box-sizing: border-box; }
    .tab {
      width: 40px;
      height: 88px;
      background: linear-gradient(135deg, #2d8a2e, #4ade80);
      border-radius: 12px 0 0 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: -4px 0 14px rgba(0,0,0,0.25);
      position: relative;
      transition: transform 0.15s;
      color: #ffffff;
    }
    .tab:hover { transform: translateX(-3px); }
    .tab-icon { font-size: 22px; line-height: 1; }
    .tab-count {
      position: absolute;
      top: 4px;
      right: 4px;
      background: #ffffff;
      color: #2d8a2e;
      font-size: 10px;
      font-weight: 700;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .panel {
      display: none;
      flex-direction: column;
      width: 340px;
      max-height: 70vh;
      background: #0a0a0a;
      color: #fafafa;
      border-radius: 12px 0 0 12px;
      box-shadow: -8px 0 28px rgba(0,0,0,0.45);
      overflow: hidden;
      border: 1px solid #1e1e1e;
      border-right: none;
    }
    :host(.expanded) .tab { display: none; }
    :host(.expanded) .panel { display: flex; }
    .header {
      padding: 12px 14px;
      border-bottom: 1px solid #1e1e1e;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .title {
      font-size: 14px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .logo {
      width: 22px;
      height: 22px;
      background: linear-gradient(135deg, #2d8a2e, #4ade80);
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      color: #ffffff;
    }
    .icon-btn {
      background: none;
      border: none;
      color: #71717a;
      cursor: pointer;
      font-size: 18px;
      padding: 2px 8px;
      font-family: inherit;
      line-height: 1;
    }
    .icon-btn:hover { color: #fafafa; }
    .status {
      padding: 8px 14px;
      font-size: 11px;
      color: #a1a1aa;
      flex-shrink: 0;
    }
    .scroll {
      flex: 1;
      overflow-y: auto;
      padding-bottom: 4px;
    }
    .scroll::-webkit-scrollbar { width: 4px; }
    .scroll::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; }
    .section { padding: 4px 14px; }
    .section-title {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #52525b;
      margin-bottom: 6px;
    }
    .row {
      background: #111113;
      border: 1px solid #1e1e1e;
      border-radius: 8px;
      padding: 8px 10px;
      margin-bottom: 5px;
      transition: border-color 0.15s;
    }
    .row:hover { border-color: #4ade80; }
    .row-main { cursor: pointer; }
    .row-toggle {
      background: none;
      border: none;
      color: #71717a;
      font-size: 10px;
      cursor: pointer;
      padding: 5px 0 0;
      font-family: inherit;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      transition: color 0.15s;
    }
    .row-toggle:hover { color: #4ade80; }
    .row-toggle .caret { display: inline-block; transition: transform 0.2s; }
    .row-toggle.open .caret { transform: rotate(180deg); }
    .row-actions { margin-top: 6px; display: none; }
    .row-actions.open { display: block; }
    .client-picker {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      padding: 0 0 8px;
    }
    .picker-label {
      font-size: 9px;
      color: #52525b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-right: 4px;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip {
      background: #18181b;
      border: 1px solid #27272a;
      color: #d4d4d8;
      font-size: 10.5px;
      padding: 3px 8px;
      border-radius: 12px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .chip:hover { border-color: #4ade80; color: #4ade80; }
    .chip.selected {
      background: rgba(74,222,128,0.15);
      border-color: #4ade80;
      color: #4ade80;
    }
    .chip.sm { font-size: 10px; padding: 2px 7px; }
    .val {
      font-size: 12.5px;
      font-weight: 600;
      color: #fafafa;
      word-break: break-all;
    }
    .meta {
      font-size: 10px;
      color: #52525b;
      margin-top: 2px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .score {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 8px;
    }
    .score-high { background: rgba(74,222,128,0.15); color: #4ade80; }
    .score-mid { background: rgba(251,191,36,0.15); color: #fbbf24; }
    .score-low { background: rgba(161,161,170,0.15); color: #a1a1aa; }
    .footer {
      padding: 9px 14px 11px;
      border-top: 1px solid #1e1e1e;
      text-align: center;
      flex-shrink: 0;
      font-size: 11px;
      color: #71717a;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .text-btn {
      background: none;
      border: none;
      color: #71717a;
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
      padding: 0;
      text-decoration: underline;
      text-decoration-color: #27272a;
    }
    .text-btn:hover { color: #4ade80; text-decoration-color: #4ade80; }
    .footer-sep { color: #27272a; }
    .copied-toast {
      position: absolute;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      background: #4ade80;
      color: #0a0a0a;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 8px;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    .copied-toast.show { opacity: 1; }
  `;

  function spWireEvents(shadow, currentResults) {
    const host = shadow.host;

    shadow.querySelectorAll('[data-sp-action="expand"]').forEach((el) => {
      el.addEventListener("click", () => host.classList.add("expanded"));
    });

    shadow.querySelectorAll('[data-sp-action="collapse"]').forEach((el) => {
      el.addEventListener("click", () => host.classList.remove("expanded"));
    });

    shadow.querySelectorAll('[data-sp-action="dismiss-site"]').forEach((el) => {
      el.addEventListener("click", () => {
        spDismissForDomain();
        host.remove();
      });
    });

    shadow.querySelectorAll("[data-sp-copy]").forEach((el) => {
      el.addEventListener("click", () => {
        const value = el.getAttribute("data-sp-copy");
        if (!value) return;
        try {
          navigator.clipboard.writeText(value);
        } catch (_) {}
        const toast = shadow.querySelector(".copied-toast");
        if (toast) {
          toast.classList.add("show");
          setTimeout(() => toast.classList.remove("show"), 1200);
        }
      });
    });

    // Per-row Compose/Call expand/collapse
    shadow.querySelectorAll("[data-sp-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-sp-toggle");
        const panel = shadow.querySelector(`[data-sp-panel="${id}"]`);
        if (panel) {
          panel.classList.toggle("open");
          btn.classList.toggle("open");
        }
      });
    });

    // Email client picker -> updates chrome.storage; re-render restores
    // the selected highlight on the next rescan tick. For an immediate
    // visual response, we also toggle the .selected class locally.
    shadow.querySelectorAll("[data-sp-set-client]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-sp-set-client");
        spSetClient(id);
        shadow.querySelectorAll("[data-sp-set-client]").forEach((b) => {
          b.classList.toggle("selected", b.getAttribute("data-sp-set-client") === id);
        });
      });
    });

    // Compose template chip -> open chosen client with subject/body
    shadow.querySelectorAll("[data-sp-template]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const tpl = EMAIL_TEMPLATES.find((t) => t.id === btn.getAttribute("data-sp-template"));
        const clientId = await spGetClient();
        const client = EMAIL_CLIENTS.find((c) => c.id === clientId) || EMAIL_CLIENTS[0];
        const to = btn.getAttribute("data-sp-email");
        if (tpl && to) spOpenUrl(client.buildUrl({ to, subject: tpl.subject, body: tpl.body }));
      });
    });

    // VOIP chip -> open the chosen app/site with the phone number passed in
    shadow.querySelectorAll("[data-sp-voip]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const svc = VOIP_SERVICES.find((s) => s.id === btn.getAttribute("data-sp-voip"));
        const phone = btn.getAttribute("data-sp-phone");
        if (svc && phone) spOpenUrl(svc.buildUrl(phone));
      });
    });
  }

  async function ensureSidePanel(currentResults) {
    if (!document.body) return;

    const total =
      (currentResults.emails || []).length +
      (currentResults.phones || []).length;

    if (total === 0) {
      const existing = document.getElementById(SP_HOST_ID);
      if (existing) existing.remove();
      return;
    }

    const [masterOn, dismissed, currentClient] = await Promise.all([
      spGetMaster(),
      spIsDismissedForDomain(),
      spGetClient(),
    ]);

    if (!masterOn || dismissed) {
      const existing = document.getElementById(SP_HOST_ID);
      if (existing) existing.remove();
      return;
    }

    // Capture state we want to survive a re-render: panel expand and any
    // per-row Compose/Call toggles the user has currently open.
    const prior = document.getElementById(SP_HOST_ID);
    const wasExpanded = prior ? prior.classList.contains("expanded") : false;
    const wasOpenRows = new Set();
    if (prior && prior.shadowRoot) {
      prior.shadowRoot.querySelectorAll(".row-toggle.open").forEach((t) => {
        const id = t.getAttribute("data-sp-toggle");
        if (id) wasOpenRows.add(id);
      });
    }

    let host = prior;
    if (!host) {
      host = document.createElement("div");
      host.id = SP_HOST_ID;
      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = SP_CSS;
      shadow.appendChild(style);
      const container = document.createElement("div");
      container.innerHTML = spBuildBody(currentResults, currentClient);
      while (container.firstChild) shadow.appendChild(container.firstChild);
      document.documentElement.appendChild(host);
      spWireEvents(shadow, currentResults);
    } else {
      const shadow = host.shadowRoot;
      const style = shadow.querySelector("style");
      while (shadow.firstChild) shadow.removeChild(shadow.firstChild);
      if (style) shadow.appendChild(style);
      const container = document.createElement("div");
      container.innerHTML = spBuildBody(currentResults, currentClient);
      while (container.firstChild) shadow.appendChild(container.firstChild);
      if (wasExpanded) host.classList.add("expanded");
      // Restore previously-open Compose/Call panels
      wasOpenRows.forEach((id) => {
        const toggle = shadow.querySelector(`[data-sp-toggle="${id}"]`);
        const panel = shadow.querySelector(`[data-sp-panel="${id}"]`);
        if (toggle) toggle.classList.add("open");
        if (panel) panel.classList.add("open");
      });
      spWireEvents(shadow, currentResults);
    }
  }

  // Live-update if popup toggles the master setting on another tab, or if
  // the user changes the email-client preference from any other tab's side
  // panel -- both reads happen at ensureSidePanel rebuild time.
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && (SP_MASTER_KEY in changes || SP_CLIENT_KEY in changes)) {
        ensureSidePanel(results);
      }
    });
  }

  // Initial mount
  ensureSidePanel(results);
})();
