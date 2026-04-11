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

  function scanPage() {
    const results = { emails: [], phones: [], links: [], context: [] };
    const seen = new Set();

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
})();
