// Sula — Subscription Guardian data model (Pro, "Cancellation Vault").
//
// The recurring-revenue flagship (docs/pro-feature-roadmap.md A1): passively
// track a user's subscriptions and surface each renewal BEFORE it charges,
// with the verified cancellation contact ready. Rides the FTC Click-to-Cancel
// tailwind.
//
// THIS FILE is the pure data model + date math ONLY — no storage side effects,
// no chrome.alarms (that permission-gated wiring is a documented follow-up in
// docs/escalation-ladder-scope.md and the roadmap). Every function takes `now`
// as an explicit argument rather than reading the clock, so the logic is
// deterministic and unit-testable; the extension passes Date.now() at the call
// site. Storage stays local by default (the anti-Rocket-Money posture: no bank
// linking, no server-side aggregation).

(() => {
  "use strict";

  const CADENCES = {
    weekly: 7,
    monthly: 30, // calendar-month handled below; 30 is the fallback for "days" math
    quarterly: 91,
    annual: 365,
  };

  function isValidCadence(cadence) {
    return Object.prototype.hasOwnProperty.call(CADENCES, cadence);
  }

  // Add days to an epoch-ms timestamp. Pure.
  function addDays(ms, days) {
    return ms + days * 24 * 60 * 60 * 1000;
  }

  // Next renewal date at or after `now`, given a start date and cadence.
  // For monthly/quarterly/annual we advance by calendar months where possible
  // (so a Jan-31 start lands sensibly), falling back to day-count for weekly.
  // Returns an epoch-ms timestamp.
  function computeRenewalDate(startMs, cadence, nowMs) {
    if (!isValidCadence(cadence)) throw new Error(`unknown cadence: ${cadence}`);
    if (typeof startMs !== "number" || typeof nowMs !== "number") {
      throw new Error("computeRenewalDate needs numeric epoch-ms for startMs and nowMs");
    }
    if (cadence === "weekly") {
      let next = startMs;
      while (next <= nowMs) next = addDays(next, CADENCES.weekly);
      return next;
    }
    const monthsPerStep = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12;
    const start = new Date(startMs);
    const anchorDay = start.getUTCDate();
    let candidate = new Date(startMs);
    // Advance whole steps until strictly after now.
    let guard = 0;
    while (candidate.getTime() <= nowMs && guard < 10000) {
      const m = candidate.getUTCMonth() + monthsPerStep;
      candidate = new Date(Date.UTC(candidate.getUTCFullYear(), m, 1));
      // Clamp to the anchor day, handling short months (e.g. Feb).
      const daysInMonth = new Date(
        Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0)
      ).getUTCDate();
      candidate.setUTCDate(Math.min(anchorDay, daysInMonth));
      guard++;
    }
    return candidate.getTime();
  }

  // Whole days until the next renewal (can be 0 today; never negative for a
  // correctly-computed next renewal). Rounds down.
  function daysUntilRenewal(sub, nowMs) {
    const next = computeRenewalDate(sub.startMs, sub.cadence, nowMs);
    return Math.floor((next - nowMs) / (24 * 60 * 60 * 1000));
  }

  // Is a renewal-reminder due? True when the next renewal is within `leadDays`
  // (default 3) and not already past. This is the signal the (future)
  // chrome.alarms layer will act on.
  function dueForReminder(sub, nowMs, leadDays) {
    const lead = typeof leadDays === "number" ? leadDays : 3;
    const d = daysUntilRenewal(sub, nowMs);
    return d >= 0 && d <= lead;
  }

  // Normalize + validate a subscription record before it goes into storage.
  // Returns { ok, sub } or { ok:false, error }.
  function normalizeSubscription(input) {
    if (!input || typeof input !== "object") return { ok: false, error: "not_an_object" };
    if (!input.company) return { ok: false, error: "missing_company" };
    if (!isValidCadence(input.cadence)) return { ok: false, error: "invalid_cadence" };
    if (typeof input.startMs !== "number") return { ok: false, error: "invalid_startMs" };
    return {
      ok: true,
      sub: {
        company: String(input.company),
        domain: input.domain ? String(input.domain) : null,
        amount: input.amount ? String(input.amount) : null,
        cadence: input.cadence,
        startMs: input.startMs,
        cancelUrl: input.cancelUrl ? String(input.cancelUrl) : null,
        cancelContact: input.cancelContact ? String(input.cancelContact) : null,
        addedMs: typeof input.addedMs === "number" ? input.addedMs : input.startMs,
      },
    };
  }

  // Given a list of subscriptions, return those renewing within `days`,
  // sorted soonest-first. Pure — the UI layer decides how to render/nudge.
  function renewalsDueWithin(list, nowMs, days) {
    return (list || [])
      .map((s) => ({ sub: s, days: daysUntilRenewal(s, nowMs) }))
      .filter((x) => x.days >= 0 && x.days <= days)
      .sort((a, b) => a.days - b.days);
  }

  const api = {
    CADENCES,
    isValidCadence,
    computeRenewalDate,
    daysUntilRenewal,
    dueForReminder,
    normalizeSubscription,
    renewalsDueWithin,
  };
  if (typeof window !== "undefined") window.SulaSubscriptionGuardian = api;
})();
