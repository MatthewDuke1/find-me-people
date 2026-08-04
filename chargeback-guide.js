// Sula — Chargeback guidance.
//
// The chargeback is often the strongest refund lever, but it is a CONSIDERED
// step, not a first resort: issuers can close accounts over frivolous
// disputes, and networks expect you to try the merchant first. This module
// (a) tells the user whether a chargeback is appropriate yet, (b) gives the
// steps for their card issuer, (c) supplies the network reason-code framing.
//
// Information, not advice. Pure logic — window.SulaChargebackGuide.

(() => {
  "use strict";

  // Readiness gate: encode the "try the merchant first" norm so Sula never
  // nudges someone into a premature chargeback.
  function assessReadiness(state) {
    const s = state || {};
    const reasons = [];
    if (!s.contactedMerchant) reasons.push("You haven't contacted the merchant yet — networks and issuers expect a good-faith attempt first.");
    if (s.contactedMerchant && !s.merchantRespondedNo && !s.merchantIgnoredDays)
      reasons.push("Give the merchant a reasonable chance to respond before disputing.");
    const merchantExhausted =
      s.merchantRespondedNo || (typeof s.merchantIgnoredDays === "number" && s.merchantIgnoredDays >= 7);
    const ready = !!s.contactedMerchant && merchantExhausted;
    return {
      ready,
      recommendation: ready
        ? "A chargeback is now a reasonable next step — you contacted the merchant and it wasn't resolved."
        : "Hold off on a chargeback for now.",
      reasons,
    };
  }

  // Common Visa/Mastercard consumer dispute reason categories (plain-language).
  const REASON_CATEGORIES = [
    { id: "not_received", label: "Goods/services not received" },
    { id: "not_as_described", label: "Not as described / defective" },
    { id: "unauthorized", label: "Fraud / unauthorized transaction" },
    { id: "duplicate", label: "Duplicate processing" },
    { id: "credit_not_processed", label: "Refund/credit promised but not processed" },
    { id: "canceled_recurring", label: "Canceled recurring transaction still billed" },
  ];

  // Per-issuer dispute entry points. URLs/phone paths change — treated as
  // "typical path, verify on your statement." Kept to the majors + a generic.
  const ISSUERS = {
    generic: {
      label: "Your card issuer",
      how: "Log in to your card's website or app, open the transaction, and choose 'Dispute' — or call the number on the back of your card.",
    },
    chase: { label: "Chase", how: "chase.com or the Chase app → the transaction → 'Dispute transaction'. Or call the number on your card." },
    amex: { label: "American Express", how: "americanexpress.com or the Amex app → the charge → 'Dispute charge'. Amex disputes are notably fast." },
    bofa: { label: "Bank of America", how: "bankofamerica.com or the app → transaction details → 'Dispute this transaction'." },
    citi: { label: "Citi", how: "citi.com or the Citi app → the transaction → 'Dispute'." },
    capitalone: { label: "Capital One", how: "capitalone.com or the app → the transaction → 'Report a problem' / 'Dispute'." },
    wellsfargo: { label: "Wells Fargo", how: "wellsfargo.com or the app → transaction → 'Dispute a transaction'." },
  };

  function issuerSteps(issuerId) {
    const iss = ISSUERS[issuerId] || ISSUERS.generic;
    return {
      issuer: iss.label,
      steps: [
        iss.how,
        "Select the reason that matches your situation (see categories).",
        "State that you attempted to resolve it with the merchant and it was not resolved.",
        "Attach evidence: order confirmation, the refund request you sent, and any reply (or note the silence).",
        "Note the deadline — card-network windows are typically ~120 days from the transaction; sooner is safer.",
      ],
      note: "Exact wording and menu paths vary and change; if you don't see 'Dispute', call the number on the back of your card.",
    };
  }

  function listIssuers() {
    return Object.entries(ISSUERS).map(([id, i]) => ({ id, label: i.label }));
  }

  const api = { assessReadiness, issuerSteps, listIssuers, REASON_CATEGORIES, ISSUERS };
  if (typeof window !== "undefined") window.SulaChargebackGuide = api;
})();
