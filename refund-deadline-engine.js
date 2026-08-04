// Sula — Refund/dispute deadline & eligibility engine.
//
// The sleeper feature of the refund pipeline: most refunds are lost not to a
// "no" but to a missed window. This engine takes a charge date and tells the
// user, per remedy, how many days remain and which options are still open.
//
// It is INFORMATION, not legal advice: these are the well-known statutory /
// card-network windows, surfaced so the user acts before they close. Windows
// vary by issuer, network, and jurisdiction — the notes say so, and the UI
// should present them as "typical / verify with your provider," never as a
// guarantee. Pure logic, no DOM, no network — fully testable.
//
// Exposes window.SulaRefundDeadlines. `today` is always injectable so tests
// are deterministic; the live extension passes new Date().

(() => {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;

  // Remedy windows. `days` counts from the anchor date. Where a real range
  // exists, we use the conservative (shorter) figure so we never tell a user
  // they have more time than they safely do, and flag the range in `note`.
  const REMEDIES = [
    {
      id: "fcba_billing_dispute",
      label: "Credit-card billing dispute (FCBA)",
      days: 60,
      anchor: "statement", // 60 days from the statement showing the error
      appliesTo: ["credit"],
      note: "Federal law (Fair Credit Billing Act): dispute billing errors within 60 days of the statement date. Written dispute to the card issuer.",
    },
    {
      id: "reg_e_debit_dispute",
      label: "Debit-card error dispute (Reg E)",
      days: 60,
      anchor: "statement",
      appliesTo: ["debit"],
      note: "Reg E: report unauthorized/erroneous debit charges within 60 days of the statement. Report sooner (within 2 days) for the strongest liability protection.",
    },
    {
      id: "chargeback",
      label: "Card chargeback (network rules)",
      days: 120,
      anchor: "transaction", // most Visa/MC reason codes: 120 days from transaction
      appliesTo: ["credit", "debit"],
      note: "Card-network chargeback windows are typically ~120 days from the transaction (some reason codes allow up to 540). Confirm with your card issuer — this is a network rule, not a statute.",
    },
    {
      id: "merchant_return",
      label: "Merchant return window",
      days: 30,
      anchor: "transaction",
      appliesTo: ["credit", "debit", "other"],
      note: "Default 30-day assumption — the merchant's own policy is authoritative. If Sula extracted their policy, use that number instead.",
    },
  ];

  function toDate(d) {
    if (d instanceof Date) return d;
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function daysBetween(from, to) {
    // Whole days from `from` to `to` (positive if `to` is later).
    return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
  }

  // Core: given an anchor date and payment type, return each remedy with its
  // deadline, days remaining, and expiry status. `overrides` lets a caller
  // swap in a real number (e.g. a merchant return window Sula extracted).
  function computeDeadlines(anchorDateInput, opts) {
    const options = opts || {};
    const paymentType = options.paymentType || "credit"; // credit | debit | other
    const today = toDate(options.today || new Date());
    const anchor = toDate(anchorDateInput);
    if (!anchor || !today) return { ok: false, reason: "bad_date", remedies: [] };

    const overrides = options.overrides || {}; // { merchant_return: 45, ... }

    const remedies = REMEDIES.filter((r) => r.appliesTo.includes(paymentType)).map((r) => {
      const windowDays = typeof overrides[r.id] === "number" ? overrides[r.id] : r.days;
      const deadline = new Date(anchor.getTime() + windowDays * DAY_MS);
      const daysLeft = daysBetween(today, deadline);
      return {
        id: r.id,
        label: r.label,
        windowDays,
        deadline: deadline.toISOString().slice(0, 10),
        daysLeft,
        expired: daysLeft < 0,
        urgency: daysLeft < 0 ? "expired" : daysLeft <= 7 ? "urgent" : daysLeft <= 21 ? "soon" : "ok",
        note: r.note,
      };
    });

    // Sort: still-open first, soonest deadline first; expired sink to the bottom.
    remedies.sort((a, b) => {
      if (a.expired !== b.expired) return a.expired ? 1 : -1;
      return a.daysLeft - b.daysLeft;
    });

    const open = remedies.filter((r) => !r.expired);
    return {
      ok: true,
      paymentType,
      anchorDate: anchor.toISOString().slice(0, 10),
      remedies,
      soonest: open.length ? open[0] : null,
      anyOpen: open.length > 0,
    };
  }

  // Pull a plausible charge date out of free page text (order pages, receipts,
  // statements). Returns an ISO date string or null. Deliberately conservative:
  // recognizes common explicit formats near money/order keywords rather than
  // grabbing any date on the page.
  const MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  function parseChargeDate(text) {
    if (!text) return null;
    const t = String(text);

    // ISO: 2026-08-01
    let m = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (m) return normalize(+m[1], +m[2] - 1, +m[3]);

    // US: 08/01/2026 or 8/1/26
    m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})\b/);
    if (m) {
      const yr = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return normalize(yr, +m[1] - 1, +m[2]);
    }

    // "August 1, 2026" / "Aug 1 2026"
    m = t.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/);
    if (m) {
      const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
      if (mon != null) return normalize(+m[3], mon, +m[2]);
    }
    return null;
  }

  function normalize(y, mIdx, d) {
    if (mIdx < 0 || mIdx > 11 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, mIdx, d));
    return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
  }

  const api = { REMEDIES, computeDeadlines, parseChargeDate };
  if (typeof window !== "undefined") window.SulaRefundDeadlines = api;
})();
