// Financial-domain exclusions.
//
// Sula's central claim is that it never sees your bank. Until this landed, that
// was a promise; exclude_matches makes it a fact a reviewer can read straight
// out of the manifest without trusting a word of the marketing.
//
// Two things are pinned here. First, that the exclusions exist on EVERY content
// script — an exclusion on two of three entries is not an exclusion, and that
// is exactly the kind of gap that survives a refactor unnoticed. Second, that
// the patterns are well-formed, because Chrome silently ignores a malformed
// match pattern rather than refusing to load, so a typo would leave the script
// running on a bank with no error anywhere.
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const scripts = manifest.content_scripts || [];

suite("every content script carries the exclusions", () => {
  test("there is at least one content script", () => {
    assertTrue(scripts.length > 0, "no content scripts declared");
  });

  scripts.forEach((cs, i) => {
    test("content_scripts[" + i + "] has exclude_matches", () => {
      assertTrue(Array.isArray(cs.exclude_matches) && cs.exclude_matches.length > 0,
        "entry " + i + " (" + (cs.js || []).join(", ") + ") has no exclusions");
    });
  });

  test("all entries exclude the same set", () => {
    const sets = scripts.map((c) => (c.exclude_matches || []).slice().sort().join("|"));
    assertTrue(new Set(sets).size === 1, "content scripts disagree on what to exclude");
  });
});

suite("the domains a reviewer would check first", () => {
  const excluded = (scripts[0] && scripts[0].exclude_matches) || [];
  const joined = excluded.join(" ");

  const mustCover = [
    "chase.com", "bankofamerica.com", "wellsfargo.com", "citi.com",
    "capitalone.com", "americanexpress.com", "discover.com",
    "fidelity.com", "vanguard.com", "schwab.com",
    "paypal.com", "venmo.com",
    "irs.gov", "creditkarma.com",
  ];
  for (const d of mustCover) {
    test("excludes " + d, () => {
      assertTrue(joined.includes(d), d + " is not excluded");
    });
  }
});

suite("patterns are well-formed", () => {
  // Chrome silently ignores a malformed match pattern instead of refusing to
  // load the extension, so a typo here fails open — the script keeps running
  // on the bank and nothing reports it.
  const excluded = (scripts[0] && scripts[0].exclude_matches) || [];
  const PATTERN = /^(\*|https?|file|ftp):\/\/(\*|(\*\.)?[^\/*]+)\/.*$/;

  excluded.forEach((p) => {
    test(p + " is a valid match pattern", () => {
      assertTrue(PATTERN.test(p), p + " is not a valid Chrome match pattern");
    });
  });

  test("every pattern ends with a path component", () => {
    const bad = excluded.filter((p) => !p.includes("/*"));
    assertEq(bad.join(", "), "");
  });

  test("no pattern is a bare wildcard that would disable the extension", () => {
    assertTrue(!excluded.includes("*://*/*"), "a bare wildcard would exclude everything");
  });
});
