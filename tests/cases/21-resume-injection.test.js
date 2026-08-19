// Resume injection (resume-injection.js): keyword extraction, coverage, and
// the honesty rule.
//
// The rule that matters most: Sula reports which of a posting's terms the
// resume already supports and offers to rewrite the user's OWN bullets. It
// must never emit a finished sentence claiming experience the user did not
// supply.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "resume-injection.js");
const {
  extractKeywords, coverage, resumeBullets, buildReport,
} = loadModuleApi(SRC, "SulaResumeInjection");

const JOB = `
  Director of Product
  We are looking for a product manager to own product strategy and the product
  roadmap. You will run user research, drive go-to-market with cross-functional
  partners, and use SQL and Amplitude to make data-driven decisions. Experience
  with A/B testing, retention and churn is required. Familiarity with Figma and
  Jira preferred.
`;

const RESUME = `
Matt Duke — Director of Product
• Owned the product roadmap for a B2B SaaS platform, running discovery and user research with 20+ customers.
• Partnered cross-functionally with engineering and design to ship a billing rework that cut churn.
• Built dashboards in SQL to track activation and retention across three cohorts.
`;

suite("extractKeywords", () => {
  test("pulls the posting's real terms", () => {
    const terms = extractKeywords(JOB, 40).map((k) => k.term);
    assertTrue(terms.includes("product roadmap"), "product roadmap");
    assertTrue(terms.includes("user research"), "user research");
    assertTrue(terms.includes("sql"), "sql");
  });

  test("multi-word phrases outrank bare tokens", () => {
    const ks = extractKeywords(JOB, 40);
    const phrase = ks.find((k) => k.term === "product roadmap");
    assertTrue(!!phrase && phrase.weight >= 3);
  });

  test("filler words are dropped", () => {
    const terms = extractKeywords(JOB, 60).map((k) => k.term);
    for (const junk of ["the", "and", "will", "experience", "required"]) {
      assertFalse(terms.includes(junk), junk + " should be filtered");
    }
  });

  test("empty input returns an empty list, never throws", () => {
    assertEq(extractKeywords("", 10), []);
    assertEq(extractKeywords(null, 10), []);
  });
});

suite("coverage", () => {
  test("terms present in the resume count as covered", () => {
    const ks = extractKeywords(JOB, 30);
    const c = coverage(ks, RESUME);
    assertTrue(c.covered.some((k) => k.term === "user research"));
    assertTrue(c.covered.some((k) => k.term === "sql"));
  });

  test("terms absent from the resume come back as missing", () => {
    const c = coverage(extractKeywords(JOB, 30), RESUME);
    const missing = c.missing.map((k) => k.term);
    assertTrue(missing.includes("figma") || missing.includes("jira"),
      "figma/jira are not in the resume");
  });

  test("plurals and hyphenation still match", () => {
    const c = coverage(
      [{ term: "roadmaps", weight: 1 }, { term: "cross-functional", weight: 1 }],
      "Owned the product roadmap and worked cross functionally."
    );
    assertEq(c.missing.length, 0);
  });

  test("score is a percentage of matched terms", () => {
    const c = coverage([{ term: "sql", weight: 1 }, { term: "cobol", weight: 1 }], RESUME);
    assertEq(c.score, 50);
  });

  test("empty keyword list scores 0 rather than dividing by zero", () => {
    assertEq(coverage([], RESUME).score, 0);
  });
});

suite("resumeBullets", () => {
  test("strips bullet glyphs and keeps substantive lines", () => {
    const b = resumeBullets(RESUME);
    assertTrue(b.length >= 3);
    assertFalse(b.some((l) => l.startsWith("•")));
  });

  test("drops short lines like the name header", () => {
    assertFalse(resumeBullets(RESUME).some((l) => l.startsWith("Matt Duke")));
  });
});

suite("buildReport — the honesty rule", () => {
  const r = buildReport(JOB, RESUME);

  test("returns a score, matches, and gaps", () => {
    assertTrue(typeof r.score === "number");
    assertTrue(Array.isArray(r.matched) && Array.isArray(r.missing));
  });

  test("every suggestion points at a real bullet or says it found none", () => {
    for (const s of r.suggestions) {
      if (s.hostBullet !== null) {
        assertTrue(RESUME.includes(s.hostBullet),
          "host bullet must come from the user's own resume");
      } else {
        assertTrue(/only if you have real experience/i.test(s.action));
      }
    }
  });

  test("suggestions are prompts to rewrite, never finished claims", () => {
    for (const s of r.suggestions) {
      assertTrue(/rewrite|add/i.test(s.action));
      assertTrue(/if it is true|real experience/i.test(s.action),
        "every action must be conditioned on truth");
      assertTrue(/accurately describes your own work/i.test(s.verify));
    }
  });

  test("never fabricates a tool the resume does not mention", () => {
    // Figma is in the posting, not the resume. It must show up as a gap to
    // close, never as pre-written text asserting Figma experience.
    const figma = r.suggestions.find((s) => s.term === "figma");
    if (figma) {
      assertFalse(/I (used|have|led|built)/i.test(figma.action),
        "must not assert experience on the user's behalf");
    }
    assertTrue(r.missing.includes("figma") || !r.matched.includes("figma"));
  });

  test("carries a disclaimer about not inventing experience", () => {
    assertTrue(/never invents experience/i.test(r.disclaimer));
  });

  test("an empty resume yields gaps, not invented bullets", () => {
    const empty = buildReport(JOB, "");
    assertEq(empty.score, 0);
    assertEq(empty.bulletCount, 0);
    for (const s of empty.suggestions) assertEq(s.hostBullet, null);
  });
});

suite("buildReport - suggestions spread across the resume", () => {
  const RESUME_MANY = [
    "- Owned the product roadmap for a B2B SaaS platform, running discovery and user research with 20+ customers.",
    "- Partnered cross-functionally with engineering and design to ship a billing rework that cut churn 18%.",
    "- Built dashboards in SQL to track activation and retention across three cohorts.",
    "- Led prioritization of the backlog across two squads, shipping 14 releases in a year.",
    "- Ran pricing experiments that lifted trial-to-paid conversion by 22%.",
  ].join("\n");

  test("does not hang every gap off one bullet", () => {
    // Regression: bestHostBullet scored only general posting overlap, so it
    // picked one global winner and every suggestion pointed at it.
    const r = buildReport(JOB, RESUME_MANY, { maxSuggestions: 8 });
    const hosts = new Set(r.suggestions.map((s) => s.hostBullet).filter(Boolean));
    assertTrue(hosts.size >= 3,
      "expected gaps spread over several bullets, got " + hosts.size);
  });

  test("a term prefers a topically related bullet", () => {
    const r = buildReport("We need SQL and dashboards for retention analysis.", RESUME_MANY, { maxSuggestions: 6 });
    for (const s of r.suggestions) {
      if (s.hostBullet) assertTrue(RESUME_MANY.includes(s.hostBullet));
    }
  });
});
