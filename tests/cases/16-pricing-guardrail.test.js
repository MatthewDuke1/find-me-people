// Pricing-trap guardrail (the important one).
//
// Invariant: PRO_ENFORCED (license.js) is true  <=>  manifest version >= 2.1.0
//   - Forward:  flipping enforcement on below 2.1.0 => new installs auto-
//               grandfather to free Pro forever (the documented trap).
//   - Reverse:  shipping >=2.1.0 with enforcement OFF => closes the
//               grandfathering window early for legit early users.
// This test fails the build if either half is violated, so the trap can
// never ship by accident.
import { suite, test, assertTrue } from "../lib/test-runner.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");

function versionGte(a, b) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return true;
}

suite("pricing guardrail: PRO_ENFORCED <=> version >= PRICING_VERSION", () => {
  const license = fs.readFileSync(path.join(root, "license.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const background = fs.readFileSync(path.join(root, "background.js"), "utf8");

  const enforcedMatch = license.match(/const\s+PRO_ENFORCED\s*=\s*(true|false)/);
  const pricingMatch = background.match(/const\s+PRICING_VERSION\s*=\s*"([\d.]+)"/);

  test("PRO_ENFORCED and PRICING_VERSION are declared", () => {
    assertTrue(!!enforcedMatch, "PRO_ENFORCED not found in license.js");
    assertTrue(!!pricingMatch, "PRICING_VERSION not found in background.js");
  });

  test("enforcement state matches the version threshold", () => {
    const enforced = enforcedMatch[1] === "true";
    const pricingVersion = pricingMatch[1];
    const atOrAbove = versionGte(manifest.version, pricingVersion);
    assertTrue(
      enforced === atOrAbove,
      `PRO_ENFORCED=${enforced} but manifest ${manifest.version} vs PRICING_VERSION ${pricingVersion} (>=? ${atOrAbove}). ` +
        (enforced
          ? "Enforcement build must be >= PRICING_VERSION or new users get free Pro."
          : "Version is at/above PRICING_VERSION but enforcement is off — reserve that version for the pricing build (use a lower one).")
    );
  });
});
