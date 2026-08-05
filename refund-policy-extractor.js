// Sula — Refund-policy extractor.
//
// Merchants bury their refund/return policy on purpose. This reads the page
// the user is on, finds the policy text, and plain-languages what they're
// actually entitled to — so the user's request cites the merchant's OWN terms.
//
// Split cleanly: the CLASSIFY/SUMMARIZE core is pure text logic (fully tested);
// the page-scanning wrapper touches the DOM (thin, browser-only). Exposes
// window.SulaRefundPolicy.

(() => {
  "use strict";

  const POLICY_KEYWORDS = [
    "refund", "return", "money back", "money-back", "exchange", "store credit",
    "restocking", "final sale", "non-refundable", "nonrefundable", "return policy",
    "refund policy", "guarantee",
  ];

  // Is this blob of text actually a refund/return policy (vs. random page copy)?
  function classifyPolicyText(text) {
    const t = String(text || "").toLowerCase();
    if (!t) return { isPolicy: false, confidence: 0, hits: 0 };
    let hits = 0;
    for (const k of POLICY_KEYWORDS) if (t.includes(k)) hits++;
    // Needs a couple distinct policy signals; a single "return" in body copy isn't enough.
    const confidence = Math.min(1, hits / 4);
    return { isPolicy: hits >= 2, confidence, hits };
  }

  // Pull the return/refund window (in days) if the text states one.
  function findPolicyWindow(text) {
    const t = String(text || "").toLowerCase();
    // "30-day", "30 day", "within 30 days"
    const m = t.match(/(\d{1,3})[-\s]?day/);
    if (m) {
      const n = +m[1];
      if (n > 0 && n <= 365) return n;
    }
    const m2 = t.match(/within\s+(\d{1,3})\s+days/);
    if (m2) {
      const n = +m2[1];
      if (n > 0 && n <= 365) return n;
    }
    return null;
  }

  // Plain-language summary of what the policy grants + its catches.
  function summarizePolicy(text) {
    const t = String(text || "").toLowerCase();
    const windowDays = findPolicyWindow(text);
    const storeCreditOnly = /(store credit|merchandise credit)/.test(t) && !/full refund|money back|refund to (your )?(original|card)/.test(t);
    const restockingFee = /restocking fee/.test(t);
    const finalSale = /final sale|no returns|all sales final|cannot be returned/.test(t);
    const nonRefundable = /non-?refundable/.test(t);
    const fullRefund = /full refund|money[- ]back guarantee|refund to (your )?(original|card)/.test(t);

    const flags = [];
    if (finalSale) flags.push("Some or all items may be final sale (non-returnable).");
    if (nonRefundable) flags.push("Policy mentions non-refundable items — check if yours qualifies.");
    if (restockingFee) flags.push("A restocking fee may apply.");
    if (storeCreditOnly) flags.push("Refunds may be store credit only, not cash back.");

    return {
      windowDays,
      fullRefund,
      storeCreditOnly,
      restockingFee,
      finalSale,
      nonRefundable,
      // A one-line takeaway the UI can show verbatim.
      summary:
        (windowDays ? `${windowDays}-day window. ` : "No explicit window found — ask the merchant. ") +
        (fullRefund ? "Full refund to original payment is referenced. " : "") +
        (flags.length ? "Catches: " + flags.join(" ") : "No obvious catches found."),
      flags,
    };
  }

  // --- DOM wrapper (browser-only, thin, not unit-tested) --------------------
  // Find likely policy sources on the current page: links/sections whose text
  // or href signals a return/refund policy. Returns candidate {source, text}.
  function findPolicyOnPage() {
    if (typeof document === "undefined") return [];
    const out = [];
    const linkRe = /(return|refund|money[-\s]?back)/i;
    document.querySelectorAll("a[href]").forEach((a) => {
      const label = (a.textContent || "") + " " + (a.getAttribute("href") || "");
      if (linkRe.test(label)) out.push({ source: "link", text: (a.textContent || "").trim(), href: a.href });
    });
    // Inline policy sections on the current page.
    document.querySelectorAll("section, div, p").forEach((el) => {
      const txt = (el.innerText || el.textContent || "");
      if (txt.length > 60 && txt.length < 4000) {
        const c = classifyPolicyText(txt);
        if (c.isPolicy && c.confidence >= 0.5) out.push({ source: "inline", text: txt.trim(), summary: summarizePolicy(txt) });
      }
    });
    return out.slice(0, 10);
  }

  const api = { POLICY_KEYWORDS, classifyPolicyText, findPolicyWindow, summarizePolicy, findPolicyOnPage };
  if (typeof window !== "undefined") window.SulaRefundPolicy = api;

  // Let the popup request the on-page policy read (this runs in the content
  // script's DOM context; the popup can't reach the page directly).
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.action === "sula:getPolicy") {
        try { sendResponse({ policies: findPolicyOnPage() }); } catch (_) { sendResponse({ policies: [] }); }
        return true;
      }
      return false;
    });
  }
})();
