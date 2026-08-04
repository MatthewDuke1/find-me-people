// Refund-policy extractor (refund-policy-extractor.js): the pure classify /
// window / summarize core (the DOM wrapper is browser-only and not tested here).
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "refund-policy-extractor.js");
const { classifyPolicyText, findPolicyWindow, summarizePolicy } = loadModuleApi(SRC, "SulaRefundPolicy");

suite("classifyPolicyText", () => {
  test("flags real policy text", () => {
    const c = classifyPolicyText("Our return policy: full refund within 30 days. Restocking fee may apply.");
    assertTrue(c.isPolicy);
    assertTrue(c.confidence > 0);
  });
  test("does not flag ordinary body copy with one stray keyword", () => {
    assertFalse(classifyPolicyText("Return to the homepage to continue shopping.").isPolicy);
  });
  test("empty is not a policy", () => assertFalse(classifyPolicyText("").isPolicy));
});

suite("findPolicyWindow", () => {
  test("'30-day'", () => assertEq(findPolicyWindow("30-day returns"), 30));
  test("'30 day'", () => assertEq(findPolicyWindow("returns accepted 30 day"), 30));
  test("'within 90 days'", () => assertEq(findPolicyWindow("refunds within 90 days of purchase"), 90));
  test("no window -> null", () => assertEq(findPolicyWindow("returns accepted"), null));
  test("absurd window rejected", () => assertEq(findPolicyWindow("999-day"), null));
});

suite("summarizePolicy", () => {
  test("extracts window + full-refund signal", () => {
    const s = summarizePolicy("Full refund to your original card within 30 days.");
    assertEq(s.windowDays, 30);
    assertTrue(s.fullRefund);
    assertFalse(s.storeCreditOnly);
  });
  test("catches store-credit-only", () => {
    const s = summarizePolicy("Returns within 14 days for store credit only.");
    assertTrue(s.storeCreditOnly);
    assertTrue(s.flags.some((f) => f.toLowerCase().includes("store credit")));
  });
  test("catches restocking fee and final sale", () => {
    const s = summarizePolicy("30-day returns. A 15% restocking fee applies. Clearance items are final sale.");
    assertTrue(s.restockingFee);
    assertTrue(s.finalSale);
    assertTrue(s.flags.length >= 2);
  });
  test("no window -> summary tells user to ask the merchant", () => {
    const s = summarizePolicy("We accept returns.");
    assertEq(s.windowDays, null);
    assertTrue(s.summary.toLowerCase().includes("ask the merchant"));
  });
  test("never throws on empty", () => {
    const s = summarizePolicy("");
    assertEq(s.windowDays, null);
  });
});
