// On-page autofill button (autofill-page-button.js): the shouldOffer gate.
//
// This button appears unprompted on someone else's page, so the gate matters
// more than the rendering. It must stay quiet unless the user has actually
// saved a profile, the page has no contacts (the side panel covers those), the
// user hasn't dismissed the site, and there are enough fields to look like a
// real form rather than a stray search box.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "autofill-page-button.js");
const { shouldOffer, MIN_FIELDS } = loadModuleApi(SRC, "SulaAutofillButton");

const ok = {
  profileSet: true,
  hasContacts: false,
  dismissed: false,
  fieldCount: 6,
};

suite("shouldOffer - the happy path", () => {
  test("offers on a form page with a saved profile and no contacts", () => {
    assertTrue(shouldOffer(ok));
  });
});

suite("shouldOffer - stays quiet", () => {
  test("no saved profile means nothing to fill with", () => {
    assertFalse(shouldOffer({ ...ok, profileSet: false }));
  });

  test("page has contacts, so the side panel already covers it", () => {
    assertFalse(shouldOffer({ ...ok, hasContacts: true }));
  });

  test("user dismissed this site", () => {
    assertFalse(shouldOffer({ ...ok, dismissed: true }));
  });

  test("too few fields to be a real form", () => {
    assertFalse(shouldOffer({ ...ok, fieldCount: MIN_FIELDS - 1 }));
  });

  test("zero fields", () => {
    assertFalse(shouldOffer({ ...ok, fieldCount: 0 }));
  });

  test("missing fieldCount is treated as zero, not as pass", () => {
    const s = { ...ok };
    delete s.fieldCount;
    assertFalse(shouldOffer(s));
  });

  test("undefined state never throws and never offers", () => {
    assertFalse(shouldOffer(undefined));
    assertFalse(shouldOffer(null));
    assertFalse(shouldOffer({}));
  });
});

suite("shouldOffer - threshold", () => {
  test("exactly MIN_FIELDS offers", () => {
    assertTrue(shouldOffer({ ...ok, fieldCount: MIN_FIELDS }));
  });

  test("MIN_FIELDS is a sane default", () => {
    assertTrue(MIN_FIELDS >= 2 && MIN_FIELDS <= 5);
  });
});
