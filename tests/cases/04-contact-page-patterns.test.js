// CONTACT_PAGE_PATTERNS -- boundary-aware URL matching. Original bug
// (the dhs.gov report) was that /\/contact/i missed /media-contacts and
// /direct-contact-information. The replacement pattern catches both
// while still rejecting /contactless-payment etc.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";

const { CONTACT_PAGE_PATTERNS } = loadPureHelpers(["CONTACT_PAGE_PATTERNS"]);

function matches(path) {
  return CONTACT_PAGE_PATTERNS.some((p) => p.test(path));
}

suite("CONTACT_PAGE_PATTERNS", () => {
  // Should match
  test("/contact", () => assertTrue(matches("/contact")));
  test("/contact-us", () => assertTrue(matches("/contact-us")));
  test("/contacts/", () => assertTrue(matches("/contacts/")));
  test("/contact_us", () => assertTrue(matches("/contact_us")));
  test("/media-contacts (dhs.gov-style)", () => assertTrue(matches("/media-contacts")));
  test("/press-contacts", () => assertTrue(matches("/press-contacts")));
  test("/staff-contacts", () => assertTrue(matches("/staff-contacts")));
  test("/direct-contact-information", () => assertTrue(matches("/direct-contact-information")));
  test("/general-contact-info", () => assertTrue(matches("/general-contact-info")));
  test("/press", () => assertTrue(matches("/press")));
  test("/press-room", () => assertTrue(matches("/press-room")));
  test("/support", () => assertTrue(matches("/support")));
  test("/help", () => assertTrue(matches("/help")));
  test("/about", () => assertTrue(matches("/about")));
  test("/customer-service", () => assertTrue(matches("/customer-service")));
  test("/get-in-touch", () => assertTrue(matches("/get-in-touch")));
  test("/reach-us", () => assertTrue(matches("/reach-us")));

  // Should NOT match (false-positive guards)
  test("not /contactless-payment", () => assertFalse(matches("/contactless-payment")));
  test("not /non-contactable-resources", () => assertFalse(matches("/non-contactable-resources")));
  test("not /depress-meter-overload-protection", () => assertFalse(matches("/depress-meter-overload-protection")));
  test("not /products/blue-shirt", () => assertFalse(matches("/products/blue-shirt")));
});
