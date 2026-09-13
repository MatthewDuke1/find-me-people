// The passive ledger is ON by default (decided 2026-09-12). These tests pin the
// three things that decision makes load-bearing.
//
//   1. The DEFAULT itself. Absent flag means on; only an explicit `false` turns
//      it off. Same `!== false` convention as the side-panel and GPC switches.
//   2. FAIL CLOSED on a storage error. If we cannot read the user's preference,
//      we do not capture. Capturing because a read failed is the one outcome
//      with no defence.
//   3. The FLAG NAME agreeing across ledger-store.js, background.js and
//      popup.js. Three files share this magic string: the capture path, the
//      renewal alarm, and the toggle. A typo in any one of them is silent --
//      the toggle would appear to work while the ledger kept capturing, which
//      is the worst possible failure for a feature that is on by default.
//
// Why capture-by-default is defensible at all rests on the off switch being
// trivially reachable and the stored data being visible and deletable. The
// last suite checks that surface actually exists rather than trusting it.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "ledger-store.js");

const KEY = "sula_ledger_enabled";

// A chrome.storage.local stub seeded with a given store.
function stub(store, opts) {
  const o = opts || {};
  return {
    runtime: { lastError: o.error || null },
    storage: {
      local: {
        get: (keys, cb) => cb(o.error ? {} : store),
        set: (obj, cb) => { Object.assign(store, obj); cb && cb(); },
        remove: (keys, cb) => { for (const k of keys) delete store[k]; cb && cb(); },
      },
    },
  };
}

const withStore = (store, opts) => loadModuleApi(SRC, "SulaLedger", stub(store, opts));

suite("the ledger is on by default", () => {
  test("an untouched install captures", async () => {
    assertEq(await withStore({}).isEnabled(), true);
  });

  test("an explicit false turns it off", async () => {
    assertEq(await withStore({ [KEY]: false }).isEnabled(), false);
  });

  test("an explicit true keeps it on", async () => {
    assertEq(await withStore({ [KEY]: true }).isEnabled(), true);
  });

  test("an unrelated stored key does not turn it off", async () => {
    assertEq(await withStore({ sula_gpc_enabled: false }).isEnabled(), true);
  });
});

suite("a storage failure fails closed", () => {
  test("an unreadable preference means no capture", async () => {
    // Not the same as the default. Defaulting on is a product decision; this is
    // about not capturing when we do not KNOW the user's preference.
    assertEq(await withStore({}, { error: "boom" }).isEnabled(), false);
  });

  test("capture() refuses when the flag cannot be read", async () => {
    const L = withStore({}, { error: "boom" });
    const facts = { merchant: { name: "Acme", domain: "acme.com" }, orderRef: "X12345" };
    assertEq(await L.capture(facts, { moment: "order" }), null);
  });
});

suite("turning it off, and wiping, are different actions", () => {
  test("setEnabled(false) is what the toggle writes", async () => {
    const store = {};
    const L = withStore(store);
    await L.setEnabled(false);
    assertEq(store[KEY], false);
    assertEq(await L.isEnabled(), false);
  });

  test("wipe() erases entries but keeps the preference", async () => {
    // Deleting your history is not the same as changing your mind about the
    // feature. If wipe() cleared the flag it would silently re-enable capture
    // for a user who had turned it off and then cleared their data.
    const store = { [KEY]: false, sula_ledger_acme: { id: "acme" }, unrelated: 1 };
    const L = withStore(store);
    const removed = await L.wipe();
    assertEq(removed, 1);
    assertEq(store[KEY], false);
    assertEq(store.unrelated, 1);
    assertTrue(!("sula_ledger_acme" in store), "entry survived the wipe");
  });

  test("a disabled ledger captures nothing", async () => {
    const L = withStore({ [KEY]: false });
    const facts = { merchant: { name: "Acme", domain: "acme.com" }, orderRef: "X12345" };
    assertEq(await L.capture(facts, { moment: "order" }), null);
  });

  test("an enabled ledger does capture", async () => {
    const L = withStore({});
    const facts = { merchant: { name: "Acme", domain: "acme.com" }, orderRef: "X12345" };
    const entry = await L.capture(facts, { moment: "order" });
    assertTrue(entry && entry.id === "acme.com#X12345", "capture did not store the entry");
  });
});

suite("the flag name agrees across every file that reads it", () => {
  const files = {
    "ledger-store.js": fs.readFileSync(SRC, "utf8"),
    "background.js": fs.readFileSync(path.join(ROOT, "background.js"), "utf8"),
    "popup.js": fs.readFileSync(path.join(ROOT, "popup.js"), "utf8"),
  };

  for (const [name, src] of Object.entries(files)) {
    test(name + " uses " + KEY, () => {
      assertTrue(src.includes(KEY), name + " does not reference " + KEY);
    });
  }

  test("the old opt-in key is no longer read or written", () => {
    // It was renamed when the default flipped: a key called "optin" that is
    // true when absent would be actively misleading to the next reader.
    //
    // Matches the quoted string literal rather than any mention, so the comment
    // in ledger-store.js recording WHY the rename happened stays legal. That
    // note is worth more than the strictness.
    for (const [name, src] of Object.entries(files)) {
      assertTrue(!/["']sula_ledger_optin["']/.test(src),
        name + " still uses the old key as a string literal");
    }
  });
});

suite("the user-facing controls exist", () => {
  const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
  const ledgerUi = fs.readFileSync(path.join(ROOT, "ledger-ui.js"), "utf8");

  test("the popup has an off switch", () => {
    assertTrue(popupHtml.includes('id="ledger-toggle"'), "no ledger toggle in popup.html");
  });

  test("the popup loads the ledger model and view", () => {
    assertTrue(popupHtml.includes('src="ledger-store.js"'), "popup cannot read the ledger");
    assertTrue(popupHtml.includes('src="ledger-ui.js"'), "popup cannot render the ledger");
  });

  test("the view offers a delete-all", () => {
    assertTrue(ledgerUi.includes("ledger-wipe"), "no delete-all control");
    assertTrue(ledgerUi.includes("L.wipe()"), "delete-all is not wired to wipe()");
  });

  test("free users keep the count and the delete-all", () => {
    // The ledger is Pro (decided 2026-09-13), but capture runs for everyone so
    // an upgrade opens a ledger that is already full. What keeps that
    // defensible: a free user always sees HOW MUCH is stored and can delete
    // all of it without paying. The free view must never lose either.
    const locked = ledgerUi.slice(ledgerUi.indexOf("function lockedHtml"), ledgerUi.indexOf("function fullHtml"));
    assertTrue(locked.includes("vm.count"), "free view no longer shows how much is stored");
    assertTrue(locked.includes("ledger-wipe"), "free view no longer offers delete-all");
  });
});
