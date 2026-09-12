// Regenerate the merchant-descriptor table using Claude Code in headless mode.
//
// WHY THIS RUNS AT BUILD TIME AND NOT IN THE EXTENSION
// ---------------------------------------------------
// "PAYPAL *SPOTIFY" means Spotify for every user on earth. The descriptor ->
// merchant mapping is the same finite table for everybody, so there is no
// reason to pay for it per user, per import, at runtime. Generating it here and
// shipping the result as static data means the extension makes zero network
// calls, needs no API key, works offline, and the promise in statement-parser.js
// -- that a statement is parsed entirely in the browser and never sent anywhere
// -- stays literally true. Nothing about a user's statement is involved in
// producing this file.
//
// AUTH: shells out to the `claude` CLI, which uses the local Claude Code
// subscription credentials. There is no ANTHROPIC_API_KEY in this path and none
// is needed. That also means this script CANNOT run in GitHub Actions -- those
// credentials are local to the machine. Schedule it locally (see
// scripts/refresh-merchant-table.ps1).
//
// OUTPUT: scripts/merchant-table.candidate.json -- a CANDIDATE. This script
// never writes the shipped merchant-table.js. Promotion is
// scripts/validate-merchant-table.mjs's job, and it refuses candidates that
// fail scripts/merchant-golden.json. Cron proposes; the gate disposes.
//
// Usage:  node scripts/generate-merchant-table.mjs [--dry-run]

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CANDIDATE = path.join(__dirname, "merchant-table.candidate.json");
const CURRENT = path.join(ROOT, "merchant-table.js");
const GOLDEN = path.join(__dirname, "merchant-golden.json");

const DRY = process.argv.includes("--dry-run");

// Read the committed table so the model extends what exists rather than
// re-deriving it. A regeneration that drops half the merchants is a silent
// coverage regression the golden file would not necessarily catch.
function currentTable() {
  if (!fs.existsSync(CURRENT)) return { aggregators: [], merchants: [] };
  const src = fs.readFileSync(CURRENT, "utf8");
  const m = src.match(/window\.SulaMerchantTable\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return { aggregators: [], merchants: [] };
  try {
    return new Function("return " + m[1])();
  } catch (_) {
    return { aggregators: [], merchants: [] };
  }
}

const existing = currentTable();
const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));

const PROMPT = `You are generating a static lookup table for a browser extension that
identifies recurring subscriptions in a user's own bank statement export.

Bank statement descriptors are noisy. Two problems need solving:

1. PAYMENT AGGREGATOR PREFIXES. Descriptors like "PAYPAL *SPOTIFY",
   "SQ *BLUE BOTTLE" or "TST* CHIPOTLE" name the payment processor first and the
   actual merchant after the separator. The merchant is what follows. List the
   short uppercase prefix tokens used by real payment processors and
   marketplaces in US and EU bank descriptors.

2. CANONICAL MERCHANT NAMES. A descriptor like "SPOTIFY P34F9G8 NEW YORK NY"
   and "SPOTIFY*USA" are the same merchant and must map to one name, so that
   charges group together across months.

Return ONLY a JSON object, no prose, no markdown fences, in exactly this shape:

{
  "aggregators": ["PAYPAL", "SQ", "TST"],
  "merchants": [
    { "pattern": "SPOTIFY", "name": "Spotify" },
    { "pattern": "NETFLIX", "name": "Netflix" }
  ]
}

Rules, all of which matter:
- "pattern" is an UPPERCASE literal substring, never a regex. It is matched
  case-insensitively against the descriptor. No anchors, no wildcards, no
  special characters beyond letters, digits, space, dot, ampersand and hyphen.
- Prefer the most distinctive substring. "SPOTIFY" not "SPOT".
- Never use a pattern so short or generic it would match an unrelated merchant.
  Patterns under 4 characters are rejected by the validator.
- "name" is the human brand name in normal title case: "DoorDash", "Adobe".
- Do NOT invent merchants. Only include brands you are confident bill real
  consumers, weighted toward recurring subscriptions: streaming, software,
  gyms, telecom, news, cloud storage, meal kits, insurance, gaming.
- An aggregator token must be a genuine processor prefix. Do not list ordinary
  merchants as aggregators. Getting this wrong deletes a real merchant name.
- Include at least 150 merchants and aim for broad coverage of recurring billers.

These descriptors MUST resolve correctly; they are pinned regression cases:
${golden.cases.map((c) => `  ${JSON.stringify(c.desc)} -> ${JSON.stringify(c.expect)}`).join("\n")}

Here is the table currently shipping. Keep every entry that is still correct and
add to it; removing a correct entry is a coverage regression:
${JSON.stringify({ aggregators: existing.aggregators || [], merchants: existing.merchants || [] }, null, 1)}
`;

if (DRY) {
  console.log(PROMPT);
  process.exit(0);
}

console.log("Asking Claude for a merchant table (subscription auth, no API key)...");

// The prompt goes in on stdin, not as an argv. It is several KB and embeds the
// whole current table; as a command-line argument it blows past the Windows
// command-length limit and the CLI never sees it.
let raw;
try {
  raw = execFileSync("claude", ["-p"], {
    input: PROMPT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
  });
} catch (err) {
  console.error("claude CLI failed:", err.message);
  console.error("Is `claude` on PATH and logged in? Try: claude --version");
  process.exit(1);
}

// Be forgiving about fences/preamble, strict about the payload.
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object found in model output");
  }
  return JSON.parse(body.slice(start, end + 1));
}

let parsed;
try {
  parsed = extractJson(raw);
} catch (err) {
  console.error("Could not parse model output:", err.message);
  fs.writeFileSync(CANDIDATE + ".raw.txt", raw);
  console.error("Raw output saved to " + CANDIDATE + ".raw.txt");
  process.exit(1);
}

const out = {
  generatedAt: new Date().toISOString(),
  generator: "scripts/generate-merchant-table.mjs",
  aggregators: parsed.aggregators || [],
  merchants: parsed.merchants || [],
};

fs.writeFileSync(CANDIDATE, JSON.stringify(out, null, 2) + "\n");
console.log(
  `Wrote candidate: ${path.relative(ROOT, CANDIDATE)} ` +
    `(${out.aggregators.length} aggregators, ${out.merchants.length} merchants)`
);
console.log("Nothing shipped yet. Next: node scripts/validate-merchant-table.mjs");
