// QA SULA-001 / SULA-004 regression: contacts fetched from elsewhere on the
// site must never be presented as "found on this page".
//
// The QA report filed SULA-001 as a stale cache ("seven contacts from the
// previous page remain; Rescan does not clear them"). It is not a cache bug.
// Sula fetches a site's sitemap / discovered contact pages and MERGES those
// contacts into the same result set, which the popup then labelled
// "Found N contacts on this page". On a zero-contact page the seven contacts
// were real — they were just from other URLs — and Rescan "failed" because it
// re-ran the same off-page fetch and produced them again.
//
// The fix is provenance, not invalidation: split results by source and label
// on-page and off-page counts separately. These tests lock that in.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POPUP = path.join(__dirname, "..", "..", "popup.js");

const { isOnPageContact, splitByProvenance } =
  loadPureHelpers(["isOnPageContact", "splitByProvenance"], POPUP);

suite("SULA-001 — off-page sources are not 'on this page'", () => {
  const offPage = ["sitemap", "discovered-page", "fetch"];
  for (const src of offPage) {
    test(`source "${src}" is off-page`, () => {
      assertFalse(isOnPageContact({ source: src }), `${src} must not count as on-page`);
    });
  }

  // Everything read out of the live document IS on-page.
  const onPage = [
    "text", "mailto", "tel", "footer", "json-ld", "microdata", "meta",
    "shadow", "iframe-mailto", "iframe-tel", "aria", "data-attr",
    "inline-script", "noscript", "address", "press", "form-value", "globals",
  ];
  for (const src of onPage) {
    test(`source "${src}" is on-page`, () => {
      assertTrue(isOnPageContact({ source: src }), `${src} should count as on-page`);
    });
  }

  test("missing/unknown source defaults to on-page", () => {
    assertTrue(isOnPageContact({}));
    assertTrue(isOnPageContact({ source: "" }));
    assertTrue(isOnPageContact({ source: "something-new" }));
  });

  test("a trailing colon on the source is tolerated", () => {
    assertFalse(isOnPageContact({ source: "sitemap:" }));
  });
});

suite("SULA-001 — splitByProvenance", () => {
  test("the exact QA scenario: zero on-page, seven off-page", () => {
    const list = Array.from({ length: 7 }, (_, i) => ({ value: `a${i}@x.com`, source: "sitemap" }));
    const { onPage, offPage } = splitByProvenance(list);
    assertEq(onPage.length, 0, "no contacts are on the current page");
    assertEq(offPage.length, 7, "all seven came from the sitemap");
  });

  test("mixed results split correctly", () => {
    const list = [
      { value: "a@x.com", source: "text" },
      { value: "b@x.com", source: "mailto" },
      { value: "c@x.com", source: "sitemap" },
      { value: "d@x.com", source: "discovered-page" },
    ];
    const { onPage, offPage } = splitByProvenance(list);
    assertEq(onPage.length, 2);
    assertEq(offPage.length, 2);
  });

  test("all on-page yields no off-page bucket", () => {
    const { onPage, offPage } = splitByProvenance([
      { source: "text" }, { source: "tel" },
    ]);
    assertEq(onPage.length, 2);
    assertEq(offPage.length, 0);
  });

  test("empty and null input are safe", () => {
    assertEq(splitByProvenance([]).onPage.length, 0);
    assertEq(splitByProvenance(null).onPage.length, 0);
    assertEq(splitByProvenance(undefined).offPage.length, 0);
  });
});
