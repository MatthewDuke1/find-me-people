// Refund-request template library (refund-templates.js): scenario letters with
// leverage clauses. Pure, DOM-free. Guards the honesty boundary: real facts get
// filled, unknown facts stay as {{PLACEHOLDERS}} (never invented).
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "refund-templates.js");
const { listScenarios, buildLetter, SCENARIOS } = loadModuleApi(SRC, "SulaRefundTemplates");

suite("listScenarios", () => {
  test("returns id+label for every scenario", () => {
    const list = listScenarios();
    assertTrue(list.length >= 7);
    assertEq(Object.keys(list[0]).sort(), ["id", "label"]);
  });
});

suite("buildLetter", () => {
  test("fills provided facts into subject and body", () => {
    const l = buildLetter("unauthorized_charge", {
      company: "Acme", orderId: "A-123", amount: "$40", date: "2026-08-01", name: "Matt",
    });
    assertTrue(l.subject.includes("A-123"));
    assertTrue(l.body.includes("Acme"));
    assertTrue(l.body.includes("$40"));
    assertTrue(l.body.includes("2026-08-01"));
    assertTrue(l.body.includes("Matt"));
  });

  test("leaves unknown facts as placeholders (never invents)", () => {
    const l = buildLetter("unauthorized_charge", { company: "Acme" });
    assertTrue(l.subject.includes("{{ORDER_ID}}")); // order id lives in the subject for this scenario
    assertTrue(l.body.includes("{{AMOUNT}}"));
    assertTrue(l.body.includes("{{YOUR_EMAIL}}"));
  });

  test("unauthorized-charge cites FCBA + chargeback leverage", () => {
    const l = buildLetter("unauthorized_charge", {});
    assertTrue(l.leverage.includes("fcba"));
    assertTrue(l.leverage.includes("chargeback"));
    assertTrue(l.body.includes("Fair Credit Billing Act"));
  });

  test("cancelled-still-charged escalates to negative-option + CFPB", () => {
    const l = buildLetter("cancelled_still_charged", {});
    assertTrue(l.leverage.includes("negative_option"));
    assertTrue(l.leverage.includes("cfpb"));
    assertTrue(l.body.includes("Consumer Financial Protection Bureau"));
  });

  test("every scenario builds a non-empty subject + body", () => {
    for (const id of Object.keys(SCENARIOS)) {
      const l = buildLetter(id, {});
      assertTrue(l.subject.length > 5, `${id} subject`);
      assertTrue(l.body.length > 40, `${id} body`);
    }
  });

  test("unknown scenario returns null, never throws", () => {
    assertEq(buildLetter("not-real", {}), null);
  });

  test("body opens with To {company} and closes with the name", () => {
    const l = buildLetter("defective_product", { company: "Acme", name: "Matt" });
    assertTrue(l.body.startsWith("To Acme Support,"));
    assertTrue(l.body.trim().endsWith("Matt"));
  });
});
