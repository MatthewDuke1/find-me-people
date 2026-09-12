// Generated merchant table (merchant-table.js) + the two-pass normalizeMerchant
// in statement-parser.js.
//
// This table is written by a language model on a schedule, so the tests here
// are the contract it has to satisfy rather than a description of what it
// happens to contain today. Three things are pinned:
//
//   1. The golden cases in scripts/merchant-golden.json -- the same file the
//      promotion gate uses, so a table can never reach the repo green here and
//      red there, or vice versa.
//   2. The fallback. An unlisted merchant must still normalise exactly as it
//      did before the table existed, and removing the table entirely must
//      restore the old behaviour byte for byte. The table is an improvement
//      layered on top, never a replacement.
//   3. Structure. Patterns are matched with indexOf against an uppercased
//      descriptor, so a lowercase or too-short pattern is silently dead code.
//
// What is deliberately NOT asserted: which merchants are in the table. Pinning
// that would make every regeneration a test edit, which is exactly the friction
// this design exists to avoid.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

const TABLE = loadModuleApi(path.join(ROOT, "merchant-table.js"), "SulaMerchantTable");
const parser = loadModuleApi(path.join(ROOT, "statement-parser.js"), "SulaStatementParser");
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "merchant-golden.json"), "utf8"));

// statement-parser.js reads window.SulaMerchantTable at call time; in Node each
// module got its own stub window, so wire them together explicitly. This is the
// same injection scripts/validate-merchant-table.mjs uses.
parser.setMerchantTable(TABLE);
const n = parser.normalizeMerchant;

suite("the golden contract", () => {
  for (const c of golden.cases) {
    test(JSON.stringify(c.desc) + " -> " + JSON.stringify(c.expect), () => {
      assertEq(n(c.desc), c.expect);
    });
  }

  for (const pair of golden.mustDiffer) {
    test(JSON.stringify(pair[0]) + " must not collapse into " + JSON.stringify(pair[1]), () => {
      assertTrue(n(pair[0]) !== n(pair[1]),
        "both normalised to " + JSON.stringify(n(pair[0])));
    });
  }

  for (const pair of golden.mustMatch) {
    test(JSON.stringify(pair[0]) + " must group with " + JSON.stringify(pair[1]), () => {
      assertEq(n(pair[0]), n(pair[1]));
    });
  }
});

suite("the three bugs the table exists to fix", () => {
  // Each of these was verified failing against the pre-table parser.
  test("a payment aggregator never becomes the merchant", () => {
    assertTrue(n("PAYPAL *SPOTIFY") !== "PAYPAL", "PayPal swallowed the merchant again");
  });

  test("PayPal-routed subscriptions stay distinct from each other", () => {
    const names = ["PAYPAL *SPOTIFY", "PAYPAL *HULU", "PAYPAL *NYTIMES"].map(n);
    assertEq(new Set(names).size, 3);
  });

  test("a transaction id does not split one subscription in two", () => {
    assertEq(n("SPOTIFY P34F9G8 NEW YORK NY"), n("SPOTIFY P99X1Q2 DENVER CO"));
  });

  test("an aggregator prefix is stripped even when the merchant is unknown", () => {
    // The pre-table parser returned "SQ *BLUE BOTTLE" verbatim here, because
    // "SQ" was eaten as a state code and the result fell back to the raw string.
    const got = n("SQ *ZZQQ UNKNOWN VENDOR");
    assertTrue(got.indexOf("SQ ") !== 0 && got.indexOf("*") === -1,
      "aggregator noise survived: " + JSON.stringify(got));
  });
});

suite("the table never eats a real merchant name", () => {
  test("a merchant whose name precedes a star is not treated as an aggregator", () => {
    // "ADOBE  *CREATIVE CLOUD" looks exactly like the aggregator shape. Only a
    // KNOWN processor prefix may be stripped, or this returns "Creative Cloud".
    assertEq(n("ADOBE  *CREATIVE CLOUD"), "Adobe");
  });

  test("no aggregator token is also a merchant pattern", () => {
    const patterns = new Set(TABLE.merchants.map((m) => m.pattern));
    for (const a of TABLE.aggregators) {
      assertTrue(!patterns.has(a), a + " is both an aggregator and a merchant");
    }
  });
});

suite("the fallback pass survives", () => {
  test("an unlisted merchant still normalises", () => {
    assertEq(n("ZZQQ LOCAL HARDWARE 4471 SEATTLE WA"), parser.normalizeMerchantFallback("ZZQQ LOCAL HARDWARE 4471 SEATTLE WA"));
  });

  test("with no table at all, behaviour is exactly the pre-table behaviour", () => {
    parser.setMerchantTable(null);
    try {
      assertEq(parser.normalizeMerchant("SPOTIFY*USA"), "SPOTIFY");
      assertEq(parser.normalizeMerchant("PAYPAL *SPOTIFY"), "PAYPAL");
    } finally {
      parser.setMerchantTable(TABLE);
    }
  });

  test("re-injecting the table restores the fixed behaviour", () => {
    assertEq(n("PAYPAL *SPOTIFY"), "Spotify");
  });
});

suite("table structure", () => {
  test("declares a version", () => assertTrue(TABLE.version >= 1, "no version"));

  test("records when it was generated", () => {
    assertTrue(typeof TABLE.generatedAt === "string" && TABLE.generatedAt.length > 0,
      "generatedAt missing -- a stale table would be invisible");
  });

  test("is not empty", () => {
    assertTrue(TABLE.merchants.length >= 100, "only " + TABLE.merchants.length + " merchants");
    assertTrue(TABLE.aggregators.length >= 3, "only " + TABLE.aggregators.length + " aggregators");
  });

  test("every pattern is uppercase", () => {
    // Matching is indexOf against an uppercased descriptor, so a lowercase
    // pattern can never match anything.
    for (const m of TABLE.merchants) {
      assertEq(m.pattern, m.pattern.toUpperCase());
    }
  });

  test("no pattern is short enough to collide", () => {
    for (const m of TABLE.merchants) {
      assertTrue(m.pattern.length >= 4, "pattern too short: " + JSON.stringify(m.pattern));
    }
  });

  test("every entry has a display name", () => {
    for (const m of TABLE.merchants) {
      assertTrue(typeof m.name === "string" && m.name.trim().length > 0,
        "missing name for " + JSON.stringify(m.pattern));
    }
  });

  test("no duplicate patterns", () => {
    const seen = new Set();
    for (const m of TABLE.merchants) {
      assertTrue(!seen.has(m.pattern), "duplicate pattern: " + m.pattern);
      seen.add(m.pattern);
    }
  });
});

suite("recurring detection uses the table end to end", () => {
  test("PayPal-routed Spotify charges group into one subscription", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const t0 = Date.UTC(2026, 5, 1);
    const txns = [
      { dateMs: t0, desc: "PAYPAL *SPOTIFY", amount: -11.99 },
      { dateMs: t0 + 30 * DAY, desc: "SPOTIFY P34F9G8 NEW YORK NY", amount: -11.99 },
      { dateMs: t0 + 61 * DAY, desc: "SPOTIFY*USA", amount: -11.99 },
    ];
    const found = parser.detectRecurring(txns, t0 + 65 * DAY);
    assertEq(found.length, 1);
    assertEq(found[0].merchant, "Spotify");
    assertEq(found[0].count, 3);
  });
});
