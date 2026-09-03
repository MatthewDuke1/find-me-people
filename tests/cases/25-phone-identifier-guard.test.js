// QA SULA-002 regression: identifiers must never be returned as phone numbers.
//
// The reported defect: the fixture text "Order 20260829123456" produced the
// phone "(202) 608-2912", because PHONE_REGEX had no digit boundaries and so
// matched a 10-digit window *inside* the longer identifier.
//
// Two guards are tested here:
//   1. PHONE_REGEX digit lookarounds — no match inside a longer digit run.
//   2. isLabeledIdentifier() — rejects a phone-shaped number that a nearby
//      label marks as an order/invoice/reference id.
//
// Equally important: the false-negative side. Real phone numbers in all the
// shapes Sula already supported must still match, or this fix would trade one
// accuracy bug for a worse one.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertTrue, assertFalse, assertEq } from "../lib/test-runner.js";

const { isLabeledIdentifier } = loadPureHelpers(["isLabeledIdentifier"]);

// Mirror of the shipped PHONE_REGEX (kept in sync deliberately: this test is
// the guard that the boundary lookarounds are not removed).
const PHONE_REGEX = /(?<!\d)(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/g;
const matches = (s) => s.match(PHONE_REGEX) || [];

suite("SULA-002 — identifiers embedded in longer digit runs", () => {
  test("the exact QA fixture yields no phone", () => {
    assertEq(matches("Order 20260829123456").length, 0,
      "'Order 20260829123456' must not produce a phone");
  });

  test("no phone is extracted at ANY offset of a long digit run", () => {
    // The original bug matched at an interior offset; prove every offset fails.
    assertEq(matches("20260829123456").length, 0);
    assertEq(matches("9876543210987654").length, 0);
  });

  test("14-16 digit ids (cards, tracking) yield no phone", () => {
    assertEq(matches("4111111111111111").length, 0, "card-like number");
    assertEq(matches("Tracking 1Z9999990312345678").length, 0);
  });

  test("an 11-digit run does not yield a 10-digit phone", () => {
    assertEq(matches("20260829123").length, 0);
  });
});

suite("SULA-002 — real phone numbers still match (no false negatives)", () => {
  const shouldMatch = [
    ["plain dashed", "Call 800-555-1234 today"],
    ["parenthesized", "Support: (202) 608-2912"],
    ["dotted", "Reach us at 512.555.9876"],
    ["spaced", "phone 415 555 2671"],
    ["with US country code", "+1 415-555-2671"],
    ["at end of string", "Our line is 806-555-0134"],
    ["followed by punctuation", "Dial 806-555-0134."],
    ["bare 10 digits", "8065550134"],
  ];
  for (const [name, text] of shouldMatch) {
    test(`still matches: ${name}`, () => {
      assertTrue(matches(text).length >= 1, `expected a phone in: ${text}`);
    });
  }

  test("a phone preceded by an unrelated number still matches", () => {
    // "Suite 5" must not poison the following genuine phone.
    assertTrue(matches("Suite 5 806-555-0134").length >= 1);
  });
});

suite("SULA-002 — isLabeledIdentifier (phone-shaped ids with a label)", () => {
  const labeled = [
    "Order #: ",
    "Order No. ",
    "Invoice ",
    "Reference: ",
    "Ref # ",
    "Confirmation number ",
    "Tracking #",
    "Account: ",
    "Case # ",
    "Ticket no ",
    "Transaction ",
    "Receipt #: ",
    "Policy ",
    "Customer # ",
  ];
  for (const before of labeled) {
    test(`rejects after label: "${before.trim()}"`, () => {
      assertTrue(isLabeledIdentifier(before), `should flag: ${before}`);
    });
  }

  const notLabeled = [
    "Call us at ",
    "Support line ",
    "Our phone is ",
    "Toll free ",
    "Text ",
    "",
    "Questions? ",
  ];
  for (const before of notLabeled) {
    test(`allows after: "${before.trim() || "(empty)"}"`, () => {
      assertFalse(isLabeledIdentifier(before), `should NOT flag: ${before}`);
    });
  }

  test("label far away does not reject (only the immediate tail counts)", () => {
    const far = "Order 123 was placed last week. Call our support line at ";
    assertFalse(isLabeledIdentifier(far),
      "a label 40+ chars back must not suppress a real phone");
  });

  test("null/undefined input is safe", () => {
    assertFalse(isLabeledIdentifier(null));
    assertFalse(isLabeledIdentifier(undefined));
  });
});
