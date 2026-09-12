// Sula — passive ledger store (pure model + thin storage wrapper).
//
// A local record of what you bought, built from order and billing pages you
// were already visiting. It exists so refund deadlines date themselves and
// subscriptions appear without importing a bank statement.
//
// Split the same way subscription-guardian.js is: everything below the storage
// section is pure and takes `now` explicitly, so the date and dedup logic is
// deterministic and unit-testable. Storage is a thin wrapper at the bottom.
//
// THE RULE THIS FILE EXISTS TO ENFORCE — a checkout capture is an INTENT, not
// a purchase. Carts get abandoned. A checkout entry lands as `pending` and is
// only promoted when a confirmation for the same merchant and amount arrives.
// Unpromoted pendings expire after 72 hours. Without that, every abandoned
// cart becomes a permanent entry with a refund deadline attached, and the user
// learns within a week that the ledger is noise.
//
// window.SulaLedger

(() => {
  "use strict";

  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;

  const PENDING_TTL_MS = 72 * HOUR_MS;   // abandoned-cart expiry
  const MERGE_WINDOW_MS = 48 * HOUR_MS;  // same merchant + amount = same purchase
  const PURCHASE_TTL_MS = 548 * DAY_MS;  // ~18 months, past every dispute window
  const MAX_ENTRIES = 500;

  const KIND = { PURCHASE: "purchase", SUBSCRIPTION: "subscription" };
  const STATE = { PENDING: "pending", CONFIRMED: "confirmed", CLOSED: "closed" };

  // ── identity ──────────────────────────────────────────────────────────
  // An order reference is the only thing that identifies a purchase reliably
  // across the checkout / confirmation / revisit sequence. Without one we fall
  // back to a merchant+amount key and lean on the merge window instead.
  function entryId(facts) {
    const domain = (facts && facts.merchant && facts.merchant.domain) || "unknown";
    if (facts && facts.orderRef) return domain + "#" + facts.orderRef;
    const amount = facts && facts.amount ? String(facts.amount.value) : "0";
    return domain + "~" + amount;
  }

  // ── normalise ─────────────────────────────────────────────────────────
  function normalizeEntry(facts, opts) {
    const o = opts || {};
    const now = typeof o.now === "number" ? o.now : Date.now();
    const moment = o.moment || "order";
    const kind = moment === "subscription" ? KIND.SUBSCRIPTION : KIND.PURCHASE;
    const state = moment === "checkout" ? STATE.PENDING : STATE.CONFIRMED;

    return {
      id: entryId(facts),
      kind,
      state,
      merchant: (facts && facts.merchant) || { name: null, domain: null },
      amount: (facts && facts.amount) || null,
      orderRef: (facts && facts.orderRef) || null,
      capturedAt: now,
      occurredAt: (facts && facts.occurredAt) || null,
      sourceUrl: (facts && facts.sourceUrl) || "",
      renewal: o.renewal || null,
      policy: o.policy || null,
      deadlines: null,
      mine: true,
      provenance: (facts && facts.provenance) || {},
      confidence: typeof facts?.confidence === "number" ? facts.confidence : 0,
    };
  }

  // ── merge ─────────────────────────────────────────────────────────────
  // Two captures describe the same purchase when they share an order ref, or
  // when they share merchant and amount inside the merge window. Later, higher-
  // provenance facts win; a field is never overwritten with null.
  function isSamePurchase(a, b) {
    if (!a || !b) return false;
    const da = a.merchant && a.merchant.domain;
    const db = b.merchant && b.merchant.domain;
    if (a.orderRef && b.orderRef) return da === db && a.orderRef === b.orderRef;
    if (!da || !db || da !== db) return false;
    const va = a.amount && a.amount.value;
    const vb = b.amount && b.amount.value;
    if (va == null || vb == null || va !== vb) return false;
    return Math.abs(a.capturedAt - b.capturedAt) <= MERGE_WINDOW_MS;
  }

  function mergeEntries(existing, incoming) {
    const out = Object.assign({}, existing);
    // A confirmation promotes a pending checkout. This is the whole point of
    // the provisional rule, so it is the first thing the merge does.
    if (existing.state === STATE.PENDING && incoming.state === STATE.CONFIRMED) {
      out.state = STATE.CONFIRMED;
    }
    // Never regress a closed entry.
    if (existing.state === STATE.CLOSED) out.state = STATE.CLOSED;

    const prefer = (field) => {
      if (incoming[field] == null) return;
      if (out[field] == null) { out[field] = incoming[field]; return; }
      // Higher confidence wins a genuine conflict.
      if (incoming.confidence > existing.confidence) out[field] = incoming[field];
    };
    ["amount", "orderRef", "occurredAt", "renewal", "policy"].forEach(prefer);

    if (incoming.merchant && incoming.merchant.domain && !out.merchant.domain) {
      out.merchant = incoming.merchant;
    }
    out.provenance = Object.assign({}, existing.provenance, incoming.provenance);
    out.confidence = Math.max(existing.confidence || 0, incoming.confidence || 0);
    out.capturedAt = Math.max(existing.capturedAt, incoming.capturedAt);
    if (!out.id && incoming.id) out.id = incoming.id;
    // Once an order ref arrives, the id must become the stable one.
    if (incoming.orderRef && !existing.orderRef) out.id = incoming.id;
    return out;
  }

  // Fold a new capture into a list. Pure: returns a new list.
  function upsert(entries, incoming) {
    const list = Array.isArray(entries) ? entries.slice() : [];
    for (let i = 0; i < list.length; i++) {
      if (isSamePurchase(list[i], incoming)) {
        list[i] = mergeEntries(list[i], incoming);
        return list;
      }
    }
    list.push(incoming);
    return list;
  }

  // ── lifecycle ─────────────────────────────────────────────────────────
  // Pendings that never saw a confirmation are abandoned carts. Purchases age
  // out past every dispute window. Subscriptions never expire while active.
  function prune(entries, nowMs) {
    const now = typeof nowMs === "number" ? nowMs : Date.now();
    const kept = (entries || []).filter((e) => {
      if (!e) return false;
      if (e.state === STATE.PENDING) return now - e.capturedAt <= PENDING_TTL_MS;
      if (e.kind === KIND.SUBSCRIPTION) return true;
      return now - e.capturedAt <= PURCHASE_TTL_MS;
    });
    if (kept.length <= MAX_ENTRIES) return kept;
    // Over the cap: drop the oldest captures first, but never a subscription
    // before a purchase — subscriptions are the ones with future obligations.
    const subs = kept.filter((e) => e.kind === KIND.SUBSCRIPTION);
    const rest = kept.filter((e) => e.kind !== KIND.SUBSCRIPTION)
      .sort((a, b) => b.capturedAt - a.capturedAt)
      .slice(0, Math.max(0, MAX_ENTRIES - subs.length));
    return subs.concat(rest);
  }

  // Mark an entry closed rather than deleting it. A refunded or cancelled
  // order is still a record the user may want, and silently vanishing rows
  // are how a ledger loses trust.
  function close(entries, id) {
    return (entries || []).map((e) => (e && e.id === id ? Object.assign({}, e, { state: STATE.CLOSED }) : e));
  }

  function setMine(entries, id, mine) {
    return (entries || []).map((e) => (e && e.id === id ? Object.assign({}, e, { mine: !!mine }) : e));
  }

  // ── queries ───────────────────────────────────────────────────────────
  function activeSubscriptions(entries) {
    return (entries || []).filter(
      (e) => e && e.kind === KIND.SUBSCRIPTION && e.state !== STATE.CLOSED && e.mine !== false
    );
  }

  function purchasesAt(entries, domain) {
    if (!domain) return [];
    return (entries || []).filter(
      (e) => e && e.merchant && e.merchant.domain === domain && e.state === STATE.CONFIRMED
    );
  }

  // Renewals landing inside `days`, soonest first. Alerts read from this.
  function renewalsDueWithin(entries, days, nowMs) {
    const now = typeof nowMs === "number" ? nowMs : Date.now();
    const horizon = now + days * DAY_MS;
    return activeSubscriptions(entries)
      .filter((e) => e.renewal && typeof e.renewal.nextDate === "number")
      .filter((e) => e.renewal.nextDate >= now && e.renewal.nextDate <= horizon)
      .sort((a, b) => a.renewal.nextDate - b.renewal.nextDate);
  }

  // ── storage ───────────────────────────────────────────────────────────
  // One key per entry: a single blob means every write rewrites the whole
  // ledger and one corrupt parse loses everything.
  const KEY_PREFIX = "sula_ledger_";
  const OPT_IN_KEY = "sula_ledger_optin";

  function isEnabled() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([OPT_IN_KEY], (out) => {
          if (chrome.runtime.lastError) return resolve(false);
          resolve(!!(out && out[OPT_IN_KEY]));
        });
      } catch (_) { resolve(false); }
    });
  }

  function setEnabled(on) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [OPT_IN_KEY]: !!on }, () => resolve(true)); }
      catch (_) { resolve(false); }
    });
  }

  function loadAll() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(null, (all) => {
          if (chrome.runtime.lastError) return resolve([]);
          const out = [];
          for (const k of Object.keys(all || {})) {
            if (k.indexOf(KEY_PREFIX) === 0 && k !== OPT_IN_KEY && all[k]) out.push(all[k]);
          }
          resolve(out);
        });
      } catch (_) { resolve([]); }
    });
  }

  function persist(entries) {
    return new Promise((resolve) => {
      try {
        const write = {};
        for (const e of entries) write[KEY_PREFIX + e.id] = e;
        chrome.storage.local.set(write, () => resolve(true));
      } catch (_) { resolve(false); }
    });
  }

  // Erase everything the ledger holds. Deliberately one call with no
  // confirmation maze -- Sula cannot ship a cancellation dark pattern.
  function wipe() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(null, (all) => {
          const keys = Object.keys(all || {}).filter((k) => k.indexOf(KEY_PREFIX) === 0);
          chrome.storage.local.remove(keys, () => resolve(keys.length));
        });
      } catch (_) { resolve(0); }
    });
  }

  // Capture one page's facts. Returns the merged entry, or null when the
  // ledger is off, the capture was refused, or there is nothing identifiable.
  async function capture(facts, opts) {
    if (!(await isEnabled())) return null;
    if (!facts || facts.refused) return null;
    const hasIdentity = (facts.merchant && facts.merchant.domain) || facts.orderRef;
    if (!hasIdentity) return null;
    const entry = normalizeEntry(facts, opts);
    const all = prune(upsert(await loadAll(), entry), (opts && opts.now) || Date.now());
    await persist(all);
    return all.find((e) => e.id === entry.id) || entry;
  }

  const api = {
    KIND, STATE,
    PENDING_TTL_MS, MERGE_WINDOW_MS, PURCHASE_TTL_MS, MAX_ENTRIES,
    entryId, normalizeEntry, isSamePurchase, mergeEntries, upsert,
    prune, close, setMine,
    activeSubscriptions, purchasesAt, renewalsDueWithin,
    isEnabled, setEnabled, loadAll, persist, wipe, capture,
  };
  if (typeof window !== "undefined") window.SulaLedger = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
