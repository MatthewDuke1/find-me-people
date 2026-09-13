// The passive ledger, end to end: renewal dates, alerts, the Pro split, and
// refund-form prefill.
//
// Why this file exists. Every serious ledger bug so far passed every unit test,
// because the tests set state directly instead of going through the code that
// produces it:
//
//   - The on/off switch had no UI, so capture never ran. Tests injected the flag.
//   - Capture stored renewal terms with `nextDate: null`, and every alert filter
//     required a number, so no alert could ever fire. Tests set nextDate by hand.
//   - Capture was only called on DOM mutations, so static order pages never
//     captured at all. No test touched the call site.
//   - Pruned or re-keyed entries kept their storage keys and came straight back.
//   - A tab with no contacts set its badge to "", covering the renewal count.
//
// So the core suite here drives SulaLedgerExtract.captureInput -> capture ->
// storage -> the same badge function background.js calls. If any link in that
// chain breaks again, "a real subscription page produces a real alert" fails.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 13, 15, 0);   // 13 Sep 2026, 15:00 UTC
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const longDate = (ms) => {
  const d = new Date(ms);
  return MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear();
};

const X = loadModuleApi(path.join(ROOT, "ledger-extract.js"), "SulaLedgerExtract");
const UI = loadModuleApi(path.join(ROOT, "ledger-ui.js"), "SulaLedgerUI");
const D = loadModuleApi(path.join(ROOT, "refund-deadline-engine.js"), "SulaRefundDeadlines");

function stubStore(store) {
  return {
    runtime: { lastError: null },
    storage: {
      local: {
        get: (keys, cb) => {
          if (keys === null) return cb(Object.assign({}, store));
          const out = {};
          for (const k of [].concat(keys)) if (k in store) out[k] = store[k];
          cb(out);
        },
        set: (obj, cb) => { Object.assign(store, obj); cb && cb(); },
        remove: (keys, cb) => { for (const k of [].concat(keys)) delete store[k]; cb && cb(); },
      },
    },
  };
}
const ledgerWith = (store) => loadModuleApi(path.join(ROOT, "ledger-store.js"), "SulaLedger", stubStore(store));
const L = ledgerWith({});

const page = (bodyText, host) => ({
  url: "https://" + (host || "acme.com") + "/account/confirmation",
  title: "Order confirmation | Acme",
  siteName: "Acme",
  topDomain: host || "acme.com",
  bodyText,
});

async function captureAt(ledger, body, moment, now, host) {
  const { facts, opts } = X.captureInput(page(body, host), { moment, now });
  if (!opts) return null;
  return ledger.capture(facts, opts);
}

