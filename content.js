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

  function spBuildBody(currentResults) {
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
      currentResults.emails.slice(0, 5).forEach((e) => {
        const sc = e.score >= 70 ? "high" : e.score >= 40 ? "mid" : "low";
        const lbl = e.score >= 70 ? "Likely support" : e.score >= 40 ? "Possible" : "Low match";
        html += `
          <div class="row" data-sp-copy="${spEscape(e.value)}">
            <div class="val">${spEscape(e.value)}</div>
            <div class="meta">
              <span>Click to copy</span>
              <span class="score score-${sc}">${lbl}</span>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    if (currentResults.phones.length) {
      html += `<div class="section"><div class="section-title">Phone</div>`;
      currentResults.phones.slice(0, 5).forEach((p) => {
        const sc = p.score >= 70 ? "high" : p.score >= 40 ? "mid" : "low";
        const lbl = p.score >= 70 ? "Likely support" : p.score >= 40 ? "Possible" : "Low match";
        html += `
          <div class="row" data-sp-copy="${spEscape(p.value)}">
            <div class="val">${spEscape(p.value)}</div>
            <div class="meta">
              <span>Click to copy</span>
              <span class="score score-${sc}">${lbl}</span>
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
          <span class="footer-sep">&middot;</span>
          <span class="footer-hint">Click toolbar icon for more</span>
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
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .row:hover { border-color: #4ade80; }
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

    const [masterOn, dismissed] = await Promise.all([
      spGetMaster(),
      spIsDismissedForDomain(),
    ]);

    if (!masterOn || dismissed) {
      const existing = document.getElementById(SP_HOST_ID);
      if (existing) existing.remove();
      return;
    }

    const wasExpanded = (() => {
      const prior = document.getElementById(SP_HOST_ID);
      return prior ? prior.classList.contains("expanded") : false;
    })();

    let host = document.getElementById(SP_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = SP_HOST_ID;
      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = SP_CSS;
      shadow.appendChild(style);
      const container = document.createElement("div");
      container.innerHTML = spBuildBody(currentResults);
      while (container.firstChild) shadow.appendChild(container.firstChild);
      document.documentElement.appendChild(host);
      spWireEvents(shadow, currentResults);
    } else {
      const shadow = host.shadowRoot;
      // Remove everything except the <style>
      const style = shadow.querySelector("style");
      while (shadow.firstChild) shadow.removeChild(shadow.firstChild);
      if (style) shadow.appendChild(style);
      const container = document.createElement("div");
      container.innerHTML = spBuildBody(currentResults);
      while (container.firstChild) shadow.appendChild(container.firstChild);
      if (wasExpanded) host.classList.add("expanded");
      spWireEvents(shadow, currentResults);
    }
  }

  // Live-update if popup toggles the master setting on another tab
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && SP_MASTER_KEY in changes) {
        ensureSidePanel(results);
      }
    });
  }

  // Initial mount
  ensureSidePanel(results);
})();
