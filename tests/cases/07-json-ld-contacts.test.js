// collectSchemaContacts() -- recursive Schema.org JSON-LD graph walker
// that pulls email / telephone out of Organization, LocalBusiness,
// ContactPoint, and arbitrary nested types.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";

const { collectSchemaContacts, phoneKey, formatPhone } = loadPureHelpers([
  "collectSchemaContacts",
  "phoneKey",
  "formatPhone",
]);

// The collector needs EMAIL_REGEX in scope -- loadPureHelpers extracts by
// name, not closure capture. We re-inject the same regex literal by
// running the helper inside a wrapper that defines it.
function runCollector(graph) {
  const results = { emails: [], phones: [] };
  const seen = new Set();
  // Re-define EMAIL_REGEX in the helper's evaluation scope by mutating
  // globalThis -- the function looks it up by free reference. This is a
  // test-harness shim; production code reads it from the IIFE scope.
  globalThis.EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  globalThis.phoneKey = phoneKey;
  globalThis.formatPhone = formatPhone;
  collectSchemaContacts(graph, results, seen);
  return results;
}

suite("collectSchemaContacts", () => {
  test("direct email property on Organization", () => {
    const r = runCollector({ "@type": "Organization", email: "support@acme.com" });
    assertEq(r.emails.length, 1);
    assertEq(r.emails[0].value, "support@acme.com");
    assertEq(r.emails[0].source, "json-ld");
    assertEq(r.emails[0].score, 98);
  });
  test("direct telephone property on LocalBusiness", () => {
    const r = runCollector({ "@type": "LocalBusiness", telephone: "+1-281-816-5935" });
    assertEq(r.phones.length, 1);
    assertTrue(r.phones[0].value.includes("281"));
    assertEq(r.phones[0].source, "json-ld");
  });
  test("contactPoint array with nested email/telephone", () => {
    const r = runCollector({
      "@type": "Organization",
      contactPoint: [
        { "@type": "ContactPoint", contactType: "customer service", email: "help@acme.com", telephone: "+18005551212" },
        { "@type": "ContactPoint", contactType: "sales", email: "sales@acme.com" },
      ],
    });
    assertEq(r.emails.length, 2);
    assertEq(r.phones.length, 1);
  });
  test("mailto: prefix is stripped", () => {
    const r = runCollector({ email: "mailto:hello@world.com" });
    assertEq(r.emails[0].value, "hello@world.com");
  });
  test("tel: prefix is stripped", () => {
    const r = runCollector({ telephone: "tel:+18005551212" });
    assertEq(r.phones.length, 1);
  });
  test("@graph top-level array", () => {
    const r = runCollector({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", email: "a@a.com" },
        { "@type": "Person", email: "b@b.com" },
      ],
    });
    assertEq(r.emails.length, 2);
  });
  test("array-form email property", () => {
    const r = runCollector({ email: ["one@x.com", "two@x.com"] });
    assertEq(r.emails.length, 2);
  });
  test("dedup across recursion (same email at multiple depths)", () => {
    const r = runCollector({
      email: "dup@x.com",
      contactPoint: { email: "dup@x.com" },
      "@graph": [{ email: "dup@x.com" }],
    });
    assertEq(r.emails.length, 1);
  });
  test("ignores malformed strings", () => {
    const r = runCollector({ email: "not-an-email", telephone: "abc" });
    assertEq(r.emails.length, 0);
    assertEq(r.phones.length, 0);
  });
  test("ignores non-string property values", () => {
    const r = runCollector({ email: 42, telephone: { weird: "object" } });
    assertEq(r.emails.length, 0);
    assertEq(r.phones.length, 0);
  });
  test("descends into arbitrary nested types without hard-coded name list", () => {
    const r = runCollector({
      "@type": "Organization",
      department: {
        "@type": "Department",
        member: {
          "@type": "Person",
          email: "deep@nested.com",
        },
      },
    });
    assertEq(r.emails.length, 1);
    assertEq(r.emails[0].value, "deep@nested.com");
  });
  test("null / undefined / primitive root is a no-op", () => {
    runCollector(null);
    runCollector(undefined);
    runCollector("just a string");
    runCollector(42);
  });
});