// ─────────────────────────────────────────────────────────────────────────────
suite("reading renewal terms off a page", () => {
  test("an explicit next billing date is read", () => {
    const due = T0 + 12 * DAY;
    const r = X.extractRenewal("Next billing date: " + longDate(due), { now: T0 });
    assertTrue(r && typeof r.nextDate === "number", "no date read");
    assertEq(new Date(r.nextDate).getUTCDate(), new Date(due).getUTCDate());
  });

  test("a cadence is read from renewal wording", () => {
    assertEq(X.extractRenewal("Your plan renews monthly until you cancel.", { now: T0 }).cadence, "monthly");
    assertEq(X.extractRenewal("$99.00 billed annually", { now: T0 }).cadence, "annual");
  });

  test("two cadences near renewal wording commit to neither", () => {
    const r = X.extractRenewal("Subscription: $9.99/month or $99/year, renews automatically", { now: T0 });
    assertTrue(!r || r.cadence === null, "guessed a cadence: " + JSON.stringify(r));
  });

  test("a price with no renewal wording is not a billing term", () => {
    assertEq(X.extractRenewal("Wool socks, $12/month savings bundle in stock", { now: T0 }), null);
  });

  test("a next date already in the past is not trusted", () => {
    const r = X.extractRenewal("Next billing date: " + longDate(T0 - 40 * DAY) + ". Renews monthly.", { now: T0 });
    assertEq(r.nextDate, null);
    assertEq(r.cadence, "monthly");
  });

  test("the purchase date is never the next billing date", () => {
    const f = X.extractOrderFacts(page("Order total $9.99. Next billing date: " + longDate(T0 + 20 * DAY)));
    assertEq(f.occurredAt, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite("working out the next renewal", () => {
  const sub = (renewal, extra) => Object.assign(
    { kind: "subscription", state: "confirmed", capturedAt: T0, occurredAt: null, renewal }, extra || {});

  test("an explicit future date is used as-is", () => {
    assertEq(L.nextRenewal(sub({ nextDate: T0 + 3 * DAY }), T0), T0 + 3 * DAY);
  });

  test("a monthly plan rolls forward by calendar month", () => {
    const anchor = Date.UTC(2026, 5, 15, 12);            // 15 Jun
    const next = L.nextRenewal(sub({ cadence: "monthly" }, { occurredAt: anchor }), T0);
    assertEq(new Date(next).toISOString().slice(0, 10), "2026-09-15");
  });

  test("month-end billing clamps instead of drifting", () => {
    assertEq(new Date(L.addPeriod(Date.UTC(2026, 0, 31), "monthly")).toISOString().slice(0, 10), "2026-02-28");
  });

  test("an annual plan rolls by twelve months", () => {
    const next = L.nextRenewal(sub({ cadence: "annual" }, { occurredAt: Date.UTC(2025, 2, 1) }), T0);
    assertEq(new Date(next).toISOString().slice(0, 10), "2027-03-01");
  });

  test("a past explicit date keeps the merchant's billing day", () => {
    const next = L.nextRenewal(sub({ cadence: "monthly", nextDate: Date.UTC(2026, 6, 2, 12) }), T0);
    assertEq(new Date(next).toISOString().slice(0, 10), "2026-10-02");
  });

  test("no cadence and no date means no renewal, not a guess", () => {
    assertEq(L.nextRenewal(sub({ cadence: null, nextDate: null, phrase: "cancel anytime" }), T0), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite("end to end: a real subscription page produces a real alert", () => {
  const body = (due) =>
    "Thanks for subscribing to Acme Plus. Order #SUB-12345. Order total $9.99. " +
    "Your plan renews monthly. Next billing date: " + longDate(due) + ".";

  test("Pro: capture -> storage -> badge count of 1", async () => {
    const store = {};
    await captureAt(ledgerWith(store), body(T0 + 3 * DAY), "order", T0);
    assertEq(ledgerWith(store).dueCountFromSnapshot(store, { pro: true, now: T0, days: 5 }), 1);
  });

  test("free: the purchase is captured, but no alert", async () => {
    const store = {};
    await captureAt(ledgerWith(store), body(T0 + 3 * DAY), "order", T0);
    assertEq(ledgerWith(store).entriesFromSnapshot(store).length, 1);
    assertEq(ledgerWith(store).dueCountFromSnapshot(store, { pro: false, now: T0, days: 5 }), 0);
  });

  test("switched off: nothing captured, no alert", async () => {
    const store = { sula_ledger_enabled: false };
    await captureAt(ledgerWith(store), body(T0 + 3 * DAY), "order", T0);
    assertEq(ledgerWith(store).entriesFromSnapshot(store).length, 0);
    assertEq(ledgerWith(store).dueCountFromSnapshot(store, { pro: true, now: T0, days: 5 }), 0);
  });

  test("a renewal wording with no date still alerts once the month comes round", async () => {
    const store = {};
    await captureAt(ledgerWith(store),
      "Welcome to Acme Plus. Order #SUB-77777. Order total $9.99. Renews monthly until you cancel.",
      "order", T0);
    const L2 = ledgerWith(store);
    assertEq(L2.dueCountFromSnapshot(store, { pro: true, now: T0 + 10 * DAY, days: 5 }), 0);
    assertEq(L2.dueCountFromSnapshot(store, { pro: true, now: T0 + 27 * DAY, days: 5 }), 1);
  });

  test("an abandoned checkout with renewal terms never alerts", async () => {
    const store = {};
    await captureAt(ledgerWith(store), "Start free trial, then $9.99/month. Renews monthly. Total $0.00",
      "checkout", T0);
    assertEq(ledgerWith(store).dueCountFromSnapshot(store, { pro: true, now: T0 + 27 * DAY, days: 5 }), 0);
  });

  test("visiting the billing page again next month is still one subscription", async () => {
    const store = {};
    await captureAt(ledgerWith(store), body(T0 + 3 * DAY), "subscription", T0);
    await captureAt(ledgerWith(store),
      "Your Acme Plus plan renews monthly. Next billing date: " + longDate(T0 + 33 * DAY) + ".",
      "subscription", T0 + 31 * DAY);
    const entries = ledgerWith(store).entriesFromSnapshot(store);
    assertEq(entries.length, 1);
    assertEq(ledgerWith(store).dueCountFromSnapshot(store, { pro: true, now: T0 + 31 * DAY, days: 5 }), 1);
  });

  test("a purchase re-keyed by its order number leaves no ghost behind", async () => {
    const store = {};
    await captureAt(ledgerWith(store), "Order total $42.00. Thanks!", "order", T0);
    await captureAt(ledgerWith(store), "Order #ORD-55555. Order total $42.00. Thanks!", "order", T0 + 60 * 1000);
    const keys = Object.keys(store).filter((k) => k.indexOf("sula_ledger_") === 0);
    assertEq(keys.length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite("the Pro split", () => {
  const entries = [
    { id: "acme.com#SUB-1", kind: "subscription", state: "confirmed", capturedAt: T0 - DAY,
      merchant: { name: "Acme Plus", domain: "acme.com" }, amount: { value: 9.99, currency: "USD" },
      renewal: { cadence: "monthly", nextDate: T0 + 2 * DAY } },
    { id: "shop.com#A1", kind: "purchase", state: "confirmed", capturedAt: T0 - 3 * DAY,
      merchant: { name: "Shop", domain: "shop.com" }, amount: { value: 40, currency: "USD" } },
  ];

  test("free users get counts, and nothing else", () => {
    const vm = UI.viewModel(entries, { enabled: true, pro: false, now: T0, ledger: L });
    assertEq(vm.mode, "locked");
    assertEq(vm.count, 2);
    assertEq(vm.subscriptions, 1);
    const leaked = JSON.stringify(vm);
    assertTrue(leaked.indexOf("Acme") === -1 && leaked.indexOf("9.99") === -1,
      "merchant or amount leaked into the free view: " + leaked);
  });

  test("Pro users get every row, with renewals first", () => {
    const vm = UI.viewModel(entries, { enabled: true, pro: true, now: T0, ledger: L });
    assertEq(vm.mode, "full");
    assertEq(vm.rows.length, 2);
    assertEq(vm.upcoming.length, 1);
    assertTrue(vm.upcoming[0].urgent, "a renewal in 2 days should be flagged urgent");
  });

  test("switched off reads as off, for everyone", () => {
    assertEq(UI.viewModel(entries, { enabled: false, pro: true, now: T0, ledger: L }).mode, "off");
    assertEq(UI.viewModel(entries, { enabled: false, pro: false, now: T0, ledger: L }).mode, "off");
  });

  test("a free user can always delete what Sula holds", () => {
    // Paying to see your purchases is the deal. Paying to REMOVE them would not be.
    const src = read("ledger-ui.js");
    const locked = src.slice(src.indexOf("function lockedHtml"), src.indexOf("function fullHtml"));
    assertTrue(locked.includes("ledger-wipe"), "no delete-all in the free view");
  });

  test("the badge is Pro-only", () => {
    const store = {};
    for (const e of entries) store["sula_ledger_" + e.id] = e;
    assertEq(L.dueCountFromSnapshot(store, { pro: false, now: T0, days: 5 }), 0);
    assertEq(L.dueCountFromSnapshot(store, { pro: true, now: T0, days: 5 }), 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite("refund deadlines dated by the ledger", () => {
  const entry = {
    kind: "purchase", state: "confirmed", capturedAt: T0 + 5 * DAY,
    occurredAt: Date.UTC(2026, 8, 2, 12), orderRef: "ORD-88213",
    merchant: { name: "Acme", domain: "shop.acme.com" }, amount: { value: 104.51, currency: "USD", raw: "$104.51" },
  };

  test("prefill produces the exact format the deadline engine accepts", () => {
    const pre = L.refundPrefill(entry);
    assertEq(pre.date, "2026-09-02");
    assertTrue(D.computeDeadlines(pre.date, { paymentType: "credit" }).ok, "deadline engine rejected the prefilled date");
  });

  test("prefill carries the amount and order number", () => {
    const pre = L.refundPrefill(entry);
    assertEq(pre.amount, "$104.51");
    assertEq(pre.orderRef, "ORD-88213");
    assertEq(pre.company, "Acme");
  });

  test("a purchase on a subdomain is found from the main site", () => {
    assertEq(L.purchasesForHost([entry], "www.acme.com").length, 1);
    assertEq(L.purchasesForHost([entry], "other.com").length, 0);
  });

  test("an unconfirmed checkout never prefills a refund", () => {
    assertEq(L.purchasesForHost([Object.assign({}, entry, { state: "pending" })], "acme.com").length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wiring. These files need a browser or a service worker to execute, so the
// checks below are structural -- and each one pins a bug that actually shipped.
suite("wiring that has broken before", () => {
  const content = read("content.js");
  const bg = read("background.js");
  const manifest = JSON.parse(read("manifest.json"));

  test("capture runs after the initial scan, not only on DOM mutations", () => {
    const rescan = content.indexOf("const rescanAndUpdate");
    const initial = content.indexOf("setTimeout(sulaCaptureToLedger");
    assertTrue(initial !== -1, "no initial-scan capture call");
    assertTrue(initial < rescan, "initial capture call is not in the initial scan path");
  });

  test("content.js uses the tested composition", () => {
    assertTrue(content.includes("SulaLedgerExtract.captureInput("), "capture bypasses captureInput");
  });

  test("the worker uses the shared date logic, not its own copy", () => {
    assertTrue(bg.includes("Ledger.dueCountFromSnapshot("), "background does not use the shared badge count");
    assertTrue(!bg.includes("function renewalsDueSoon"), "a private renewal filter is back in background.js");
  });

  test("the worker can load the store in both browsers", () => {
    assertTrue(bg.includes('importScripts("ledger-store.js")'), "Chrome service worker cannot load the store");
    const scripts = manifest.background.scripts || [];
    assertTrue(scripts.indexOf("ledger-store.js") !== -1 &&
      scripts.indexOf("ledger-store.js") < scripts.indexOf("background.js"),
      "Firefox event page does not load ledger-store.js before background.js");
  });

  test("the alarm is re-armed on browser startup", () => {
    const line = bg.split(String.fromCharCode(10)).find((l) => l.includes("onStartup.addListener"));
    assertTrue(!!line && line.includes("ensureRenewalAlarm"), "alarm only created on install");
  });

  test("a tab with no contacts does not cover the renewal badge", () => {
    assertTrue(bg.includes("text: null, tabId"), "per-tab badge still overrides the global renewal count");
  });

  test("the popup shows what is renewing, not just a number", () => {
    assertTrue(read("popup.js").includes("renderRenewalBanner("), "no renewal banner in the popup");
  });

  test("the refund form reads the ledger", () => {
    const adv = read("advocacy-ui.js");
    assertTrue(adv.includes("purchasesForHost(") && adv.includes("refundPrefill("), "refund form ignores the ledger");
  });
});
