// The "What's new" card for the version being shipped.
//
// whats-new.js shows notes only when NOTES has an entry for the exact version
// in manifest.json. With no entry, maybeShow() silently shows nothing -- so a
// release can go out with no changelog at all and every test stays green.
// That is what these checks stop.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertTrue, assertEq } from "../lib/test-runner.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const version = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")).version;
const src = fs.readFileSync(path.join(ROOT, "whats-new.js"), "utf8");
const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");

// Pull the NOTES literal out and evaluate it on its own.
function notes() {
  const start = src.indexOf("const NOTES = {");
  let i = src.indexOf("{", start), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) break;
  }
  return new Function("return " + src.slice(i, j + 1))();
}
const NOTES = notes();
const entry = NOTES[version];

suite("the shipping version has a changelog", () => {
  test("manifest " + version + " has a NOTES entry", () => {
    assertTrue(!!entry, "no What's new entry for " + version + " -- the card would silently show nothing");
  });

  test("the entry has a headline and real content", () => {
    assertTrue(entry && entry.headline && entry.headline.length > 0, "missing headline");
    assertTrue(entry && Array.isArray(entry.items) && entry.items.length >= 3, "fewer than 3 items");
  });

  test("it is the newest entry", () => {
    assertEq(Object.keys(NOTES)[0], version);
  });
});

suite("optional fields are well formed", () => {
  test("a feature callout has a title and body", () => {
    if (!entry || !entry.feature) return;
    assertTrue(entry.feature.title && entry.feature.body, "feature needs title and body");
  });

  test("a call-to-action points at a tab that exists in the popup", () => {
    // A CTA naming a tab that isn't there dismisses the card and then does
    // nothing, which reads as a broken button.
    if (!entry || !entry.cta) return;
    assertTrue(entry.cta.label, "cta has no label");
    assertTrue(popupHtml.includes('data-view="' + entry.cta.view + '"'),
      "cta opens a view that popup.html does not have: " + entry.cta.view);
  });
});

suite("the card still loads", () => {
  test("whats-new.js exposes maybeShow", () => {
    const api = loadModuleApi(path.join(ROOT, "whats-new.js"), "SulaWhatsNew");
    assertEq(typeof api.maybeShow, "function");
  });
});
