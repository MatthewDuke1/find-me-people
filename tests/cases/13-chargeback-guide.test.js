// Chargeback guidance (chargeback-guide.js): readiness gating ("try the
// merchant first"), issuer steps, reason categories. Pure, DOM-free.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "chargeback-guide.js");
const { assessReadiness, issuerSteps, listIssuers, REASON_CATEGORIES } = loadModuleApi(SRC, "SulaChargebackGuide");

suite("assessReadiness - guards against premature chargebacks", () => {
  test("not ready if merchant not contacted", () => {
    const r = assessReadiness({ contactedMerchant: false });
    assertFalse(r.ready);
    assertTrue(r.reasons.some((x) => x.includes("haven't contacted the merchant")));
  });
  test("not ready if merchant contacted but no response yet", () => {
    const r = assessReadiness({ contactedMerchant: true });
    assertFalse(r.ready);
  });
  test("ready if merchant said no", () => {
    const r = assessReadiness({ contactedMerchant: true, merchantRespondedNo: true });
    assertTrue(r.ready);
    assertTrue(r.recommendation.includes("reasonable next step"));
  });
  test("ready if merchant ignored for 7+ days", () => {
    assertTrue(assessReadiness({ contactedMerchant: true, merchantIgnoredDays: 10 }).ready);
    assertFalse(assessReadiness({ contactedMerchant: true, merchantIgnoredDays: 3 }).ready);
  });
  test("empty state never throws, returns not-ready", () => {
    assertFalse(assessReadiness().ready);
    assertFalse(assessReadiness({}).ready);
  });
});

suite("issuerSteps", () => {
  test("known issuer returns its label + steps", () => {
    const s = issuerSteps("amex");
    assertEq(s.issuer, "American Express");
    assertTrue(s.steps.length >= 4);
    assertTrue(s.steps.join(" ").toLowerCase().includes("amex"));
  });
  test("unknown issuer falls back to generic, never throws", () => {
    const s = issuerSteps("some-credit-union");
    assertEq(s.issuer, "Your card issuer");
    assertTrue(s.steps.length >= 4);
  });
  test("steps mention evidence and the deadline", () => {
    const s = issuerSteps("chase");
    const joined = s.steps.join(" ").toLowerCase();
    assertTrue(joined.includes("evidence") || joined.includes("attach"));
    assertTrue(joined.includes("120 days") || joined.includes("deadline"));
  });
});

suite("catalog data", () => {
  test("listIssuers includes majors + generic", () => {
    const ids = listIssuers().map((i) => i.id);
    ["generic", "chase", "amex", "bofa", "citi", "capitalone", "wellsfargo"].forEach((k) =>
      assertTrue(ids.includes(k), `missing ${k}`)
    );
  });
  test("reason categories cover the core dispute types", () => {
    const ids = REASON_CATEGORIES.map((c) => c.id);
    ["not_received", "not_as_described", "unauthorized", "canceled_recurring"].forEach((k) =>
      assertTrue(ids.includes(k), `missing ${k}`)
    );
  });
});
