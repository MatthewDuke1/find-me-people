// Passive ledger store: identity, merge, and the provisional-checkout rule.
//
// The rule this file exists to defend: a checkout capture is an INTENT, not a
// purchase. Carts get abandoned. If an abandoned cart becomes a permanent
// entry with a refund deadline attached, the user learns within a week that
// the ledger is noise — and a ledger nobody trusts is worse than none, because
// it also discredits the entries that are correct.
//
// Second concern: a single purchase is seen two or three times (checkout,
// confirmation, a revisit days later). All three must land on one entry.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "ledger-store.js");
const L = loadModuleApi(SRC, "SulaLedger");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 8, 12, 12);

const facts = (over = {}) => ({
  merchant: { name: "Acme", domain: "acme.com" },
  amount: { value: 104.51, currency: "USD", raw: "$104.51" },
  orderRef: "ORD-88213",
  occurredAt: T0,
  sourceUrl: "https://acme.com/orders/88213",
  provenance: { amount: "label:order total" },
  confidence: 0.9,
  ...over,
});

suite("identity", () => {
  test("order ref makes the id stable across captures", () => {
    assertEq(L.entryId(facts()), "acme.com#ORD-88213");
  });
  test("without a ref, falls back to merchant + amount", () => {
    assertEq(L.entryId(facts({ orderRef: null })), "acme.com~104.51");
  });
  test("an unknown merchant still produces an id", () => {
    assertTrue(L.entryId({}).length > 0, "no id produced");
  });
});

suite("the provisional-checkout rule", () => {
  test("a checkout capture lands pending, not confirmed", () => {
    const e = L.normalizeEntry(facts(), { moment: "checkout", now: T0 });
    assertEq(e.state, L.STATE.PENDING);
  });

  test("a confirmation lands confirmed", () => {
    const e = L.normalizeEntry(facts(), { moment: "order", now: T0 });
    assertEq(e.state, L.STATE.CONFIRMED);
  });

  test("a confirmation promotes the pending checkout rather than duplicating it", () => {
    const pending = L.normalizeEntry(facts(), { moment: "checkout", now: T0 });
    const confirmed = L.normalizeEntry(facts(), { moment: "order", now: T0 + HOUR });
    const list = L.upsert([pending], confirmed);
    assertEq(list.length, 1);
    assertEq(list[0].state, L.STATE.CONFIRMED);
  });

  test("an abandoned cart expires after 72 hours", () => {
    const pending = L.normalizeEntry(facts(), { moment: "checkout", now: T0 });
    assertEq(L.prune([pending], T0 + 71 * HOUR).length, 1);
    assertEq(L.prune([pending], T0 + 73 * HOUR).length, 0);
  });

  test("a confirmed purchase is never expired by the pending TTL", () => {
    const confirmed = L.normalizeEntry(facts(), { moment: "order", now: T0 });
    assertEq(L.prune([confirmed], T0 + 100 * DAY).length, 1);
  });
});

suite("merge: one purchase seen several times stays one entry", () => {
  test("same order ref merges", () => {
    const a = L.normalizeEntry(facts(), { moment: "order", now: T0 });
    const b = L.normalizeEntry(facts(), { moment: "order", now: T0 + 3 * DAY });
    assertEq(L.upsert([a], b).length, 1);
  });

  test("same merchant + amount inside 48h merges without a ref", () => {
    const a = L.normalizeEntry(facts({ orderRef: null }), { moment: "order", now: T0 });
    const b = L.normalizeEntry(facts({ orderRef: null }), { moment: "order", now: T0 + 12 * HOUR });
    assertEq(L.upsert([a], b).length, 1);
  });

  test("same merchant + amount OUTSIDE 48h is a second purchase", () => {
    const a = L.normalizeEntry(facts({ orderRef: null }), { moment: "order", now: T0 });
    const b = L.normalizeEntry(facts({ orderRef: null }), { moment: "order", now: T0 + 5 * DAY });
    assertEq(L.upsert([a], b).length, 2);
  });

  test("different merchants never merge", () => {
    const a = L.normalizeEntry(facts(), { moment: "order", now: T0 });
    const b = L.normalizeEntry(
      facts({ merchant: { name: "Other", domain: "other.com" }, orderRef: null }),
      { moment: "order", now: T0 }
    );
    assertEq(L.upsert([a], b).length, 2);
  });

  test("a missing field is filled in by a later capture", () => {
    const thin = L.normalizeEntry(facts({ amount: null, confidence: 0.6 }), { moment: "order", now: T0 });
    const full = L.normalizeEntry(facts(), { moment: "order", now: T0 + HOUR });
    assertEq(L.upsert([thin], full)[0].amount.value, 104.51);
  });

  test("a present field is never overwritten with null", () => {
    const full = L.normalizeEntry(facts(), { moment: "order", now: T0 });
    const thin = L.normalizeEntry(facts({ amount: null, confidence: 0.2 }), { moment: "order", now: T0 + HOUR });
    assertEq(L.upsert([full], thin)[0].amount.value, 104.51);
  });

  test("provenance accumulates across captures", () => {
    const a = L.normalizeEntry(facts({ provenance: { amount: "label:total" } }), { moment: "order", now: T0 });
    const b = L.normalizeEntry(facts({ provenance: { orderRef: "labelled-reference" } }), { moment: "order", now: T0 + HOUR });
    const m = L.upsert([a], b)[0];
    assertTrue(m.provenance.amount && m.provenance.orderRef, "provenance lost on merge");
  });
});

