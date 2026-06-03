// phoneKey() -- canonical phone-dedup key. Critical regression target:
// the entire dedup story (tel: link + visible text + site-override all
// collapsing to one entry) depends on this returning the same key for
// all formats of the same number.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq } from "../lib/test-runner.js";

const { phoneKey } = loadPureHelpers(["phoneKey"]);

suite("phoneKey", () => {
  test("strips separators", () => {
    assertEq(phoneKey("(281) 816-5935"), "2818165935");
  });
  test("strips US country code from 11-digit", () => {
    assertEq(phoneKey("1(281)816-5935"), "2818165935");
  });
  test("strips US country code with + prefix", () => {
    assertEq(phoneKey("+12818165935"), "2818165935");
  });
  test("preserves non-US country code", () => {
    assertEq(phoneKey("+447946000000"), "447946000000");
  });
  test("handles raw digits", () => {
    assertEq(phoneKey("2818165935"), "2818165935");
  });
  test("preserves short numbers without country-code stripping", () => {
    assertEq(phoneKey("1234"), "1234");
  });
  test("collapses dotted formatting", () => {
    assertEq(phoneKey("281.816.5935"), "2818165935");
  });
});
