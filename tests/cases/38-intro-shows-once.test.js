// Every introduction must record "seen" when it is SHOWN, not when it is
// dismissed.
//
// Bug (reported 2026-09-13): Sula kept popping up and re-doing its
// introduction. All three intro surfaces set their "seen" flag only inside a
// dismiss handler, so any other way of leaving them left the flag unset and
// the intro came back on the next page or popup open:
//
//   - the on-page example-contacts panel (content.js) marked itself seen only
//     on "Got it". Collapsing it, hiding it for a site, or simply navigating
//     away re-opened it, expanded, on every page of every site.
//   - the popup walkthrough (onboarding.js) marked itself done only on
//     Skip / finish / Esc. Clicking outside the popup -- the normal way a
//     popup closes -- restarted the tour on every open.
//   - the What's new card (whats-new.js) marked the version seen only on its
//     buttons, so closing the popup without touching it showed it again.
//
// These are source-structure checks because all three need a real browser DOM.
// Each one fails against the pre-fix code.
import { suite, test, assertTrue } from "../lib/test-runner.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// Body of `function name(...) { ... }`, brace-counted.
function body(src, name) {
  const m = new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\(").exec(src);
  if (!m) throw new Error("function not found: " + name);
  let i = src.indexOf("{", m.index), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(i, j + 1);
  }
  throw new Error("unbalanced: " + name);
}

suite("the popup walkthrough shows once", () => {
  const show = body(read("onboarding.js"), "show");

  test("it is marked done as soon as it is shown", () => {
    // The pre-fix code already called markDone() -- inside close(), which only
    // Skip/finish/Esc reach. So the check is that a call exists BEFORE close()
    // is even defined, i.e. on the path that runs when the tour opens.
    const marked = show.indexOf("markDone()");
    const closeDef = show.indexOf("function close");
    assertTrue(marked !== -1 && closeDef !== -1 && marked < closeDef,
      "markDone() must run when the tour opens, not only inside close()");
  });
});

suite("the What's new card shows once per release", () => {
  const render = body(read("whats-new.js"), "render");

  test("the version is recorded as seen when the card renders", () => {
    assertTrue(/SEEN_KEY/.test(render),
      "render() must write SEEN_KEY; closing the popup without a click must not re-show it");
  });
});

suite("the on-page example panel shows once", () => {
  const src = read("content.js");
  const ensure = body(src, "ensureSidePanel");

  test("mounting the example panel marks it seen", () => {
    assertTrue(ensure.includes("spMarkFirstRunSeen()"),
      "ensureSidePanel must mark the first run seen when it shows the examples, not only on 'Got it'");
  });

  test("the examples stay for the rest of the page they appeared on", () => {
    // Marking seen on mount would otherwise make the very next re-render (the
    // page mutates, a rescan fires) treat this page as a normal one and pull
    // the examples away mid-read.
    assertTrue(/spDemoThisPage/.test(ensure), "no page-scoped flag keeps the examples on the current page");
  });

  test("an introduction is never shown in a tab nobody is looking at", () => {
    // Background tabs open at install time would otherwise use up the
    // one-and-only showing before the user sees any of them.
    assertTrue(/visibilityState/.test(ensure), "first run is not gated on the tab being visible");
  });
});
