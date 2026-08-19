// Resume tab gating (resume-ui.js).
//
// Autofill is free; resume analysis is Pro. The split is: score and the
// covered/gap lists are free (they prove the tool works), the per-term host
// bullet and rewrite guidance are Pro.
//
// The invariant worth protecting is that the free render never puts a host
// bullet in the DOM. Hiding paid content with CSS while still shipping it is
// not a paywall, it is a view-source away from being free.
import { suite, test, assertTrue, assertFalse } from "../lib/test-runner.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(root, "resume-ui.js"), "utf8");

suite("resume-ui is gated at all", () => {
  test("has a Pro gate helper", () => {
    assertTrue(/function gate\s*\(/.test(src), "gate() missing");
    assertTrue(src.includes("gateProFeature"), "does not reach popup.js's gate");
  });

  test("reads entitlement separately from prompting", () => {
    // hasPro() decides what to render; gate() prompts. Using gate() to decide
    // the render would nag on every scan.
    assertTrue(/function hasPro\s*\(/.test(src), "hasPro() missing");
  });

  test("the gate names the feature", () => {
    assertTrue(/gate\(["'][^"']*[Rr]esume[^"']*["']\)/.test(src),
      "gate should be called with a resume-specific label");
  });
});

suite("the free render withholds the paid half", () => {
  // renderReport(host, report, postingTitle, pro) branches on `pro`. The host
  // bullet markup must sit on the pro side of that branch only.
  test("renderReport takes a pro flag", () => {
    assertTrue(/function renderReport\([^)]*\bpro\b[^)]*\)/.test(src),
      "renderReport must accept a pro flag");
  });

  test("host bullets are rendered inside the pro branch", () => {
    const i = src.indexOf("report.suggestions.length ? (pro ?");
    assertTrue(i !== -1, "expected a `pro ?` branch around the suggestions block");
    const lockedAt = src.indexOf('<div class="rs-locked">', i);
    assertTrue(lockedAt !== -1, "locked panel should follow the pro branch");
    // Everything between the `pro ?` and the locked panel is the Pro side.
    const proSide = src.slice(i, lockedAt);
    assertTrue(proSide.includes("rs-host"), "pro branch should render host bullets");
    assertTrue(proSide.includes("rs-copy"), "pro branch should offer the copy button");
  });

  test("the locked panel does not contain a host bullet or an action string", () => {
    const start = src.indexOf('<div class="rs-locked">');
    assertTrue(start !== -1, "locked panel missing");
    const end = src.indexOf("</div>", src.indexOf("rs-upgrade", start));
    const locked = src.slice(start, end);
    assertFalse(locked.includes("rs-host"), "locked panel must not include host bullets");
    assertFalse(locked.includes("s.hostBullet"), "locked panel must not interpolate a host bullet");
    assertFalse(locked.includes("s.action"), "locked panel must not interpolate the rewrite action");
  });

  test("the locked panel still states the count, so the offer is concrete", () => {
    assertTrue(/rs-locked[\s\S]{0,400}report\.suggestions\.length/.test(src),
      "locked panel should say how many bullets were found");
  });
});

suite("honesty survives the paywall", () => {
  test("the Pro pitch does not promise to write the claim", () => {
    const i = src.indexOf('<div class="rs-locked">');
    const locked = src.slice(i, i + 900);
    assertTrue(/never writes the claim for you/i.test(locked),
      "the upsell must not imply Sula will write the bullet");
  });

  test("the disclaimer renders regardless of tier", () => {
    // It sits outside the pro branch.
    const disclaimI = src.indexOf("rs-disclaim");
    const branchI = src.indexOf("report.suggestions.length ? (pro ?");
    assertTrue(disclaimI > branchI, "disclaimer should come after, outside the branch");
  });
});
