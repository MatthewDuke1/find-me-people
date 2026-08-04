// Refund/dispute deadline engine (refund-deadline-engine.js): window/dispute
// math + charge-date parsing. Pure, DOM-free — loaded via loadModuleApi with a
// deterministic injected `today` so results never depend on the wall clock.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "refund-deadline-engine.js");
const { computeDeadlines, parseChargeDate, REMEDIES } = loadModuleApi(SRC, "SulaRefundDeadlines");

suite("computeDeadlines - core windows", () => {
  test("credit card: FCBA 60d + chargeback 120d from the right anchors", () => {
    const r = computeDeadlines("2026-08-01", { paymentType: "credit", today: new Date("2026-08-10") });
    assertTrue(r.ok);
    const fcba = r.remedies.find((x) => x.id === "fcba_billing_dispute");
    const cb = r.remedies.find((x) => x.id === "chargeback");
    assertEq(fcba.deadline, "2026-09-30"); // 60 days after Aug 1
    assertEq(cb.deadline, "2026-11-29"); // 120 days after Aug 1
  });

  test("days-left counts down correctly", () => {
    const r = computeDeadlines("2026-08-01", { paymentType: "credit", today: new Date("2026-09-25") });
    const fcba = r.remedies.find((x) => x.id === "fcba_billing_dispute");
    assertEq(fcba.daysLeft, 5); // Sep 25 -> Sep 30
    assertEq(fcba.urgency, "urgent");
  });

  test("expired window is flagged and sinks to the bottom", () => {
    const r = computeDeadlines("2026-01-01", { paymentType: "credit", today: new Date("2026-08-01") });
    const fcba = r.remedies.find((x) => x.id === "fcba_billing_dispute");
    assertTrue(fcba.expired);
    assertEq(fcba.urgency, "expired");
    // last remedy in the sorted list should be expired
    assertTrue(r.remedies[r.remedies.length - 1].expired);
  });

  test("debit uses Reg E, not FCBA", () => {
    const r = computeDeadlines("2026-08-01", { paymentType: "debit", today: new Date("2026-08-10") });
    assertTrue(r.remedies.some((x) => x.id === "reg_e_debit_dispute"));
    assertFalse(r.remedies.some((x) => x.id === "fcba_billing_dispute"));
  });

  test("merchant-return override replaces the 30-day default", () => {
    const r = computeDeadlines("2026-08-01", {
      paymentType: "credit",
      today: new Date("2026-08-10"),
      overrides: { merchant_return: 90 },
    });
    const ret = r.remedies.find((x) => x.id === "merchant_return");
    assertEq(ret.windowDays, 90);
    assertEq(ret.deadline, "2026-10-30");
  });

  test("soonest + anyOpen surface the most urgent open remedy", () => {
    const r = computeDeadlines("2026-08-01", { paymentType: "credit", today: new Date("2026-08-29") });
    assertTrue(r.anyOpen);
    // On Aug 29, merchant_return (30d -> Aug 31) is the soonest still-open one
    assertEq(r.soonest.id, "merchant_return");
  });

  test("bad date returns ok:false, never throws", () => {
    const r = computeDeadlines("not-a-date", { today: new Date("2026-08-10") });
    assertFalse(r.ok);
    assertEq(r.reason, "bad_date");
  });
});

suite("parseChargeDate", () => {
  test("ISO format", () => assertEq(parseChargeDate("Order placed 2026-08-01 total $40"), "2026-08-01"));
  test("US slash format", () => assertEq(parseChargeDate("Charged on 08/01/2026"), "2026-08-01"));
  test("2-digit year", () => assertEq(parseChargeDate("date 8/1/26"), "2026-08-01"));
  test("long month name", () => assertEq(parseChargeDate("Purchased August 1, 2026"), "2026-08-01"));
  test("abbreviated month", () => assertEq(parseChargeDate("Aug 1 2026 receipt"), "2026-08-01"));
  test("no date -> null", () => assertEq(parseChargeDate("no date here"), null));
  test("empty -> null", () => assertEq(parseChargeDate(""), null));
  test("invalid day rejected", () => assertEq(parseChargeDate("2026-13-45"), null));
});

suite("REMEDIES data integrity", () => {
  test("every remedy has id, label, days, note", () => {
    for (const r of REMEDIES) {
      assertTrue(!!r.id && !!r.label && typeof r.days === "number" && !!r.note, `bad remedy: ${r.id}`);
    }
  });
});
