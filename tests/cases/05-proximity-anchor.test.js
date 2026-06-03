// Phone proximity anchor -- requires contact keyword within +/-100 chars
// of a phone match before accepting it from loose-body scans. Filters
// random snippet phones on Google search results, business directories.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertTrue, assertFalse } from "../lib/test-runner.js";

const { PHONE_PROXIMITY_ANCHORS, surroundingTextFor, hasPhoneProximityAnchor } =
  loadPureHelpers(["PHONE_PROXIMITY_ANCHORS", "surroundingTextFor", "hasPhoneProximityAnchor"]);

function checkText(text) {
  // pick the first phone-like substring and test its surroundings
  const m = text.match(/[\d-()\s.]{10,}/);
  if (!m) return false;
  const surround = surroundingTextFor(text, m[0].trim(), 100);
  return hasPhoneProximityAnchor(surround);
}

suite("phone proximity anchor", () => {
  // Should KEEP (real contact context)
  test("'Need help? Call our customer service team at 1-800-555-1212'", () =>
    assertTrue(checkText("Need help? Call our customer service team at 1-800-555-1212")));
  test("'Contact us: (800) 555-1234'", () =>
    assertTrue(checkText("Contact us: (800) 555-1234")));
  test("'For billing questions phone 1-800-555-1234'", () =>
    assertTrue(checkText("For billing questions phone 1-800-555-1234")));
  test("'Toll free: 1-800-555-1212'", () =>
    assertTrue(checkText("Toll free: 1-800-555-1212")));
  test("'Tech support: 1-800-555-2222 24/7'", () =>
    assertTrue(checkText("Tech support: 1-800-555-2222 24/7")));

  // Should DROP (noise patterns)
  test("Pizza Hut snippet (no contact context)", () =>
    assertFalse(checkText("Pizza Hut Restaurant 4.2 stars 1234 Main St (555) 123-4567 Open until 10 PM")));
  test("Twitter post style", () =>
    assertFalse(checkText("@user posted: random text and a number 555-867-5309 lol throwback")));
  test("Business directory line item", () =>
    assertFalse(checkText("DENTAL OFFICES Smith DDS (555) 111-2222 Jones DDS (555) 333-4444")));
});