suite("lifecycle", () => {
  test("purchases age out past every dispute window", () => {
    const e = L.normalizeEntry(facts(), { moment: "order", now: T0 });
    assertEq(L.prune([e], T0 + 500 * DAY).length, 1);
    assertEq(L.prune([e], T0 + 600 * DAY).length, 0);
  });

  test("subscriptions never expire while active", () => {
    const s = L.normalizeEntry(facts(), { moment: "subscription", now: T0 });
    assertEq(L.prune([s], T0 + 5000 * DAY).length, 1);
  });

  test("closing marks rather than deletes", () => {
    const e = L.normalizeEntry(facts(), { moment: "order", now: T0 });
    const closed = L.close([e], e.id);
    assertEq(closed.length, 1);
    assertEq(closed[0].state, L.STATE.CLOSED);
  });

  test("a closed entry is never silently reopened by a later capture", () => {
    const e = L.close([L.normalizeEntry(facts(), { moment: "order", now: T0 })], "acme.com#ORD-88213")[0];
    const again = L.normalizeEntry(facts(), { moment: "order", now: T0 + HOUR });
    assertEq(L.upsert([e], again)[0].state, L.STATE.CLOSED);
  });

  test("over the cap, subscriptions survive before purchases", () => {
    const subs = [L.normalizeEntry(facts({ orderRef: "SUB-1" }), { moment: "subscription", now: T0 })];
    const many = [];
    for (let i = 0; i < L.MAX_ENTRIES + 50; i++) {
      many.push(L.normalizeEntry(facts({ orderRef: "P-" + i }), { moment: "order", now: T0 + i }));
    }
    const kept = L.prune(subs.concat(many), T0 + DAY);
    assertEq(kept.length, L.MAX_ENTRIES);
    assertTrue(kept.some((e) => e.kind === L.KIND.SUBSCRIPTION), "subscription was evicted");
  });
});

suite("queries", () => {
  const sub = (days, id) => {
    const e = L.normalizeEntry(facts({ orderRef: id }), { moment: "subscription", now: T0 });
    e.renewal = { cadence: "monthly", nextDate: T0 + days * DAY, phrase: "renews monthly" };
    return e;
  };

  test("renewals inside the horizon, soonest first", () => {
    const list = [sub(20, "A"), sub(3, "B"), sub(9, "C")];
    const due = L.renewalsDueWithin(list, 14, T0);
    assertEq(due.length, 2);
    assertEq(due[0].orderRef, "B");
  });

  test("past renewals are not due", () => {
    assertEq(L.renewalsDueWithin([sub(-5, "A")], 14, T0).length, 0);
  });

  test("entries marked not-mine are excluded from alerts", () => {
    const list = L.setMine([sub(3, "A")], "acme.com#A", false);
    assertEq(L.renewalsDueWithin(list, 14, T0).length, 0);
  });

  test("closed subscriptions stop alerting", () => {
    const list = L.close([sub(3, "A")], "acme.com#A");
    assertEq(L.renewalsDueWithin(list, 14, T0).length, 0);
  });

  test("purchasesAt only returns confirmed entries for that merchant", () => {
    const confirmed = L.normalizeEntry(facts(), { moment: "order", now: T0 });
    const pending = L.normalizeEntry(facts({ orderRef: "P2" }), { moment: "checkout", now: T0 });
    const other = L.normalizeEntry(
      facts({ merchant: { name: "X", domain: "x.com" }, orderRef: "P3" }), { moment: "order", now: T0 });
    const hits = L.purchasesAt([confirmed, pending, other], "acme.com");
    assertEq(hits.length, 1);
    assertEq(hits[0].orderRef, "ORD-88213");
  });
});
