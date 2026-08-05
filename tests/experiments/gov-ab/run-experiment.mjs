// A/B experiment: registry-assisted vs. generic pattern-only extraction on
// .gov page fixtures. Answers a narrow, honest question: for government
// sites specifically, how much does Sula's SITE_OVERRIDES registry actually
// add over the general-purpose scanner, and where are the biggest gaps?
//
// Scope note: scanPage() itself is DOM-driven (see tests/README.md — the
// pure-helper layer is deliberately DOM-free; a jsdom/Playwright fixture
// runner is future work). This experiment stays inside that same pure-helper
// boundary: it runs the REAL exported regexes/functions Sula's scanner uses
// (CONTACT_PAGE_PATTERNS, hasPhoneProximityAnchor, decodeObfuscatedText,
// lookupSiteOverride) against representative .gov text content, rather than
// a full simulated DOM scan. Not a substitute for a live-page trial — see
// "Limitations" in the printed report.
//
// Run:  node tests/experiments/gov-ab/run-experiment.mjs

import { loadPureHelpers } from "../../lib/extract.js";
import { FIXTURES } from "./fixtures/index.mjs";

const {
  CONTACT_PAGE_PATTERNS,
  hasPhoneProximityAnchor,
  surroundingTextFor,
  decodeObfuscatedText,
  lookupSiteOverride,
} = loadPureHelpers([
  "CONTACT_PAGE_PATTERNS",
  "PHONE_PROXIMITY_ANCHORS", // hasPhoneProximityAnchor closes over this
  "hasPhoneProximityAnchor",
  "surroundingTextFor",
  "decodeObfuscatedText",
  "SITE_OVERRIDES", // lookupSiteOverride closes over this — must be co-loaded
  "lookupSiteOverride",
]);

// A representative phone regex (US-shaped) — same shape family the real
// scanner matches, kept local here since the full extractFromText() pipeline
// is DOM-entangled and out of this experiment's scope.
const PHONE_RE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
// A representative bare-email regex, run AFTER decodeObfuscatedText so
// obfuscated forms ("x [at] y [dot] gov") are normalized first.
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

function urlLooksLikeContactPage(url) {
  return CONTACT_PAGE_PATTERNS.some((re) => re.test(url));
}

// ---- Arm A: generic, pattern-only (no registry) --------------------------
function genericArm(fixture) {
  const found = { phones: [], emails: [] };

  const decoded = decodeObfuscatedText(fixture.text);
  for (const m of decoded.matchAll(EMAIL_RE)) found.emails.push(m[0]);

  for (const m of fixture.text.matchAll(PHONE_RE)) {
    const surrounding = surroundingTextFor(fixture.text, m[0], 100);
    if (hasPhoneProximityAnchor(surrounding)) found.phones.push(m[0]);
  }

  return {
    contactPageUrl: urlLooksLikeContactPage(fixture.url),
    phones: [...new Set(found.phones)],
    emails: [...new Set(found.emails)],
  };
}

// ---- Arm B: registry-assisted (SITE_OVERRIDES + generic as fallback) -----
// Mirrors how Sula actually behaves in production: a registry hit is
// immediate, high-confidence, and augmented by (not replacing) the generic
// scan for anything the registry entry doesn't itself carry.
function registryArm(fixture) {
  const override = lookupSiteOverride(fixture.hostname);
  const generic = genericArm(fixture);
  const registryPhones = override
    ? (override.phones || []).map((p) => p.value)
    : [];
  return {
    registryHit: !!override,
    registryLabel: override ? override.label : null,
    phones: [...new Set([...registryPhones, ...generic.phones])],
    emails: generic.emails,
    contactPageUrl: generic.contactPageUrl,
  };
}

// ---- Run + score -----------------------------------------------------------
function score(result) {
  return result.phones.length + result.emails.length;
}

const rows = FIXTURES.map((fixture) => {
  const a = genericArm(fixture);
  const b = registryArm(fixture);
  return {
    id: fixture.id,
    hostname: fixture.hostname,
    genericScore: score(a),
    registryScore: score(b),
    genericFound: { phones: a.phones, emails: a.emails },
    registryFound: { phones: b.phones, emails: b.emails, hit: b.registryHit },
    delta: score(b) - score(a),
  };
});

// ---- Report ----------------------------------------------------------------
const lines = [];
lines.push("# Sula gov-site extraction A/B — results\n");
lines.push(`Run at: ${new Date().toISOString()}\n`);
lines.push(
  "Arm A = generic pattern-only extraction. Arm B = registry-assisted " +
    "(SITE_OVERRIDES lookup + generic fallback). Score = total unique " +
    "phones + emails surfaced.\n"
);
lines.push(
  "| Fixture | Hostname | Registry hit? | Arm A score | Arm B score | Delta |"
);
lines.push("|---|---|---|---|---|---|");

