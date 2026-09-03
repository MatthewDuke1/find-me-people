// QA SULA-006 regression: generating a refund letter from blank inputs.
//
// Reported: with every input empty, "Generate" produced an empty output area
// with no error and no indication of what was required. A letter missing the
// company, amount, or charge date is also not sendable, so generating one at
// all is the wrong behaviour, not just an unlabelled one.
//
// missingLetterFields() is the pure guard; listPhrase() builds the message.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "advocacy-ui.js");

const { missingLetterFields, listPhrase } =
  loadPureHelpers(["missingLetterFields", "listPhrase"], SRC);

const ids = (f) => missingLetterFields(f).map((m) => m.id);

suite("SULA-006 — required fields before a letter is generated", () => {
  test("the exact QA case: all inputs blank reports all three", () => {
    assertEq(ids({ company: "", amount: "", orderId: "", date: "" }).length, 3);
  });

  test("a complete set passes", () => {
    assertEq(missingLetterFields({
      company: "QA Test Merchant", amount: "40", orderId: "QA-001", date: "2026-08-15",
    }).length, 0);
  });

  test("orderId is optional — its absence does not block", () => {
    assertEq(missingLetterFields({
      company: "Acme", amount: "40", orderId: "", date: "2026-08-15",
    }).length, 0);
  });

  test("missing company alone", () => {
    assertEq(ids({ company: "", amount: "40", date: "2026-08-15" }), ["adv-company"]);
  });
  test("missing amount alone", () => {
    assertEq(ids({ company: "Acme", amount: "", date: "2026-08-15" }), ["adv-amount"]);
  });
  test("missing date alone", () => {
    assertEq(ids({ company: "Acme", amount: "40", date: "" }), ["adv-date"]);
  });

  test("whitespace-only values count as missing", () => {
    assertEq(ids({ company: "   ", amount: "\t", date: "  " }).length, 3);
  });

  test("focus order is company, then amount, then date", () => {
    assertEq(ids({ company: "", amount: "", date: "" })[0], "adv-company");
    assertEq(ids({ company: "Acme", amount: "", date: "" })[0], "adv-amount");
  });

  test("null/undefined facts are safe (no throw)", () => {
    assertTrue(missingLetterFields({}).length === 3);
  });

  test("every entry carries a human label for the message", () => {
    missingLetterFields({}).forEach((m) => {
      assertTrue(!!m.label && !!m.id, "each missing field needs id + label");
    });
  });
});

suite("SULA-006 — listPhrase message construction", () => {
  test("one item", () => assertEq(listPhrase(["company"]), "company"));
  test("two items", () => assertEq(listPhrase(["company", "amount"]), "company and amount"));
  test("three items", () =>
    assertEq(listPhrase(["company", "amount", "charge date"]), "company, amount and charge date"));
  test("empty is safe", () => assertEq(listPhrase([]), ""));
  test("null is safe", () => assertEq(listPhrase(null), ""));
});
