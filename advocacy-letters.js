// Sula — advocacy letter studio (Pro).
//
// Generates the TEXT of consumer-advocacy letters the user sends THEMSELVES:
// executive escalation (EECB-style), cancellation requests, refund demands,
// and regulatory-complaint narratives. This is a reframing of the shipped
// "Draft Outreach" feature for the consumer-advocacy positioning
// (docs/consumer-advocacy-strategy.md), NOT a new outbound-sales tool.
//
// HARD GUARDRAILS (the DoNotPay lesson — see docs/pro-feature-roadmap.md):
//   1. Never claim Sula acts, files, negotiates, or represents. The user
//      sends every letter themselves. Copy is written in the user's first
//      person ("I am writing to..."), never Sula's.
//   2. Never assert legal entitlement as fact ("you are legally required
//      to..."). Use requestful, factual framing.
//   3. Never promise an outcome.
// assertNoProhibitedClaims() below enforces #2 at generation time so a bad
// template edit can't silently ship a legal-sounding assertion.
//
// Pure/DOM-free: takes a context object, returns { subject, body }. Testable
// in Node via the shared pure-helper harness.

(() => {
  "use strict";

  // Phrases that assert legal entitlement or promise outcomes — banned from
  // generated bodies. Kept deliberately blunt; the point is a hard tripwire,
  // not nuanced NLP.
  const PROHIBITED_PATTERNS = [
    /you are (?:legally )?required to/i,
    /you are legally obligated/i,
    /i am legally entitled/i,
    /this is illegal/i,
    /i will win/i,
    /you will be sued/i,
    /guaranteed refund/i,
  ];

  function assertNoProhibitedClaims(text) {
    for (const re of PROHIBITED_PATTERNS) {
      if (re.test(text)) {
        throw new Error(
          "advocacy-letters: generated text contains a prohibited legal/outcome " +
            `claim (matched ${re}). This violates the DoNotPay guardrail — fix the template.`
        );
      }
    }
    return text;
  }

  // Small helpers — plain, no AI-slop filler (matches the project's no-puffery
  // writing rule). Every field is optional; the letter degrades gracefully.
  function line(s) {
    return s ? s + "\n" : "";
  }
  function joinNonEmpty(parts) {
    return parts.filter(Boolean).join("\n\n");
  }
  function refClause(ctx) {
    if (ctx.orderRef) return `My account/order reference is ${ctx.orderRef}.`;
    return "";
  }
  function priorAttemptsClause(ctx) {
    if (!ctx.priorAttempts) return "";
    const when = ctx.priorContactDate ? ` on ${ctx.priorContactDate}` : "";
    return (
      `I first raised this${when} through ${ctx.priorChannel || "your customer service"}, ` +
      "but the matter is still unresolved, which is why I am escalating."
    );
  }
  function desiredClause(ctx) {
    return ctx.desired
      ? `To resolve this, I am asking for the following: ${ctx.desired}.`
      : "I would like to understand what resolution you can offer.";
  }

  // ── Letter builders — each returns { subject, body } ──────────────────

  function executiveEscalation(ctx) {
    const greeting = ctx.contactName ? `Dear ${ctx.contactName},` : "Dear Executive Team,";
    const subject = `Escalation: unresolved issue with ${ctx.company || "your company"}${
      ctx.orderRef ? ` (ref ${ctx.orderRef})` : ""
    }`;
    const body = joinNonEmpty([
      greeting,
      priorAttemptsClause(ctx) ||
        `I am writing to you directly because I have been unable to resolve an issue with ${
          ctx.company || "your company"
        } through normal channels.`,
      ctx.issue ? `Here is what happened: ${ctx.issue}` : "",
      refClause(ctx),
      desiredClause(ctx),
      "I would appreciate a response within five business days. Thank you for your time and help.",
      ctx.senderName ? `Sincerely,\n${ctx.senderName}` : "Sincerely,",
    ]);
    return { subject, body: assertNoProhibitedClaims(body) };
  }

  function cancellationRequest(ctx) {
    const subject = `Cancellation request — ${ctx.company || "my subscription"}${
      ctx.orderRef ? ` (${ctx.orderRef})` : ""
    }`;
    const body = joinNonEmpty([
      ctx.contactName ? `Dear ${ctx.contactName},` : "Hello,",
      `I am writing to cancel my subscription/service with ${ctx.company || "your company"}, ` +
        "effective at the end of the current billing period.",
      refClause(ctx),
      "Please confirm the cancellation in writing, including the effective date and that no " +
        "further charges will be made. If any early-termination terms apply, please itemize them.",
      ctx.senderName ? `Thank you,\n${ctx.senderName}` : "Thank you,",
    ]);
    return { subject, body: assertNoProhibitedClaims(body) };
  }

  function refundDemand(ctx) {
    const subject = `Refund request — ${ctx.company || "recent charge"}${
      ctx.orderRef ? ` (${ctx.orderRef})` : ""
    }`;
    const body = joinNonEmpty([
      ctx.contactName ? `Dear ${ctx.contactName},` : "Hello,",
      `I am requesting a refund from ${ctx.company || "your company"}.`,
      ctx.issue ? `Reason: ${ctx.issue}` : "",
      refClause(ctx),
      priorAttemptsClause(ctx),
      ctx.amount ? `The amount in question is ${ctx.amount}.` : "",
      "Please let me know how you will process this and the expected timeline. " +
        "If you are unable to refund the original payment method, please explain the alternative.",
      ctx.senderName ? `Thank you,\n${ctx.senderName}` : "Thank you,",
    ]);
    return { subject, body: assertNoProhibitedClaims(body) };
  }

  // Regulatory-complaint NARRATIVE — the factual body a user pastes into an
  // agency portal (CFPB/FTC/BBB/etc.). Deliberately neutral and factual;
  // agencies want a clear timeline, not rhetoric.
  function regulatoryComplaint(ctx) {
    const subject = `Complaint regarding ${ctx.company || "a company"}${
      ctx.agency ? ` — for ${ctx.agency}` : ""
    }`;
    const body = joinNonEmpty([
      `Company: ${ctx.company || "(company name)"}`,
      ctx.orderRef ? `Account/reference: ${ctx.orderRef}` : "",
      ctx.issue ? `What happened: ${ctx.issue}` : "What happened: (describe the issue factually)",
      priorAttemptsClause(ctx) ||
        "Steps I have already taken: (describe any prior contact with the company)",
      desiredClause(ctx),
      "I am submitting this so the matter is on record and, where applicable, reviewed by the " +
        "appropriate office.",
    ]);
    return { subject, body: assertNoProhibitedClaims(body) };
  }

  const LETTER_TYPES = [
    { id: "executive_escalation", label: "Executive escalation (EECB)", build: executiveEscalation },
    { id: "cancellation", label: "Cancellation request", build: cancellationRequest },
    { id: "refund", label: "Refund request", build: refundDemand },
    { id: "regulatory", label: "Regulatory complaint narrative", build: regulatoryComplaint },
  ];

  function listLetterTypes() {
    return LETTER_TYPES.map(({ id, label }) => ({ id, label }));
  }

  function buildLetter(typeId, ctx) {
    const t = LETTER_TYPES.find((x) => x.id === typeId);
    if (!t) throw new Error(`advocacy-letters: unknown letter type "${typeId}"`);
    return t.build(ctx || {});
  }

  const api = { listLetterTypes, buildLetter, assertNoProhibitedClaims };
  if (typeof window !== "undefined") window.SulaAdvocacyLetters = api;
})();
