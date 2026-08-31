// Sula — Checkout signals (pure, DOM-free).
//
// The detection brain for Checkout Guard (docs/checkout-guard-scope.md). Given a
// page's url + title + a text sample, decide whether this is a *pre-purchase*
// checkout page — and separately, whether the page describes an auto-renewing
// charge. Both are pure functions so they unit-test without a DOM.
//
// The hard constraint: checkout (before you pay) must NOT fire on an
// order-confirmation page (after you pay) — that post-purchase moment belongs to
// refund-moment-detector.js. So classifyCheckout requires a checkout signal AND
// the absence of a strong post-purchase signal.
//
// window.SulaCheckoutSignals

(() => {
  "use strict";

  // --- checkout (pre-purchase) signals -------------------------------------
  const URL_SIGNALS = [
    { re: /\/(checkout|payment|place-?order|review-?order)\b/i, weight: 2 },
    { re: /\/(secure|order)\/(checkout|payment)\b/i, weight: 2 },
    { re: /\/(cart|bag|basket)\b/i, weight: 1 }, // cart alone is weak — pre-checkout
  ];

  const TEXT_SIGNALS = [
    { re: /place (your )?order|complete (your )?purchase|proceed to (payment|checkout)/i, weight: 2 },
    { re: /you (will|'ll) be charged|by placing your order|authori[sz]e (this )?payment/i, weight: 2 },
    { re: /order total|order summary|payment method|billing address|card number/i, weight: 1 },
    { re: /shipping address|promo code|apply coupon/i, weight: 1 },
  ];

  // --- post-purchase (order-confirmation) signals: these VETO checkout -------
  // If the page is clearly a receipt / confirmation, it's the refund flow's
  // job, not Checkout Guard's.
  const POST_PURCHASE_SIGNALS = [
    /thank you for your (order|purchase)/i,
    /your order (is )?(confirmed|has been placed|number)/i,
    /order confirmation|order #?\d{4,}|confirmation number/i,
    /we('| ha)ve received your order|a receipt (has been|was) sent/i,
    /\/(order-confirmation|thank-?you|receipt)\b/i, // URL form
  ];

  const CHECKOUT_THRESHOLD = 2; // one strong signal, or two weak

  // Decide if the page is a pre-purchase checkout. Pure.
  // Returns { isCheckout, score, signals[], vetoed }.
  function classifyCheckout(input) {
    const url = String((input && input.url) || "");
    const title = String((input && input.title) || "");
    const bodyText = String((input && input.bodyText) || "");
    const hay = (title + " " + bodyText);

    // Post-purchase veto first — a confirmation page is never "checkout".
    const vetoed = POST_PURCHASE_SIGNALS.some((re) => re.test(url) || re.test(hay));

    let score = 0;
    const signals = [];
    for (const s of URL_SIGNALS) {
      if (s.re.test(url)) { score += s.weight; signals.push({ kind: "url", weight: s.weight }); }
    }
    for (const s of TEXT_SIGNALS) {
      if (s.re.test(hay)) { score += s.weight; signals.push({ kind: "text", weight: s.weight }); }
    }

    const isCheckout = !vetoed && score >= CHECKOUT_THRESHOLD;
    return { isCheckout, score, signals, vetoed };
  }

  // --- auto-renewal scan ----------------------------------------------------
  // Detect language that means this purchase will recur / auto-convert. Returns
  // { autoRenew, phrase } where phrase is the matched snippet (for the card).
  // This is also the seed for Auto-renew Radar (roadmap daily #2).
  const AUTO_RENEW_RE =
    /(auto-?renew(s|al|ing)?|automatically renew|renews? (automatically|every|each|monthly|annually|yearly)|recurring (payment|charge|billing|subscription)|until (you )?cancel|cancel any ?time|free trial(,)? then|after (your )?(free )?trial|then \$?\d)/i;

  function scanAutoRenew(text) {
    const t = String(text || "");
    const m = t.match(AUTO_RENEW_RE);
    if (!m) return { autoRenew: false, phrase: "" };
    // Return a short, trimmed snippet around the match for display.
    const idx = m.index || 0;
    const snippet = t.slice(Math.max(0, idx - 8), idx + m[0].length + 24).trim();
    return { autoRenew: true, phrase: snippet.replace(/\s+/g, " ") };
  }

  // --- restocking / final-sale flags ---------------------------------------
  // Surface catches present in policy/checkout text. Returns an array of short
  // labels (never invents — only what's literally present).
  const FLAG_TERMS = [
    { re: /restocking fee/i, label: "Restocking fee" },
    { re: /final sale/i, label: "Final sale — no returns" },
    { re: /non-?refundable|no refunds?/i, label: "Non-refundable" },
    { re: /no returns?|not returnable/i, label: "No returns" },
    { re: /store credit only/i, label: "Store credit only" },
  ];

  function scanFlags(text) {
    const t = String(text || "");
    const out = [];
    for (const f of FLAG_TERMS) {
      if (f.re.test(t) && !out.includes(f.label)) out.push(f.label);
    }
    return out;
  }

  const api = {
    classifyCheckout,
    scanAutoRenew,
    scanFlags,
    URL_SIGNALS,
    TEXT_SIGNALS,
    POST_PURCHASE_SIGNALS,
    CHECKOUT_THRESHOLD,
  };
  if (typeof window !== "undefined") window.SulaCheckoutSignals = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
