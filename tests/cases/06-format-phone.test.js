// formatPhone() -- US phone display formatting.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq } from "../lib/test-runner.js";

const { formatPhone } = loadPureHelpers(["formatPhone"]);

suite("formatPhone", () => {
  test("10-digit US -> (NNN) NNN-NNNN", () =>
    assertEq(formatPhone("2818165935"), "(281) 816-5935"));
  test("11-digit with leading 1 strips country code", () =>
    assertEq(formatPhone("12818165935"), "(281) 816-5935"));
  test("+1 prefix strips country code", () =>
    assertEq(formatPhone("+12818165935"), "(281) 816-5935"));
  test("dotted format normalizes", () =>
    assertEq(formatPhone("281.816.5935"), "(281) 816-5935"));
  test("already-formatted stays consistent", () =>
    assertEq(formatPhone("(281) 816-5935"), "(281) 816-5935"));
  test("non-US international preserves whitespace cleanup", () =>
    assertEq(formatPhone("+44 20 7946 0958"), "+44 20 7946 0958"));
});
