// Extract individual named functions / consts from content.js as evaluable
// code strings. content.js is an IIFE that runs in a browser context; here
// we pull out the pure (DOM-free) helpers so we can exercise them in Node
// without spinning up jsdom.
//
// The pure helpers we care about for unit testing:
//   - phoneKey           (canonical phone-dedup key)
//   - formatPhone        (US phone formatting)
//   - trimDigitPrefixBleed  (zip-code prefix stripping)
//   - decodeObfuscatedText  (email obfuscation decoder)
//   - PUBLIC_MAILBOX_HOSTS  (the Set used by domainFitScore)
//   - CONTACT_PAGE_PATTERNS (the URL pattern list)
//   - PHONE_PROXIMITY_ANCHORS (the keyword list)
//   - hasPhoneProximityAnchor
//   - surroundingTextFor
//   - lookupSiteOverride / SITE_OVERRIDES
//
// All non-DOM-touching. Anything that needs document/window/chrome is left
// for the future jsdom-based integration layer.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTENT_JS = path.join(__dirname, "..", "..", "content.js");

function readContent() {
  return fs.readFileSync(CONTENT_JS, "utf8");
}

// Extract a top-level "function NAME(...) { ... }" or "async function NAME(...) { ... }"
// from the IIFE body. Brace-counts to find the closing }.
function extractFunction(name) {
  const src = readContent();
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "m");
  const m = re.exec(src);
  if (!m) throw new Error(`Function not found in content.js: ${name}`);
  let i = m.index;
  while (src[i] !== "{") i++;
  let depth = 1;
  let j = i + 1;
  while (j < src.length && depth > 0) {
    const ch = src[j];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    j++;
  }
  return src.substring(m.index, j);
}

// Extract a "const NAME = ..." block up to its matching closing brace /
// bracket. Used for SITE_OVERRIDES, CONTACT_PAGE_PATTERNS, etc.
function extractConst(name) {
  const src = readContent();
  const re = new RegExp(`const\\s+${name}\\s*=\\s*([\\[{])`, "m");
  const m = re.exec(src);
  if (!m) throw new Error(`Const not found in content.js: ${name}`);
  const opener = m[1];
  const closer = opener === "{" ? "}" : "]";
  let i = m.index + m[0].length - 1;
  let depth = 1;
  let j = i + 1;
  while (j < src.length && depth > 0) {
    const ch = src[j];
    if (ch === opener) depth++;
    else if (ch === closer) depth--;
    j++;
  }
  return src.substring(m.index, j) + ";";
}

// Build a single eval-able string that defines the requested symbols at
// global scope. Returns an object with each symbol as a property.
export function loadPureHelpers(names) {
  const chunks = [];
  for (const n of names) {
    // Try const first, then function
    try { chunks.push(extractConst(n)); continue; } catch (_) {}
    chunks.push(extractFunction(n));
  }
  const wrapper = chunks.join("\n\n") + "\n\nreturn { " + names.join(", ") + " };";
  const fn = new Function(wrapper);
  return fn();
}
