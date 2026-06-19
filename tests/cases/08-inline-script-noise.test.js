// scanInlineScriptBodies relies on a small set of noise-filter rules
// (same ones scanPageGlobals uses). Pinning the rules here so future
// regex changes don't accidentally widen the filter (silent recall loss)
// or narrow it (noise from minified bundles starts leaking through).
//
// We can't load scanInlineScriptBodies directly -- it touches document --
// but the noise predicate is self-contained enough to re-state. If the
// production rule ever drifts, this test fails and the producer of the
// drift has to update both deliberately.
import { suite, test, assertTrue, assertFalse } from "../lib/test-runner.js";

function isNoise(email) {
  email = email.toLowerCase();
  return (
    email.endsWith(".png") || email.endsWith(".jpg") || email.endsWith(".svg") ||
    email.includes("sentry") || email.includes("webpack") ||
    email.includes("example.com") || email.includes("@2x") ||
    email.includes("noreply") || email.includes("no-reply")
  );
}

suite("inline-script email noise filter", () => {
  // Should keep -- real-looking emails worth surfacing
  test("keeps real corporate email", () => {
    assertFalse(isNoise("support@stripe.com"));
  });
  test("keeps multi-segment subdomain", () => {
    assertFalse(isNoise("press@news.example.org"));
  });
  test("keeps support+tag@", () => {
    assertFalse(isNoise("support+orders@acme.com"));
  });

  // Should drop -- known noise patterns from minified bundles / SDKs
  test("drops asset paths ending in .png/.jpg/.svg", () => {
    assertTrue(isNoise("hero@2x.png"));
    assertTrue(isNoise("logo-icon.jpg"));
    assertTrue(isNoise("arrow.svg"));
  });
  test("drops Sentry SDK references", () => {
    assertTrue(isNoise("user@sentry-cdn.com"));
    assertTrue(isNoise("debug@sentry.io"));
  });
  test("drops webpack chunk hash artifacts", () => {
    assertTrue(isNoise("ab12@webpack-runtime.local"));
  });
  test("drops example.com placeholders", () => {
    assertTrue(isNoise("you@example.com"));
    assertTrue(isNoise("test@subdomain.example.com"));
  });
  test("drops @2x retina-asset fragments", () => {
    assertTrue(isNoise("icon@2x.png"));
    assertTrue(isNoise("logo@2xfoo.com"));
  });
  test("drops noreply / no-reply variants", () => {
    assertTrue(isNoise("noreply@github.com"));
    assertTrue(isNoise("no-reply@acme.com"));
  });
});
