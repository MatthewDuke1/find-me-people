// QA SULA-008 regression: a generated letter must contain only supplied facts.
//
// QA entered: QA Test Merchant / 40 / QA-001 / 2026-08-15 / credit card /
// "Cancelled but still charged", and the letter:
//   * described 2026-08-15 (the CHARGE date) as the renewal date, asserting a
//     cancellation timeline the user never gave,
//   * dropped the order number QA-001 entirely,
//   * asked the merchant to close the account, an instruction never collected.
//
// This is a letter the user signs and sends, so an invented fact is not a
// cosmetic defect. These tests pin each one.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "refund-templates.js");
const { buildLetter, listScenarios } = loadModuleApi(SRC, "SulaRefundTemplates");

// The exact facts from the QA run.
const QA = { company: "QA Test Merchant", amount: "40", orderId: "QA-001", date: "2026-08-15" };
const letter = (scenario, f) => buildLetter(scenario, f || QA);

suite("SULA-008 — the charge date is not relabelled as a renewal date", () => {
  test("'cancelled but still charged' does not call the charge date a renewal", () => {
    const b = letter("cancelled_still_charged").body;
    assertFalse(/renewal on 2026-08-15/i.test(b),
      "the charge date must not be presented as the renewal date");
    assertFalse(/before the renewal/i.test(b),
      "no cancellation timeline may be asserted — none was collected");
  });

  test("the charge date is still stated, as a charge", () => {
    const b = letter("cancelled_still_charged").body;
    assertTrue(b.indexOf("2026-08-15") !== -1, "the supplied date should appear");
    assertTrue(/charged .* on 2026-08-15/i.test(b), `expected charge framing, got:\n${b}`);
  });
});

suite("SULA-008 — no unrequested instructions", () => {
  test("the letter does not ask to close the account", () => {
    const b = letter("cancelled_still_charged").body;
    assertFalse(/account is closed|close (my|the) account/i.test(b),
      "closing an account is a different request from a refund and was never asked for");
  });
});

suite("SULA-008 — the order reference is carried", () => {
  test("the supplied order number appears in the body", () => {
    assertTrue(letter("cancelled_still_charged").body.indexOf("QA-001") !== -1,
      "QA-001 was supplied and must not be dropped");
  });

  test("it is carried across scenarios, not just one template", () => {
    for (const s of listScenarios()) {
      const b = buildLetter(s.id, QA).body;
      assertTrue(b.indexOf("QA-001") !== -1, `${s.id} dropped the order reference`);
    }
  });

  test("no order line is emitted when none was supplied", () => {
    const b = buildLetter("cancelled_still_charged",
      { company: "Acme", amount: "40", date: "2026-08-15" }).body;
    assertFalse(/Order\/reference:/.test(b),
      "must not print an empty order line or a placeholder");
    assertFalse(/\{\{ORDER_ID\}\}/.test(b), "no unsubstituted placeholder may ship");
  });
});

suite("SULA-008 — supplied facts survive, invented ones do not", () => {
  test("company, amount and date all appear", () => {
    const b = letter("cancelled_still_charged").body;
    assertTrue(b.indexOf("QA Test Merchant") !== -1);
    assertTrue(b.indexOf("40") !== -1);
    assertTrue(b.indexOf("2026-08-15") !== -1);
  });

  test("the amount is reproduced exactly as entered, not reformatted", () => {
    // Sula must not guess a currency the user did not type — inventing "$"
    // or "USD" would be the same class of defect as inventing a date.
    const b = buildLetter("cancelled_still_charged",
      { company: "Acme", amount: "40", orderId: "X1", date: "2026-08-15" }).body;
    assertFalse(/\$40|USD ?40|40 ?USD/.test(b), "currency must not be invented");
  });

  test("a currency the user DID type is preserved", () => {
    const b = buildLetter("cancelled_still_charged",
      { company: "Acme", amount: "$40.00", orderId: "X1", date: "2026-08-15" }).body;
    assertTrue(b.indexOf("$40.00") !== -1, "an entered currency must survive verbatim");
  });

  test("every scenario builds without leaving placeholders for supplied facts", () => {
    for (const s of listScenarios()) {
      const b = buildLetter(s.id, QA).body;
      assertFalse(/\{\{(COMPANY|AMOUNT|DATE|ORDER_ID)\}\}/.test(b),
        `${s.id} left an unsubstituted placeholder`);
    }
  });
});
