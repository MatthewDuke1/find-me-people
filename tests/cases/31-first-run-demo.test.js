// First-run demo panel.
//
// A new user whose first page has no contacts used to see nothing at all: the
// panel bails when total === 0, and the popup onboarding only fires if they
// click the toolbar icon -- which is the exact thing onboarding exists to
// teach. So the first page load after install force-mounts the panel with
// worked examples.
//
// The risk that needs pinning is not "does it render" but "can a user mistake
// the examples for real contacts and try to use them". These addresses and
// this number must be unreachable by construction, and shaped exactly like
// real scan output so no demo-only render path exists to drift.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";

const { spDemoResults } = loadPureHelpers(["spDemoResults"]);

suite("first-run demo: unreachable by construction", () => {
  test("every email uses the reserved example.com domain", () => {
    for (const e of spDemoResults().emails) {
      assertTrue(/@example\.com$/.test(e.value), e.value + " is not @example.com");
    }
  });

  test("every phone is in the reserved 555-01xx range", () => {
    for (const p of spDemoResults().phones) {
      const digits = String(p.value).replace(/\D/g, "");
      assertTrue(/^555 ?01/.test(digits.slice(0, 6).replace(/^(\d{3})/, "$1 ")),
        p.value + " is not a reserved 555-01xx number");
    }
  });

  test("no example could reach a real mailbox", () => {
    const all = spDemoResults().emails.map((e) => e.value).join(" ");
    assertTrue(!/gmail|outlook|yahoo|proton|icloud/i.test(all), "used a live mail provider");
  });
});

suite("first-run demo: shaped like real scan output", () => {
  const d = spDemoResults();

  test("has both emails and phones", () => {
    assertTrue(Array.isArray(d.emails) && d.emails.length > 0, "no emails");
    assertTrue(Array.isArray(d.phones) && d.phones.length > 0, "no phones");
  });

  test("every row carries value, score and source", () => {
    for (const r of [...d.emails, ...d.phones]) {
      assertTrue(typeof r.value === "string" && r.value.length > 0, "missing value");
      assertTrue(typeof r.score === "number", "missing score");
      assertTrue(typeof r.source === "string" && r.source.length > 0, "missing source");
    }
  });

  test("scores are in the real 0-100 range", () => {
    for (const r of [...d.emails, ...d.phones]) {
      assertTrue(r.score >= 0 && r.score <= 100, r.value + " score out of range");
    }
  });

  test("sources are ones spProvenanceDescription actually explains", () => {
    const known = ["mailto", "tel", "meta", "press", "footer", "site-override", "globals"];
    for (const r of [...d.emails, ...d.phones]) {
      assertTrue(known.includes(r.source), r.source + " has no provenance copy");
    }
  });

  test("rows are ordered best-first, like a real scan", () => {
    const scores = d.emails.map((e) => e.score);
    assertEq(scores.slice().sort((a, b) => b - a).join(","), scores.join(","));
  });

  test("returns a fresh object each call so a render cannot mutate the fixture", () => {
    const a = spDemoResults();
    a.emails.push({ value: "x@example.com", score: 1, source: "mailto" });
    assertTrue(spDemoResults().emails.length < a.emails.length, "fixture was shared");
  });
});
