// Sula — Refund-moment detector.
//
// Surfaces the refund tools at the right time: recognizes when the user is on
// an order/receipt page or a subscription/billing page, so Sula can offer
// "Start a refund" or "Check your cancellation" without the user knowing to
// ask. Mirrors job-contacts.js's apply-click pattern, for the refund flow.
//
// Pure classifier core (tested) + a thin DOM/location wrapper (browser-only).
// window.SulaRefundMoment.

(() => {
  "use strict";

  const URL_SIGNALS = [
    { re: /\/(order|orders|receipt|invoice|purchase|order-confirmation|thank-?you)\b/i, moment: "order", weight: 2 },
    { re: /\/(subscription|subscriptions|billing|plan|membership|manage-?subscription)\b/i, moment: "subscription", weight: 2 },
    { re: /\/account\/orders?\b/i, moment: "order", weight: 2 },
  ];

  const TEXT_SIGNALS = [
    { re: /order (confirmation|number|total|#)/i, moment: "order", weight: 2 },
    { re: /thank you for your (order|purchase)/i, moment: "order", weight: 2 },
    { re: /your receipt|order summary|items? ordered/i, moment: "order", weight: 1 },
    { re: /next billing date|billing cycle|renews on|auto-?renew/i, moment: "subscription", weight: 2 },
    { re: /manage (your )?subscription|cancel (your )?subscription/i, moment: "subscription", weight: 2 },
    { re: /current plan|your plan|membership/i, moment: "subscription", weight: 1 },
  ];

  // Pure: given the page's URL, title, and a text sample, decide the moment.
  function classifyPage(input) {
    const { url = "", title = "", bodyText = "" } = input || {};
    const scores = { order: 0, subscription: 0 };
    const signals = [];

    for (const s of URL_SIGNALS) {
      if (s.re.test(url)) { scores[s.moment] += s.weight; signals.push({ kind: "url", moment: s.moment }); }
    }
    const hay = (title + " " + bodyText);
    for (const s of TEXT_SIGNALS) {
      if (s.re.test(hay)) { scores[s.moment] += s.weight; signals.push({ kind: "text", moment: s.moment }); }
    }

    const top = scores.order >= scores.subscription ? "order" : "subscription";
    const topScore = scores[top];
    // Require at least 2 points (one strong signal, or two weak) to fire.
    const moment = topScore >= 2 ? top : "none";
    return {
      moment,
      confidence: Math.min(1, topScore / 4),
      scores,
      signals,
    };
  }

  // --- DOM/location wrapper (browser-only) ---------------------------------
  function detectMoment() {
    if (typeof document === "undefined" || typeof location === "undefined") return { moment: "none" };
    const bodyText = (document.body && (document.body.innerText || "")) || "";
    return classifyPage({
      url: location.href,
      title: document.title || "",
      bodyText: bodyText.slice(0, 5000), // cap for performance
    });
  }

  const api = { classifyPage, detectMoment, URL_SIGNALS, TEXT_SIGNALS };
  if (typeof window !== "undefined") window.SulaRefundMoment = api;
})();
