// Advocacy letter studio (advocacy-letters.js): letter generation + the
// DoNotPay-guardrail tripwire. Pure/DOM-free.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "advocacy-letters.js");

const { listLetterTypes, buildLetter, assertNoProhibitedClaims } =
  loadModuleApi(SRC, "SulaAdvocacyLetters");

suite("letter types", () => {
  test("exposes the 4 documented types", () => {
    assertEq(listLetterTypes().length, 4);
  });
  test("each type has id + label", () => {
    for (const t of listLetterTypes()) {
      assertTrue(!!t.id && !!t.label, "type missing id/label");
    }
  });
});

suite("buildLetter", () => {
  const ctx = {
    company: "Acme Corp",
    contactName: "Jane Smith",
    issue: "I was charged twice for the same order",
    desired: "a refund of the duplicate charge",
    orderRef: "ORD-12345",
    priorAttempts: true,
    priorChannel: "your support line",
    priorContactDate: "July 20",
    amount: "$49.99",
    senderName: "Matt Duke",
  };

  test("executive escalation includes subject + body and the company", () => {
    const { subject, body } = buildLetter("executive_escalation", ctx);
    assertTrue(subject.includes("Acme Corp"));
    assertTrue(body.includes("Jane Smith"));
    assertTrue(body.includes("ORD-12345"));
    assertTrue(body.includes("escalat"), "should reference escalation");
  });
  test("cancellation request references end of billing period", () => {
    const { body } = buildLetter("cancellation", ctx);
    assertTrue(body.toLowerCase().includes("cancel"));
    assertTrue(body.toLowerCase().includes("billing period"));
  });
  test("refund request includes the amount and reason", () => {
    const { body } = buildLetter("refund", ctx);
    assertTrue(body.includes("$49.99"));
    assertTrue(body.toLowerCase().includes("refund"));
  });
  test("regulatory complaint is factual/timeline-shaped", () => {
    const { body } = buildLetter("regulatory", { ...ctx, agency: "CFPB" });
    assertTrue(body.includes("Company: Acme Corp"));
    assertTrue(body.toLowerCase().includes("what happened"));
  });
  test("degrades gracefully with an almost-empty context", () => {
    const { subject, body } = buildLetter("refund", {});
    assertTrue(subject.length > 0);
    assertTrue(body.length > 0);
  });
  test("unknown type throws", () => {
    let threw = false;
    try { buildLetter("not_a_type", ctx); } catch (_) { threw = true; }
    assertTrue(threw, "should throw on unknown type");
  });
});

suite("DoNotPay guardrail (assertNoProhibitedClaims)", () => {
  test("passes clean, requestful text through unchanged", () => {
    const s = "I am writing to request a refund. Please confirm.";
    assertEq(assertNoProhibitedClaims(s), s);
  });
  test("throws on a legal-entitlement assertion", () => {
    let threw = false;
    try { assertNoProhibitedClaims("You are legally required to refund me."); } catch (_) { threw = true; }
    assertTrue(threw);
  });
  test("throws on an outcome promise", () => {
    let threw = false;
    try { assertNoProhibitedClaims("This is a guaranteed refund."); } catch (_) { threw = true; }
    assertTrue(threw);
  });
  test("every generated letter type passes its own guardrail", () => {
    // buildLetter already runs assertNoProhibitedClaims internally; this
    // confirms none of the templates trip it with a realistic context.
    for (const t of listLetterTypes()) {
      const { body } = buildLetter(t.id, {
        company: "Acme", issue: "billing error", desired: "a refund", senderName: "M. Duke",
      });
      assertEq(assertNoProhibitedClaims(body), body);
    }
  });
});
