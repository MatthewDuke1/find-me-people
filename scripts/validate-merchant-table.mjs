// Gate between a generated candidate and the shipped merchant-table.js.
//
// The generator is a language model running unattended on a schedule. That is
// fine for proposing coverage and unacceptable for writing directly into a
// shipped artifact: one bad aggregator token ("ADOBE" listed as a processor)
// silently deletes a real merchant name from every user's import. So nothing
// reaches merchant-table.js without clearing this file.
//
// Four checks, in order of how badly they fail:
//   1. Schema      -- shape, character set, minimum pattern length.
//   2. Coherence   -- a token cannot be both an aggregator and a merchant.
//   3. Coverage    -- a regeneration may add merchants; it may not drop them.
//   4. Golden      -- scripts/merchant-golden.json run through the REAL
//                     normalizeMerchant with the candidate injected.
//
// Check 4 is the one that matters: it exercises the actual shipped code path
// rather than the candidate in isolation.
//
// WARN vs FAIL. A single malformed entry is DROPPED with a warning, not
// treated as a failure: once dropped it is merely absent, which is harmless,
// and hard-failing the run over one bad row would mean any unattended refresh
// could be blocked indefinitely by a model quirk -- making the schedule
// useless. Systemic damage (a contradictory aggregator, lost coverage, a
// golden regression) still fails hard, because those change the meaning of
// entries that remain. Warnings are printed so they reach the PR body.
//
// Usage:  node scripts/validate-merchant-table.mjs [--promote]
//         (without --promote it reports and writes nothing)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadModuleApi } from "../tests/lib/extract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CANDIDATE = path.join(__dirname, "merchant-table.candidate.json");
const TARGET = path.join(ROOT, "merchant-table.js");
const GOLDEN = path.join(__dirname, "merchant-golden.json");

const PROMOTE = process.argv.includes("--promote");
const failures = [];
const warnings = [];
const fail = (msg) => failures.push(msg);
const warn = (msg) => warnings.push(msg);

if (!fs.existsSync(CANDIDATE)) {
  console.error("No candidate at " + path.relative(ROOT, CANDIDATE));
  console.error("Run: node scripts/generate-merchant-table.mjs");
  process.exit(1);
}

const cand = JSON.parse(fs.readFileSync(CANDIDATE, "utf8"));
const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));

