// Extract individual named functions / consts from a source file as evaluable
// code strings. The source is a plain top-level-declarations file (or an IIFE
// body, like content.js) that runs in a browser context; here we pull out the
// pure (DOM-free) helpers so we can exercise them in Node without spinning up
// jsdom.
//
// Default source is content.js. The pure helpers historically pulled from it:
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
// Other content-script files (e.g. email-verify.js) can be targeted via the
// optional `sourceFile` param to loadPureHelpers, so they get the same
// no-jsdom-needed pure-helper test treatment without duplicating this file.
//
// All non-DOM-touching. Anything that needs document/window/chrome is left
// for the future jsdom-based integration layer.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTENT_JS = path.join(__dirname, "..", "..", "content.js");

function readSource(sourceFile) {
  return fs.readFileSync(sourceFile || CONTENT_JS, "utf8");
}

// Extract a top-level "function NAME(...) { ... }" or "async function NAME(...) { ... }"
// from the IIFE body. Brace-counts to find the closing }.
function extractFunction(name, sourceFile) {
  const src = readSource(sourceFile);
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "m");
  const m = re.exec(src);
  if (!m) throw new Error(`Function not found in ${sourceFile || "content.js"}: ${name}`);
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
// bracket / paren. Used for SITE_OVERRIDES, CONTACT_PAGE_PATTERNS, the
// DISPOSABLE_DOMAINS Set, etc.
//
// Two opener shapes are supported:
//   - `[` / `{` (array or object literal) — depth-counted on that pair.
//   - `new ClassName(` (e.g. `new Set([...])`, `new Map([...])`) —
//     depth-counted on parens instead, closing at the matching `)`.
// A regex-literal const (e.g. `const RE = /.../`) is intentionally NOT
// supported here — hand-parsing a regex literal's own internal `/` and `[]`
// escaping correctly is real parser complexity for one construct; prefer
// inlining a regex literal inside the function that uses it instead of
// exporting it as a standalone testable const.
function extractConst(name, sourceFile) {
  const src = readSource(sourceFile);

  const newRe = new RegExp(`const\\s+${name}\\s*=\\s*new\\s+\\w+\\s*\\(`, "m");
  const newMatch = newRe.exec(src);
  if (newMatch) {
    let i = newMatch.index + newMatch[0].length - 1; // sitting on the opening "("
    let depth = 1;
    let j = i + 1;
    while (j < src.length && depth > 0) {
      const ch = src[j];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      j++;
    }
    return src.substring(newMatch.index, j) + ";";
  }

  const re = new RegExp(`const\\s+${name}\\s*=\\s*([\\[{])`, "m");
  const m = re.exec(src);
  if (!m) throw new Error(`Const not found in ${sourceFile || "content.js"}: ${name}`);
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
// `sourceFile` (absolute path) defaults to content.js for back-compat with
// every existing call site.
//
// Use this for INDIVIDUAL pure helpers (content.js's phoneKey, etc.). For a
// module that exposes a cohesive API object via `window.SulaX = {...}` (and
// whose internals have deep interdependencies), prefer loadModuleApi below —
// it avoids having to hand-order a dozen transitive-dependency symbols.
export function loadPureHelpers(names, sourceFile) {
  const chunks = [];
  for (const n of names) {
    // Try const first, then function
    try { chunks.push(extractConst(n, sourceFile)); continue; } catch (_) {}
    chunks.push(extractFunction(n, sourceFile));
  }
  const wrapper = chunks.join("\n\n") + "\n\nreturn { " + names.join(", ") + " };";
  const fn = new Function(wrapper);
  return fn();
}

// Load a whole window-exposing module (e.g. email-verify.js, advocacy-letters.js)
// by evaluating its full IIFE against a minimal stubbed `window`/`chrome`, then
// returning the API object it assigns to `window.<globalName>`. This mirrors how
// the module actually runs in the extension, so we test the real composed
// surface rather than hand-extracted internals. `chromeStub` lets a test supply
// storage/runtime fakes for functions that touch chrome.* (defaults to no-op).
export function loadModuleApi(sourceFile, globalName, chromeStub) {
  const src = readSource(sourceFile);
  const win = {};
  const chrome = chromeStub || {
    storage: { local: { get: (k, cb) => cb && cb({}), set: (o, cb) => cb && cb() } },
    runtime: {},
  };
  // The module reads `typeof window !== "undefined"` and `window.<g> = api`.
  const runner = new Function("window", "chrome", src + "\nreturn window;");
  runner(win, chrome);
  const api = win[globalName];
  if (!api) throw new Error(`loadModuleApi: ${sourceFile} did not expose window.${globalName}`);
  return api;
}
