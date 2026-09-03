// QA SULA-003 / SULA-007 regression: one placeholder rule for every path.
//
// Reported: on a fixture containing support@example.com, that address was
// absent "while other example-domain addresses are returned". The cause was
// not a filter that was too strict — it was SIX near-copies of the filter that
// disagreed. Visible-text paths excluded example.com; the mailto path applied
// no placeholder test at all. Same page, same domain, opposite outcomes.
//
// isPlaceholderEmail() is now the single rule every extraction path calls, so
// the behaviour is consistent and explainable. These tests pin the rule down.
//
// SULA-007 (exports carrying bad data) inherits this: CSV/vCard serialise the
// same results array, so a contact excluded here can never reach an export.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertTrue, assertFalse } from "../lib/test-runner.js";

const { isPlaceholderEmail } = loadPureHelpers(["isPlaceholderEmail"]);

suite("SULA-003 — the rule is consistent for reserved domains", () => {
  // The QA fixture's addresses: every one must now get the SAME verdict,
  // whether it arrives from visible text or from a mailto: href.
  const reserved = [
    "support@example.com",
    "billing@example.com",
    "sales@example.com",
    "hello@example.org",
    "info@example.net",
    "a@example.co.uk",
  ];
  for (const e of reserved) {
    test(`${e} is placeholder (consistently)`, () => {
      assertTrue(isPlaceholderEmail(e), `${e} must be treated as placeholder`);
    });
  }

  test("other RFC 2606 reserved domains too", () => {
    assertTrue(isPlaceholderEmail("a@test.com"));
    assertTrue(isPlaceholderEmail("a@invalid.org"));
    assertTrue(isPlaceholderEmail("a@localhost.net"));
  });
});

suite("SULA-003 — unattended mailboxes and asset noise", () => {
  const noise = [
    "noreply@acme.com",
    "no-reply@acme.com",
    "donotreply@acme.com",
    "NoReply@Acme.com",          // case-insensitive
    "sprite@2x.png",
    "icon@3x.png",
    "abc123@sentry.io",
    "x@wixpress.com",
  ];
  for (const e of noise) {
    test(`rejects noise: ${e}`, () => assertTrue(isPlaceholderEmail(e)));
  }
});

suite("SULA-003 — real contacts are never dropped (no false negatives)", () => {
  // The whole point of the product. An over-broad placeholder rule would be a
  // worse defect than the inconsistency it replaced.
  const real = [
    "support@acme.com",
    "billing@acme.co.uk",
    "help@shop.example-brand.com",   // "example-" is not "example."
    "hello@examples.com",            // plural domain is a real domain
    "customerservice@bigco.org",
    "first.last+tag@company.io",
    "refunds@store.net",
    "a@b.co",
  ];
  for (const e of real) {
    test(`keeps real address: ${e}`, () => {
      assertFalse(isPlaceholderEmail(e), `${e} must NOT be filtered`);
    });
  }
});

suite("SULA-003 — edge cases", () => {
  test("empty / null / undefined are treated as placeholder (not returned)", () => {
    assertTrue(isPlaceholderEmail(""));
    assertTrue(isPlaceholderEmail(null));
    assertTrue(isPlaceholderEmail(undefined));
  });
  test("uppercase input is normalised", () => {
    assertTrue(isPlaceholderEmail("SUPPORT@EXAMPLE.COM"));
    assertFalse(isPlaceholderEmail("SUPPORT@ACME.COM"));
  });
});
