// Subscription Guardian data model (subscription-guardian.js): renewal date
// math + reminder-due logic. Pure/DOM-free. Date math is deterministic here
// because every function takes `now` as an explicit epoch-ms argument.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "subscription-guardian.js");

const {
  isValidCadence,
  computeRenewalDate,
  daysUntilRenewal,
  dueForReminder,
  normalizeSubscription,
  renewalsDueWithin,
} = loadModuleApi(SRC, "SulaSubscriptionGuardian");

// Fixed reference points (UTC) so tests are deterministic.
const JAN_15_2026 = Date.UTC(2026, 0, 15);
const JAN_31_2026 = Date.UTC(2026, 0, 31);
const DAY = 24 * 60 * 60 * 1000;

suite("isValidCadence", () => {
  test("accepts the four known cadences", () => {
    ["weekly", "monthly", "quarterly", "annual"].forEach((c) => assertTrue(isValidCadence(c)));
  });
  test("rejects unknown", () => {
    assertFalse(isValidCadence("biweekly"));
  });
});

suite("computeRenewalDate", () => {
  test("monthly: next renewal after now is one month out", () => {
    const now = Date.UTC(2026, 0, 20); // Jan 20, started Jan 15
    const next = computeRenewalDate(JAN_15_2026, "monthly", now);
    assertEq(new Date(next).getUTCMonth(), 1); // February
    assertEq(new Date(next).getUTCDate(), 15);
  });
  test("monthly: a Jan-31 start clamps to Feb 28 (2026 is not a leap year)", () => {
    const now = Date.UTC(2026, 1, 1); // Feb 1
    const next = computeRenewalDate(JAN_31_2026, "monthly", now);
    assertEq(new Date(next).getUTCMonth(), 1); // February
    assertEq(new Date(next).getUTCDate(), 28); // clamped
  });
  test("weekly: advances in 7-day steps past now", () => {
    const start = Date.UTC(2026, 0, 1);
    const now = Date.UTC(2026, 0, 10); // 9 days later
    const next = computeRenewalDate(start, "weekly", now);
    // First weekly step after Jan 10 is Jan 15 (Jan 1 + 14).
    assertEq(new Date(next).getUTCDate(), 15);
  });
  test("annual: advances a full year", () => {
    const now = Date.UTC(2026, 5, 1); // Jun 2026, started Jan 15 2026
    const next = computeRenewalDate(JAN_15_2026, "annual", now);
    assertEq(new Date(next).getUTCFullYear(), 2027);
    assertEq(new Date(next).getUTCMonth(), 0);
  });
  test("throws on an unknown cadence", () => {
    let threw = false;
    try { computeRenewalDate(JAN_15_2026, "biweekly", JAN_31_2026); } catch (_) { threw = true; }
    assertTrue(threw);
  });
});

suite("daysUntilRenewal + dueForReminder", () => {
  const sub = { company: "Acme", cadence: "monthly", startMs: JAN_15_2026 };

  test("days until the Feb 15 renewal from Feb 12 is 3", () => {
    const now = Date.UTC(2026, 1, 12);
    assertEq(daysUntilRenewal(sub, now), 3);
  });
  test("dueForReminder true at 3 days out with default lead (3)", () => {
    const now = Date.UTC(2026, 1, 12);
    assertTrue(dueForReminder(sub, now));
  });
  test("dueForReminder false at 10 days out", () => {
    const now = Date.UTC(2026, 1, 5);
    assertFalse(dueForReminder(sub, now));
  });
  test("dueForReminder respects a custom lead window", () => {
    const now = Date.UTC(2026, 1, 5); // 10 days out
    assertTrue(dueForReminder(sub, now, 14));
  });
});

suite("normalizeSubscription", () => {
  test("accepts a valid record and fills defaults", () => {
    const r = normalizeSubscription({ company: "Acme", cadence: "monthly", startMs: JAN_15_2026 });
    assertTrue(r.ok);
    assertEq(r.sub.company, "Acme");
    assertEq(r.sub.addedMs, JAN_15_2026); // defaults to startMs
    assertEq(r.sub.domain, null);
  });
  test("rejects a missing company", () => {
    assertEq(normalizeSubscription({ cadence: "monthly", startMs: JAN_15_2026 }).error, "missing_company");
  });
  test("rejects an invalid cadence", () => {
    assertEq(normalizeSubscription({ company: "A", cadence: "hourly", startMs: JAN_15_2026 }).error, "invalid_cadence");
  });
  test("rejects a non-numeric startMs", () => {
    assertEq(normalizeSubscription({ company: "A", cadence: "monthly", startMs: "2026-01-15" }).error, "invalid_startMs");
  });
});

suite("renewalsDueWithin", () => {
  test("returns due subs sorted soonest-first", () => {
    const now = Date.UTC(2026, 1, 10);
    const subs = [
      { company: "Yearly", cadence: "annual", startMs: JAN_15_2026 },  // ~11 months out
      { company: "Soon", cadence: "monthly", startMs: JAN_15_2026 },   // Feb 15 -> 5 days
      { company: "Weekly", cadence: "weekly", startMs: Date.UTC(2026, 1, 9) }, // Feb 16 -> 6 days? check
    ];
    const due = renewalsDueWithin(subs, now, 7);
    assertTrue(due.length >= 1);
    // The annual one must NOT be within 7 days.
    assertFalse(due.some((d) => d.sub.company === "Yearly"));
    // Sorted ascending by days.
    for (let i = 1; i < due.length; i++) {
      assertTrue(due[i].days >= due[i - 1].days, "should be sorted soonest-first");
    }
  });
  test("empty/absent list returns empty", () => {
    assertEq(renewalsDueWithin(undefined, JAN_31_2026, 7).length, 0);
  });
});
