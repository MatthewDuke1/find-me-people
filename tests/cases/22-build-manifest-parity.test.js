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
