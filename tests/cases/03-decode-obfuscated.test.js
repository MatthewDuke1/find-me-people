// decodeObfuscatedText() -- preprocesses body text to defeat common
// scraper-defeating email obfuscation patterns.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";

const { decodeObfuscatedText } = loadPureHelpers(["decodeObfuscatedText"]);
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

function decoded(s) {
  return decodeObfuscatedText(s);
}
function firstEmail(s) {
  const m = decoded(s).match(EMAIL_RE);
  return m ? m[0] : null;
}

suite("decodeObfuscatedText", () => {
  test("paren (at) (dot) form", () => {
    assertEq(firstEmail("jane (at) acme (dot) com"), "jane@acme.com");
  });
  test("bracket [at] [dot] form", () => {
    assertEq(firstEmail("Contact: bob [at] foo [dot] org"), "bob@foo.org");
  });
  test("brace {at} {dot} form", () => {
    assertEq(firstEmail("user{at}host{dot}tld"), "user@host.tld");
  });
  test("angle <at> <dot> form on a real domain", () => {
    assertEq(firstEmail("support<at>example<dot>com"), "support@example.com");
  });
  test("bare AT DOT (uppercase)", () => {
    assertEq(firstEmail("email user AT example DOT com"), "user@example.com");
  });
  test("URL-encoded @", () => {
    assertEq(firstEmail("support%40acme.com"), "support@acme.com");
  });
  test("HTML entity (decimal)", () => {
    assertEq(firstEmail("help&#64;acme.com"), "help@acme.com");
  });
  test("HTML entity (named)", () => {
    assertEq(firstEmail("hi&commat;acme.com"), "hi@acme.com");
  });
  test("Unicode fullwidth at", () => {
    assertEq(firstEmail("team＠acme.com"), "team@acme.com");
  });
  test("underscore-delimited", () => {
    assertEq(firstEmail("john_at_company_dot_net"), "john@company.net");
  });
  // The false-positive guard is "no valid EMAIL_REGEX match should
  // emerge from prose," not "no @ symbol should appear in the decoded
  // text." The bare-keyword decoder will produce 'open@9am' from
  // 'open at 9am', but '9am' isn't a valid TLD so EMAIL_REGEX won't
  // match it. What we DO promise is that no valid email gets
  // accidentally constructed from prose.
  test("'stop, at last we got there' produces no valid email", () => {
    assertEq(firstEmail("stop, at last we got there"), null);
  });
  test("'fully open at 9am' produces no valid email", () => {
    assertEq(firstEmail("fully open at 9am"), null);
  });
  test("'the at sign means email' produces no valid email", () => {
    assertEq(firstEmail("the at sign means email"), null);
  });
  test("passes through already-valid emails", () => {
    assertEq(firstEmail("hello@world.com"), "hello@world.com");
  });
});
