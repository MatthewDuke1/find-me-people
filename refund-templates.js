// Sula — Refund-request template library.
//
// Scenario-specific refund letters that bake in the actual leverage (the
// merchant's own policy, statutory rights, chargeback threat, regulator) so a
// user's first request already carries weight. The DIFFERENTIATOR boundary:
// Sula DRAFTS; the user sends. No "we act for you," no fee on the refund.
//
// Each template is a function of a small facts object → { subject, body,
// leverage[] }. Placeholders the user must confirm are left as {{BRACES}} in
// the output, never invented. Pure logic, no DOM/network — window.SulaRefundTemplates.

(() => {
  "use strict";

  // Reusable leverage clauses, referenced by scenarios. Kept factual and
  // non-threatening; the tone escalates only where the situation warrants.
  const LEVERAGE = {
    fcba: "Under the Fair Credit Billing Act, I am entitled to dispute billing errors on my credit card. I am exercising that right.",
    policy: "Your own published refund policy states {{POLICY_TERMS}}, which covers this purchase.",
    chargeback: "If this is not resolved, I will file a dispute (chargeback) with my card issuer.",
    negative_option: "Under the FTC's rules on negative-option billing, cancellation must be as simple as sign-up, and charges after cancellation are improper.",
    cfpb: "If unresolved, I will file a complaint with the Consumer Financial Protection Bureau.",
    not_as_described: "The product/service was not as described at the point of sale.",
  };

  function base(facts, subject, opening, asks, leverageKeys) {
    const f = facts || {};
    const company = f.company || "{{COMPANY}}";
    const order = f.orderId || "{{ORDER_ID}}";
    const amount = f.amount || "{{AMOUNT}}";
    const date = f.date || "{{DATE}}";
    const name = f.name || "{{YOUR_NAME}}";
    const leverage = (leverageKeys || []).map((k) => LEVERAGE[k]).filter(Boolean);
    const body = [
      `To ${company} Support,`,
      "",
      opening
        .replace(/{{ORDER_ID}}/g, order)
        .replace(/{{AMOUNT}}/g, amount)
        .replace(/{{DATE}}/g, date),
      // Carry the order reference even when the chosen template's opening does
      // not mention it. QA supplied order QA-001 and it was dropped from the
      // letter entirely, which makes the request harder for the merchant to
      // action (SULA-008). Only emitted when the user actually gave one.
      ...(f.orderId ? [`Order/reference: ${f.orderId}`] : []),
      "",
      asks
        .replace(/{{ORDER_ID}}/g, order)
        .replace(/{{AMOUNT}}/g, amount)
        .replace(/{{DATE}}/g, date),
      "",
      ...(leverage.length ? [leverage.join(" "), ""] : []),
      "Please confirm the refund in writing. I can be reached at {{YOUR_EMAIL}}.",
      "",
      "Regards,",
      name,
    ].join("\n");
    return { subject: subject.replace(/{{ORDER_ID}}/g, order), body, leverage: leverageKeys || [] };
  }

  const SCENARIOS = {
    unauthorized_charge: {
      label: "Unauthorized / unrecognized charge",
      build: (f) =>
        base(
          f,
          "Unauthorized charge — refund request (Order {{ORDER_ID}})",
          "I am writing about a charge of {{AMOUNT}} dated {{DATE}} that I did not authorize and do not recognize.",
          "Please reverse this charge in full and confirm no further charges will be made.",
          ["fcba", "chargeback"]
        ),
    },
    duplicate_charge: {
      label: "Duplicate / double charge",
      build: (f) =>
        base(
          f,
          "Duplicate charge — refund request (Order {{ORDER_ID}})",
          "I was charged {{AMOUNT}} more than once for order {{ORDER_ID}} on {{DATE}}.",
          "Please refund the duplicate charge and confirm the corrected total.",
          ["fcba"]
        ),
    },
    defective_product: {
      label: "Defective / damaged product",
      build: (f) =>
        base(
          f,
          "Defective item — refund request (Order {{ORDER_ID}})",
          "The item from order {{ORDER_ID}} ({{AMOUNT}}, {{DATE}}) arrived defective/damaged.",
          "Please issue a full refund. I am happy to provide photos and return the item per your return process.",
          ["policy", "not_as_described"]
        ),
    },
    not_as_described: {
      label: "Not as described",
      build: (f) =>
        base(
          f,
          "Item not as described — refund request (Order {{ORDER_ID}})",
          "The product/service from order {{ORDER_ID}} ({{AMOUNT}}, {{DATE}}) materially differs from how it was described at purchase.",
          "Please refund this order in full.",
          ["policy", "not_as_described", "chargeback"]
        ),
    },
    trial_auto_renewed: {
      label: "Free trial auto-renewed",
      build: (f) =>
        base(
          f,
          "Free-trial charge — refund request",
          "I was charged {{AMOUNT}} on {{DATE}} when a free trial auto-renewed. I did not intend to continue the paid service.",
          "Please cancel the subscription and refund this charge.",
          ["negative_option", "chargeback"]
        ),
    },
    cancelled_still_charged: {
      label: "Cancelled but still charged",
      build: (f) =>
        base(
          f,
          "Charge after cancellation — refund request",
          // The only date collected is the CHARGE date. The previous wording
          // ("before the renewal on {{DATE}}") presented it as the renewal
          // date, so the letter asserted a cancellation timeline the user
          // never gave (QA SULA-008). State only what we actually know.
          "I cancelled this subscription, but was still charged {{AMOUNT}} on {{DATE}}.",
          // "confirm the account is closed" was an instruction the user never
          // gave — asking a merchant to close an account is a materially
          // different request from asking for a refund (QA SULA-008).
          "Please refund the post-cancellation charge and confirm the cancellation date you have on record.",
          ["negative_option", "chargeback", "cfpb"]
        ),
    },
    price_drop: {
      label: "Price-drop / price-match",
      build: (f) =>
        base(
          f,
          "Price adjustment request (Order {{ORDER_ID}})",
          "I purchased order {{ORDER_ID}} for {{AMOUNT}} on {{DATE}}, and the price has since dropped.",
          "Please refund the difference per your price-adjustment policy.",
          ["policy"]
        ),
    },
  };

  function listScenarios() {
    return Object.entries(SCENARIOS).map(([id, s]) => ({ id, label: s.label }));
  }

  function buildLetter(scenarioId, facts) {
    const s = SCENARIOS[scenarioId];
    if (!s) return null;
    return { scenario: scenarioId, ...s.build(facts || {}) };
  }

  const api = { SCENARIOS, LEVERAGE, listScenarios, buildLetter };
  if (typeof window !== "undefined") window.SulaRefundTemplates = api;
})();