// ---- 1. schema ----------------------------------------------------------
// Patterns are matched with indexOf, never compiled as regexes, so "/" and "'"
// are safe and genuinely occur -- "APPLE.COM/BILL" is one of the most common
// subscription descriptors in existence.
const SAFE_PATTERN = /^[A-Z0-9 .&'/-]+$/;
const AGG_TOKEN = /^[A-Z0-9]{1,10}$/;

if (!Array.isArray(cand.aggregators)) fail("aggregators is not an array");
if (!Array.isArray(cand.merchants)) fail("merchants is not an array");

const aggregators = [];
for (const raw of cand.aggregators || []) {
  const a = String(raw).toUpperCase().trim();
  if (!AGG_TOKEN.test(a)) {
    warn("dropped aggregator " + JSON.stringify(a) + ": not a short uppercase token");
    continue;
  }
  aggregators.push(a);
}

const seen = new Map();
const merchants = [];
for (const m of cand.merchants || []) {
  const pattern = String((m && m.pattern) || "").toUpperCase().trim();
  const name = String((m && m.name) || "").trim();
  if (!pattern || !name) {
    warn("dropped incomplete merchant entry: " + JSON.stringify(m));
    continue;
  }
  // Short patterns are the dangerous ones -- "AAA" or "SP" would match inside
  // a thousand unrelated descriptors, and whichever sorted first would win.
  if (pattern.length < 4) {
    warn("dropped " + JSON.stringify(pattern) + " (" + name + "): shorter than 4 characters");
    continue;
  }
  if (!SAFE_PATTERN.test(pattern)) {
    warn("dropped " + JSON.stringify(pattern) + " (" + name + "): unsafe characters");
    continue;
  }
  if (seen.has(pattern)) {
    // Two names for one pattern is a genuine contradiction, not a stray row:
    // whichever wins changes how an existing descriptor resolves.
    if (seen.get(pattern) !== name) {
      fail("pattern " + JSON.stringify(pattern) + " maps to both " +
        JSON.stringify(seen.get(pattern)) + " and " + JSON.stringify(name));
    }
    continue;
  }
  seen.set(pattern, name);
  merchants.push({ pattern, name });
}

// ---- 2. coherence -------------------------------------------------------
for (const a of aggregators) {
  if (seen.has(a)) {
    fail(JSON.stringify(a) + " is listed as both an aggregator and a merchant pattern");
  }
}

// ---- 3. coverage --------------------------------------------------------
function shippedTable() {
  if (!fs.existsSync(TARGET)) return null;
  const src = fs.readFileSync(TARGET, "utf8");
  const m = src.match(/window\.SulaMerchantTable\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return null;
  try {
    return new Function("return " + m[1])();
  } catch (_) {
    return null;
  }
}

const prev = shippedTable();
if (prev && Array.isArray(prev.merchants)) {
  const nowPatterns = new Set(merchants.map((m) => m.pattern));
  const dropped = prev.merchants.map((m) => m.pattern).filter((p) => !nowPatterns.has(p));
  if (dropped.length) {
    fail("candidate drops " + dropped.length + " merchant pattern(s) present in the shipped table: " +
      dropped.slice(0, 12).join(", ") + (dropped.length > 12 ? ", ..." : ""));
  }
}

// ---- 4. golden, through the real parser ---------------------------------
// Injecting the candidate into the actual statement-parser.js is the whole
// point. Validating the JSON against itself would prove nothing about what a
// user's import will do.
const table = {
  version: 1,
  generatedAt: cand.generatedAt || null,
  aggregators,
  merchants,
};

const parser = loadModuleApi(path.join(ROOT, "statement-parser.js"), "SulaStatementParser");
if (typeof parser.setMerchantTable !== "function") {
  fail("statement-parser.js does not expose setMerchantTable -- cannot validate against the real code path");
} else {
  parser.setMerchantTable(table);
  const n = parser.normalizeMerchant;

  for (const c of golden.cases || []) {
    const got = n(c.desc);
    if (got !== c.expect) {
      fail("golden: " + JSON.stringify(c.desc) + " -> " + JSON.stringify(got) +
        ", expected " + JSON.stringify(c.expect));
    }
  }
  for (const pair of golden.mustDiffer || []) {
    if (n(pair[0]) === n(pair[1])) {
      fail("golden: " + JSON.stringify(pair[0]) + " and " + JSON.stringify(pair[1]) +
        " both normalise to " + JSON.stringify(n(pair[0])) + " but must differ");
    }
  }
  for (const pair of golden.mustMatch || []) {
    if (n(pair[0]) !== n(pair[1])) {
      fail("golden: " + JSON.stringify(pair[0]) + " -> " + JSON.stringify(n(pair[0])) +
        " and " + JSON.stringify(pair[1]) + " -> " + JSON.stringify(n(pair[1])) + " but must match");
    }
  }
}

// ---- report -------------------------------------------------------------
console.log("Candidate: " + aggregators.length + " aggregators, " + merchants.length + " merchants");

if (warnings.length) {
  console.log("\n" + warnings.length + " entry/entries dropped (not fatal):");
  for (const w of warnings) console.log("  - " + w);
}

if (failures.length) {
  console.error("\nREJECTED -- " + failures.length + " problem(s):");
  for (const f of failures) console.error("  - " + f);
  console.error("\nmerchant-table.js was NOT modified.");
  process.exit(1);
}

console.log("All checks passed" + (PROMOTE ? "" : " (dry run -- pass --promote to write merchant-table.js)"));
if (!PROMOTE) process.exit(0);

const HEADER = [
  "// Sula — merchant descriptor table (GENERATED, DO NOT EDIT BY HAND).",
  "//",
  "// Regenerate with:  node scripts/generate-merchant-table.mjs",
  "// Promote with:     node scripts/validate-merchant-table.mjs --promote",
  "//",
  "// Static data, produced at build time on a maintainer's machine. The",
  "// extension never calls a model and never sends a statement anywhere — see",
  "// the header of statement-parser.js. Hand edits are lost on the next",
  "// regeneration; to pin a specific descriptor's behaviour, add it to",
  "// scripts/merchant-golden.json instead.",
  "//",
  "// generatedAt: " + (table.generatedAt || "unknown"),
  "// window.SulaMerchantTable",
  "",
  "window.SulaMerchantTable = " + JSON.stringify(table, null, 2) + ";",
  "",
  'if (typeof module !== "undefined" && module.exports) module.exports = window.SulaMerchantTable;',
  "",
].join("\n");

fs.writeFileSync(TARGET, HEADER);
console.log("Promoted -> " + path.relative(ROOT, TARGET));
