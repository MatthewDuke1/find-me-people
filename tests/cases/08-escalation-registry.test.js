// Stage 3 escalation registry (escalation-registry.js): category -> agency
// routing. Pure, DOM-free. Hard rule under test: suggestCategories() only
// RANKS candidates — it must never collapse to a single decided answer, and
// every category must remain reachable via getCategoryEntry/listCategories
// regardless of what's suggested first.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ESCALATION_REGISTRY_JS = path.join(__dirname, "..", "..", "escalation-registry.js");

const { CATEGORY_REGISTRY, DOMAIN_HINTS, listCategories, getCategoryEntry, suggestCategories } =
  loadPureHelpers(
    ["CATEGORY_REGISTRY", "DOMAIN_HINTS", "listCategories", "getCategoryEntry", "suggestCategories"],
    ESCALATION_REGISTRY_JS
  );

suite("registry integrity", () => {
  test("has the 8 documented categories", () => {
    assertEq(CATEGORY_REGISTRY.length, 8);
  });
  test("every entry has a non-empty https:// url", () => {
    for (const c of CATEGORY_REGISTRY) {
      assertTrue(c.url.startsWith("https://"), `${c.id} url should be https`);
    }
  });
  test("every entry has an agency name and lastVerified date", () => {
    for (const c of CATEGORY_REGISTRY) {
      assertTrue(!!c.agency, `${c.id} missing agency`);
      assertTrue(/^\d{4}-\d{2}-\d{2}$/.test(c.lastVerified), `${c.id} lastVerified not YYYY-MM-DD`);
    }
  });
  test("'other' is the catch-all and present", () => {
    assertTrue(CATEGORY_REGISTRY.some((c) => c.id === "other"));
  });
});

suite("listCategories", () => {
  test("returns id+label only, not the full entry", () => {
    const list = listCategories();
    assertEq(list.length, 8);
    assertEq(Object.keys(list[0]).sort(), ["id", "label"]);
  });
});

suite("getCategoryEntry", () => {
  test("returns the full banking entry", () => {
    const e = getCategoryEntry("banking");
    assertEq(e.agency, "Consumer Financial Protection Bureau (CFPB)");
    assertEq(e.url, "https://www.consumerfinance.gov/complaint/");
  });
  test("returns null for an unknown id", () => {
    assertEq(getCategoryEntry("not-a-real-category"), null);
  });
});

suite("suggestCategories (suggestion only, never a single decided answer)", () => {
  test("always returns all 8 category ids, just reordered", () => {
    const ids = CATEGORY_REGISTRY.map((c) => c.id).sort();
    const suggested = suggestCategories("acme-corp.com").slice().sort();
    assertEq(suggested, ids);
  });
  test("a bank-named domain ranks banking first", () => {
    assertEq(suggestCategories("chase-bank-support.com")[0], "banking");
  });
  test("an airline-named domain ranks airline_travel first", () => {
    assertEq(suggestCategories("global-airways.com")[0], "airline_travel");
  });
  test("a telecom-named domain ranks telecom first", () => {
    assertEq(suggestCategories("acme-wireless.com")[0], "telecom");
  });
  test("an insurance-named domain ranks insurance first", () => {
    assertEq(suggestCategories("acme-insurance.com")[0], "insurance");
  });
  test("no keyword match still returns a full, usable ranking (no crash, no empty list)", () => {
    const suggested = suggestCategories("totally-generic-widgets.com");
    assertEq(suggested.length, 8);
    assertTrue(suggested.includes("other"));
  });
  test("empty/undefined input never throws", () => {
    assertEq(suggestCategories(undefined).length, 8);
    assertEq(suggestCategories("").length, 8);
  });
});
