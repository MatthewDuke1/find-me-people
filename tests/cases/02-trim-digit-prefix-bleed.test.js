// trimDigitPrefixBleed() -- guards against zip-code-glued-to-email bleed
// when adjacent DOM blocks concatenate. Critical for sites like
// thesanctuarygym.com that surface the issue in the original PR #28.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq } from "../lib/test-runner.js";

const { trimDigitPrefixBleed } = loadPureHelpers(["trimDigitPrefixBleed"]);

suite("trimDigitPrefixBleed", () => {
  test("strips 5+ digit zip prefix before letter", () => {
    assertEq(
      trimDigitPrefixBleed("77546thesanctuarygymtx@outlook.com"),
      "thesanctuarygymtx@outlook.com"
    );
  });
  test("strips 6-digit postal-code prefix", () => {
    assertEq(
      trimDigitPrefixBleed("123456support@example.com"),
      "support@example.com"
    );
  });
  test("does NOT strip 3-digit prefix (below threshold)", () => {
    assertEq(
      trimDigitPrefixBleed("123support@example.com"),
      "123support@example.com"
    );
  });
  test("does NOT strip leading digits with no letter following", () => {
    assertEq(
      trimDigitPrefixBleed("1234567890@example.com"),
      "1234567890@example.com"
    );
  });
  test("does NOT mangle clean emails", () => {
    assertEq(
      trimDigitPrefixBleed("support@example.com"),
      "support@example.com"
    );
  });
});