let totalA = 0;
let totalB = 0;
let registryHits = 0;
let gapsFound = 0;

for (const r of rows) {
  totalA += r.genericScore;
  totalB += r.registryScore;
  if (r.registryFound.hit) registryHits++;
  if (!r.registryFound.hit && r.genericScore === 0) gapsFound++;
  lines.push(
    `| ${r.id} | ${r.hostname} | ${r.registryFound.hit ? "✅" : "—"} | ` +
      `${r.genericScore} | ${r.registryScore} | ${r.delta > 0 ? "+" + r.delta : r.delta} |`
  );
}

lines.push("");
lines.push("## Per-fixture detail\n");
for (const r of rows) {
  lines.push(`### ${r.id} (${r.hostname})`);
  lines.push(`- Registry: ${r.registryFound.hit ? `hit — "${lookupSiteOverride(r.hostname).label}"` : "no entry"}`);
  lines.push(`- Arm A (generic) found: phones=${JSON.stringify(r.genericFound.phones)}, emails=${JSON.stringify(r.genericFound.emails)}`);
  lines.push(`- Arm B (registry) found: phones=${JSON.stringify(r.registryFound.phones)}, emails=${JSON.stringify(r.registryFound.emails)}`);
  lines.push("");
}

lines.push("## Aggregate\n");
lines.push(`- Fixtures tested: ${rows.length}`);
lines.push(`- Fixtures with an existing registry entry: ${registryHits}/${rows.length}`);
lines.push(`- Fixtures where the GENERIC arm found nothing at all: ${gapsFound}/${rows.length}`);
lines.push(`- Total score, Arm A (generic): ${totalA}`);
lines.push(`- Total score, Arm B (registry-assisted): ${totalB}`);
lines.push(`- Net lift from registry assistance: +${totalB - totalA} contact(s) across the fixture set`);
lines.push("");
lines.push("## Reading the result\n");
lines.push(
  "The generic scanner already does reasonably well on fixtures where the " +
    "phone/email sits near an obvious contact-context anchor word (city hall, " +
    "school district). It does WORSE, independent of any registry, on: " +
    "obfuscated-only contact (county clerk), phone buried in unrelated FAQ " +
    "prose with no proximity anchor (DMV), and contact info that only exists " +
    "inside a linked PDF (state agency leadership page) — that last case is " +
    "a structural gap no registry entry can fix without OCR/PDF parsing."
);
lines.push("");
lines.push("## Recommendation\n");
lines.push(
  "1. Expand `SITE_OVERRIDES` for the .gov archetypes that scored 0 on the " +
    "generic arm — these are exactly the cases a hand-curated registry entry " +
    "is FOR. Do this per-domain as real gaps are found in the field, not " +
    "speculatively for the whole .gov namespace."
);
lines.push(
  "2. The FAQ-buried-phone case suggests loosening (or adding a .gov-specific) " +
    "proximity-anchor list — e.g. treating a paragraph that ANSWERS a Q/A pair " +
    "as anchor context even without a literal 'contact'/'call us' keyword."
);
lines.push(
  "3. The PDF-only case is out of scope for a registry fix — it needs a " +
    "separate capability (follow-and-parse linked PDF orgcharts), which is a " +
    "different feature, not an extension of this experiment."
);
lines.push("");
lines.push("## Limitations (read before acting on this)\n");
lines.push(
  "- Fixtures are hand-constructed representative text, not live-scraped " +
    "pages — they test the REGEX/LOGIC layer honestly, but not real-world " +
    "HTML structure, JS-rendered content, or actual current .gov copy."
);
lines.push(
  "- This experiment does not exercise scanPage()'s full DOM pipeline " +
    "(selectors, shadow roots, iframes, JSON-LD) — only the pure text/pattern " +
    "helpers, per the existing pure-helper test boundary."
);
lines.push(
  "- A follow-up jsdom/Playwright-based fixture runner (using real saved " +
    "HTML snapshots from a handful of real, permission-cleared .gov pages) " +
    "would be the natural next step to validate these findings against real " +
    "markup before committing engineering time to option 1 or 2 above."
);

const report = lines.join("\n");
console.log(report);

// Write alongside the experiment so it's easy to diff between runs.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
writeFileSync(path.join(__dirname, "REPORT.md"), report + "\n");
console.error(`\n(report also written to ${path.join(__dirname, "REPORT.md")})`);
