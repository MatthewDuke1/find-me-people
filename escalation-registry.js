// Sula — Stage 3 escalation registry (regulatory routing).
//
// A small, hand-curated CATEGORY -> AGENCY mapping — deliberately NOT a
// per-company database (see docs/escalation-ladder-scope.md: that's the
// Elliott.org model, and it's the same "don't build a database" trap the
// SWOT already ruled out for Stage 2). This is the same scale and
// maintenance model as content.js's SITE_OVERRIDES: a couple dozen
// hand-verified entries, dated, expanded only as real gaps are found.
//
// HARD RULE: category selection is a SUGGESTION for the user to confirm or
// change — never auto-decided and never auto-filed. Misrouting a complaint
// wastes the user's time and is exactly the kind of autonomous-action
// overreach the consumer-advocacy strategy doc rules out (see the DoNotPay
// lesson). suggestCategories() below only ranks candidates; nothing acts on
// its own.

(() => {
  "use strict";

  // Every `url` below was verified against the agency's own site. Re-verify
  // periodically — government complaint portals do reorganize their URLs.
  const CATEGORY_REGISTRY = [
    {
      id: "banking",
      label: "Banking, credit, loans, debt collection",
      agency: "Consumer Financial Protection Bureau (CFPB)",
      url: "https://www.consumerfinance.gov/complaint/",
      whatTheyHandle:
        "Checking/savings accounts, credit cards, credit reporting, debt collection, " +
        "money transfers, mortgages, payday/title/personal loans, student loans, vehicle loans.",
      filingTips:
        "CFPB forwards your complaint to the company and requires a response, typically " +
        "within 15 days. Be factual and specific about dates, amounts, and what resolution you want.",
      lastVerified: "2026-07-31",
    },
    {
      id: "fraud_scams",
      label: "Scams, fraud, deceptive business practices",
      agency: "Federal Trade Commission (FTC) — Report Fraud",
      url: "https://reportfraud.ftc.gov/",
      whatTheyHandle:
        "Scams, identity theft, fake charities, deceptive advertising, fraudulent billing.",
      filingTips:
        "The FTC does not resolve individual cases directly, but complaints feed law-enforcement " +
        "patterns. Pair this with a direct complaint to the company or your state AG for individual resolution.",
      lastVerified: "2026-07-31",
    },
    {
      id: "general_business",
      label: "General unfair or deceptive business practice (non-fraud)",
      agency: "Federal Trade Commission (FTC) — General Complaint",
      url: "https://www.ftc.gov/complaint",
      whatTheyHandle: "Unfair or deceptive practices that aren't outright fraud.",
      filingTips: "Use reportfraud.ftc.gov instead if the issue involves a scam or intentional deception.",
      lastVerified: "2026-07-31",
    },
    {
      id: "telecom",
      label: "Phone, internet, cable, robocalls, carrier billing",
      agency: "Federal Communications Commission (FCC)",
      url: "https://consumercomplaints.fcc.gov/",
      whatTheyHandle: "Telecom billing disputes, unwanted robocalls/texts, service issues, carrier disputes.",
      filingTips: "Have your account number and a call/text log (dates, numbers) ready before filing.",
      lastVerified: "2026-07-31",
    },
    {
      id: "airline_travel",
      label: "Airlines, air travel",
      agency: "US DOT — Aviation Consumer Protection",
      url: "https://airconsumer.dot.gov/consumer",
      whatTheyHandle:
        "Flight cancellations/delays, denied boarding, baggage, refunds, accessibility issues on flights.",
      filingTips:
        "File with the airline first — DOT generally expects you've given the airline a chance to " +
        "respond before escalating, though filing directly is always allowed.",
      lastVerified: "2026-07-31",
    },
    {
      id: "insurance",
      label: "Insurance (auto, home, health, life)",
      agency: "Your state Department of Insurance",
      url: "https://www.usa.gov/state-consumer",
      whatTheyHandle: "Claim denials, delayed payouts, policy disputes, agent/broker misconduct.",
      filingTips:
        "Insurance regulation is state-by-state — there is no single national filing portal. " +
        "Use the link above to find your state's insurance regulator.",
      lastVerified: "2026-07-31",
    },
    {
      id: "general_retail",
      label: "General retail, e-commerce, services",
      agency: "Better Business Bureau (BBB)",
      url: "https://www.bbb.org/file-a-complaint",
      whatTheyHandle: "Product/service disputes, warranty issues, refund disputes with a registered business.",
      filingTips: "BBB complaints go to the business and are public — often prompts faster resolution than direct contact alone.",
      lastVerified: "2026-07-31",
    },
    {
      id: "other",
      label: "Unsure / something else",
      agency: "Your state Attorney General — Consumer Protection",
      url: "https://www.usa.gov/state-attorney-general",
      whatTheyHandle: "General consumer-protection catch-all when no federal agency clearly applies.",
      filingTips: "Most state AG offices have a dedicated consumer-complaint division separate from criminal matters.",
      lastVerified: "2026-07-31",
    },
  ];

  function listCategories() {
    return CATEGORY_REGISTRY.map(({ id, label }) => ({ id, label }));
  }

  function getCategoryEntry(id) {
    return CATEGORY_REGISTRY.find((c) => c.id === id) || null;
  }

  // Lightweight SUGGESTION only — ranks likely categories from simple domain
  // keyword signals. Never returns a single decided answer; the UI must
  // always let the user confirm or pick a different one. Order in the
  // returned array is "most likely first," nothing more.
  const DOMAIN_HINTS = [
    { pattern: /bank|credit ?union|lending|loan|mortgage/i, id: "banking" },
    { pattern: /insurance|insur\b/i, id: "insurance" },
    { pattern: /air(lines?)?\b|airways|aviation/i, id: "airline_travel" },
    { pattern: /telecom|wireless|mobile|broadband|cable|internet/i, id: "telecom" },
  ];

  function suggestCategories(domainOrCompanyName) {
    const s = String(domainOrCompanyName || "").toLowerCase();
    const matched = DOMAIN_HINTS.filter((h) => h.pattern.test(s)).map((h) => h.id);
    const rest = CATEGORY_REGISTRY.map((c) => c.id).filter((id) => !matched.includes(id));
    return [...matched, ...rest]; // matched hints first, then everything else, "other" naturally last
  }

  window.SulaEscalationRegistry = {
    listCategories,
    getCategoryEntry,
    suggestCategories,
  };
})();
