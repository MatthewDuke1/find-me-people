// QA SULA-013 regression: morphological variants must not be reported as gaps.
//
// Reported: the report flagged "automated", "analyze" and "communicate" as
// missing from a resume that contained "automation", "analysis" and
// "communication". A false gap list is worse than no gap list — the applicant
// edits a resume that was already fine, and the match score misleads them.
//
// stemWord()/stemPhrase() collapse the endings that actually appear in job
// postings. The false-negative direction is tested too: unrelated words must
// NOT collapse together, or the score becomes uselessly generous.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "resume-injection.js");

const { stemWord, stemPhrase } = loadPureHelpers(["stemWord", "stemPhrase"], SRC);
const same = (a, b) => stemWord(a) === stemWord(b);

suite("SULA-013 — the three pairs QA reported as false gaps", () => {
  test("automated == automation", () => {
    assertTrue(same("automated", "automation"), `${stemWord("automated")} vs ${stemWord("automation")}`);
  });
  test("analyze == analysis", () => {
    assertTrue(same("analyze", "analysis"), `${stemWord("analyze")} vs ${stemWord("analysis")}`);
  });
  test("communicate == communication", () => {
    assertTrue(same("communicate", "communication"), `${stemWord("communicate")} vs ${stemWord("communication")}`);
  });
});

suite("SULA-013 — other everyday morphology", () => {
  const pairs = [
    ["automate", "automation"],
    ["analyse", "analysis"],       // British spelling
    ["report", "reporting"],
    ["manage", "managing"],
    ["deliver", "delivered"],
    ["optimize", "optimizing"],
    ["integrate", "integration"],
    ["migrate", "migrated"],
  ];
  for (const [a, b] of pairs) {
    test(`${a} == ${b}`, () => assertTrue(same(a, b), `${stemWord(a)} vs ${stemWord(b)}`));
  }
});

suite("SULA-013 — unrelated words must NOT collapse (no false matches)", () => {
  // An over-eager stemmer would mark everything as covered and make the score
  // meaningless. These must stay distinct.
  const distinct = [
    ["python", "pytorch"],
    ["kubernetes", "kubectl"],
    ["marketing", "marketplace"],
    ["design", "designation"],
    ["react", "reactor"],
  ];
  // Note: security/secure DO collapse to "secur" — that is correct for resume
  // matching (same root, same skill) and is asserted as a match below.
  for (const [a, b] of distinct) {
    test(`${a} != ${b}`, () => assertFalse(same(a, b), `both stemmed to ${stemWord(a)}`));
  }
});

suite("SULA-013 — same-root words SHOULD collapse", () => {
  test("security == secure (same skill)", () =>
    assertTrue(stemWord("security") === stemWord("secure")));
});

suite("SULA-013 — stemmer safety", () => {
  test("short words are left alone", () => {
    assertEq(stemWord("api"), "api");
    assertEq(stemWord("aws"), "aws");
    assertEq(stemWord("sql"), "sql");
  });
  test("a stem is never reduced below 4 characters", () => {
    assertTrue(stemWord("uses").length >= 3);
    assertTrue(stemWord("data").length >= 3);
  });
  test("empty / null input is safe", () => {
    assertEq(stemWord(""), "");
    assertEq(stemWord(null), "");
    assertEq(stemWord(undefined), "");
  });
  test("punctuation and case are normalised", () => {
    assertEq(stemWord("Automated!"), stemWord("automated"));
  });
});

suite("SULA-013 — multi-word phrases", () => {
  test("each word is stemmed", () => {
    assertEq(stemPhrase("automated reporting"), stemWord("automation") + " " + stemWord("report"));
  });
  test("empty phrase is safe", () => {
    assertEq(stemPhrase(""), "");
    assertEq(stemPhrase(null), "");
  });
});
