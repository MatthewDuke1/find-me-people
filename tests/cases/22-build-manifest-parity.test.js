// Build/manifest parity.
//
// A file referenced by manifest.json but missing from the build lists ships a
// package that points at something not in the zip. The extension then fails at
// load time for real users while working perfectly from an unpacked checkout,
// which is the worst way to find out.
//
// This has bitten this repo twice: once when the refund modules landed, and
// again when autofill-page-button.js was added.
import { suite, test, assertTrue, assertEq } from "../lib/test-runner.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const buildSh = fs.readFileSync(path.join(root, "build.sh"), "utf8");
const buildPs1 = fs.readFileSync(path.join(root, "build.ps1"), "utf8");

// Every .js the manifest loads: content scripts + background.
function manifestScripts() {
  const out = new Set();
  for (const cs of manifest.content_scripts || []) {
    for (const js of cs.js || []) out.add(js);
  }
  const bg = manifest.background || {};
  if (bg.service_worker) out.add(bg.service_worker);
  for (const s of bg.scripts || []) out.add(s);
  return [...out];
}

suite("every manifest-referenced script exists on disk", () => {
  for (const f of manifestScripts()) {
    test(f + " exists", () => {
      assertTrue(fs.existsSync(path.join(root, f)), f + " is referenced but missing");
    });
  }
});

suite("every manifest-referenced script is in the build lists", () => {
  for (const f of manifestScripts()) {
    test(f + " is in build.sh", () => {
      assertTrue(buildSh.includes(f), f + " missing from build.sh FILES");
    });
    test(f + " is in build.ps1", () => {
      assertTrue(buildPs1.includes(f), f + " missing from build.ps1 $Files");
    });
  }
});

// The reverse direction. The suites above prove every referenced file IS in
// the build lists; nothing proved that every build-list entry still EXISTS.
// So when PR #149 deleted resume-injection.js and resume-ui.js, both build
// scripts kept listing them and the suite stayed green -- while build.sh, which
// runs under `set -euo pipefail`, would have failed on the missing file at
// release time. A packaging break that only surfaces during a release is the
// worst time to find one.
suite("every build-list entry still exists on disk", () => {
  // Split on real line breaks rather than regex-matching them, which keeps
  // this readable and avoids escaping a newline inside a pattern.
  const shBody = buildSh.slice(buildSh.indexOf("FILES=("));
  const shFiles = shBody.split(String.fromCharCode(10))
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.includes("=") && !l.startsWith(")"))
    .filter((l) => /^[A-Za-z0-9_.\/-]+$/.test(l));

  // Bound to the array literal itself. Slicing to the end of the file also
  // swept up the output zip names further down, which are produced by the
  // build rather than consumed by it.
  const psStart = buildPs1.indexOf("$Files = @(");
  const psBody = buildPs1.slice(psStart, buildPs1.indexOf(")", psStart));
  const psFiles = [...psBody.matchAll(/"([A-Za-z0-9_.\/-]+)"/g)].map((m) => m[1]);

  for (const f of new Set(shFiles)) {
    test("build.sh: " + f + " exists", () => {
      assertTrue(fs.existsSync(path.join(root, f)), f + " is in build.sh but not on disk");
    });
  }
  for (const f of new Set(psFiles)) {
    test("build.ps1: " + f + " exists", () => {
      assertTrue(fs.existsSync(path.join(root, f)), f + " is in build.ps1 but not on disk");
    });
  }
});

suite("popup scripts are packaged too", () => {
  const popup = fs.readFileSync(path.join(root, "popup.html"), "utf8");
  const srcs = [...popup.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1])
    .filter((s) => !s.startsWith("http"));
  for (const f of srcs) {
    test(f + " exists and is packaged", () => {
      assertTrue(fs.existsSync(path.join(root, f)), f + " referenced by popup.html but missing");
      assertTrue(buildSh.includes(f), f + " missing from build.sh");
      assertTrue(buildPs1.includes(f), f + " missing from build.ps1");
    });
  }
});

suite("the two build scripts agree with each other", () => {
  test("same .js files in both lists", () => {
    const grab = (txt) => new Set((txt.match(/[\w.-]+\.js/g) || [])
      .filter((f) => !f.startsWith("build")));
    const sh = grab(buildSh), ps = grab(buildPs1);
    const onlySh = [...sh].filter((f) => !ps.has(f));
    const onlyPs = [...ps].filter((f) => !sh.has(f));
    assertEq(onlySh, [], "in build.sh only");
    assertEq(onlyPs, [], "in build.ps1 only");
  });
});
