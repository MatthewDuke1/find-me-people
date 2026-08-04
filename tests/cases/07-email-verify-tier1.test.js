// Tier 1 of the email-verification pipeline (email-verify.js): syntax
// validation, disposable-domain detection, role-account classification, and
// badge composition. Pure, DOM-free — loaded from email-verify.js (not
// content.js) via the sourceFile param on loadPureHelpers.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMAIL_VERIFY_JS = path.join(__dirname, "..", "..", "email-verify.js");

const {
  normalizeEmail,
  isValidEmailSyntax,
  getEmailDomain,
  DISPOSABLE_DOMAINS,
  isDisposableDomain,
  ROLE_ACCOUNT_PREFIXES,
  classifyEmailRole,
  composeVerificationBadge,
} = loadPureHelpers(
  [
    "normalizeEmail",
    "isValidEmailSyntax",
    "getEmailDomain",
    "DISPOSABLE_DOMAINS",
    "isDisposableDomain",
    "ROLE_ACCOUNT_PREFIXES",
    "classifyEmailRole",
    "composeVerificationBadge",
  ],
  EMAIL_VERIFY_JS
);

suite("isValidEmailSyntax", () => {
  test("accepts a normal address", () => {
    assertTrue(isValidEmailSyntax("jane.doe@example.com"));
  });
  test("accepts plus-addressing", () => {
    assertTrue(isValidEmailSyntax("jane+tag@example.com"));
  });
  test("rejects missing @", () => {
    assertFalse(isValidEmailSyntax("jane.doe.example.com"));
  });
  test("rejects missing TLD", () => {
    assertFalse(isValidEmailSyntax("jane@example"));
  });
  test("rejects consecutive dots", () => {
    assertFalse(isValidEmailSyntax("jane..doe@example.com"));
  });
  test("rejects embedded whitespace", () => {
    assertFalse(isValidEmailSyntax("jane doe@example.com"));
  });
  test("rejects multiple @", () => {
    assertFalse(isValidEmailSyntax("jane@doe@example.com"));
  });
  test("rejects empty string", () => {
    assertFalse(isValidEmailSyntax(""));
  });
  test("is case-insensitive on normalization", () => {
    assertTrue(isValidEmailSyntax("Jane.Doe@Example.COM"));
  });
});

suite("getEmailDomain", () => {
  test("extracts the domain", () => {
    assertEq(getEmailDomain("jane@example.com"), "example.com");
  });
  test("lowercases the result", () => {
    assertEq(getEmailDomain("jane@EXAMPLE.COM"), "example.com");
  });
  test("returns null with no @", () => {
    assertEq(getEmailDomain("not-an-email"), null);
  });
});

suite("isDisposableDomain", () => {
  test("flags a known disposable domain", () => {
    assertTrue(isDisposableDomain("mailinator.com"));
  });
  test("flags case-insensitively", () => {
    assertTrue(isDisposableDomain("Mailinator.com"));
  });
  test("does not flag a real company domain", () => {
    assertFalse(isDisposableDomain("acme-corp.com"));
  });
  test("does not flag empty/null", () => {
    assertFalse(isDisposableDomain(null));
    assertFalse(isDisposableDomain(""));
  });
});

suite("classifyEmailRole", () => {
  test("classifies support@ as role", () => {
    assertEq(classifyEmailRole("support@acme.com"), "role");
  });
  test("classifies billing@ as role", () => {
    assertEq(classifyEmailRole("billing@acme.com"), "role");
  });
  test("classifies a named person as personal", () => {
    assertEq(classifyEmailRole("jwhitfield@acme.com"), "personal");
  });
  test("classifies noreply@ as role (informational, not a penalty here)", () => {
    assertEq(classifyEmailRole("noreply@acme.com"), "role");
  });
  test("strips trailing separators/digits before matching (support2@, support-team@)", () => {
    assertEq(classifyEmailRole("support2@acme.com"), "role");
  });
  test("strips plus-addressing tag before matching (support+ticket123@ -> role)", () => {
    assertEq(classifyEmailRole("support+ticket123@acme.com"), "role");
  });
  test("plus-addressing on a named person stays personal", () => {
    assertEq(classifyEmailRole("jane.doe+newsletter@acme.com"), "personal");
  });
  test("returns unknown with no @", () => {
    assertEq(classifyEmailRole("not-an-email"), "unknown");
  });
});

suite("composeVerificationBadge", () => {
  test("verified status -> success badge", () => {
    const b = composeVerificationBadge(80, { status: "verified" });
    assertEq(b.label, "Verified");
    assertEq(b.tier, "success");
  });
  test("catch_all status -> neutral, explains the mailbox can't be confirmed", () => {
    const b = composeVerificationBadge(80, { status: "catch_all" });
    assertEq(b.tier, "neutral");
    assertTrue(b.detail.includes("can't be confirmed"));
  });
  test("invalid + bad_syntax -> danger, malformed message", () => {
    const b = composeVerificationBadge(50, { status: "invalid", reason: "bad_syntax" });
    assertEq(b.tier, "danger");
    assertTrue(b.detail.includes("Malformed"));
  });
  test("invalid without bad_syntax reason -> danger, mail-server message", () => {
    const b = composeVerificationBadge(50, { status: "invalid" });
    assertEq(b.tier, "danger");
    assertTrue(b.detail.includes("No mail server"));
  });
  test("greylisted -> neutral, retry-soon message", () => {
    const b = composeVerificationBadge(50, { status: "greylisted" });
    assertEq(b.tier, "neutral");
    assertTrue(b.detail.toLowerCase().includes("greylisting"));
  });
  test("not_configured -> distinct from not_checked, says coming soon", () => {
    const b = composeVerificationBadge(50, { status: "not_configured" });
    assertEq(b.label, "Verification coming soon");
  });
  test("not_checked with pro_required reason -> mentions Pro", () => {
    const b = composeVerificationBadge(50, { status: "not_checked", reason: "pro_required" });
    assertTrue(b.detail.includes("Pro"));
  });
  test("no result at all defaults to not_checked path", () => {
    const b = composeVerificationBadge(30, null);
    assertEq(b.label, "Unverified");
  });
  test("high relevance + not yet checked reads 'Likely — unverified'", () => {
    const b = composeVerificationBadge(90, { status: "not_checked" });
    assertEq(b.label, "Likely — unverified");
  });
});
