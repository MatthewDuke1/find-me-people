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
    // The composer (SulaLedgerExtract.captureInput) decides kind from renewal
    // terms, so a free-trial checkout is a subscription from the moment it is
    // seen. Falls back to the page moment for callers that don't say.
    const kind = o.kind === KIND.SUBSCRIPTION || moment === "subscription"
      ? KIND.SUBSCRIPTION : KIND.PURCHASE;
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
    // A subscription is one ongoing obligation, not one entry per bill. Seeing
    // the same billing page each month must update the entry, not add another
    // -- otherwise a user with one Netflix plan gets one renewal alert per
    // month they happened to visit the account page. Price changes are
    // allowed through; that is exactly what a renewal can do.
    if (a.kind === KIND.SUBSCRIPTION && b.kind === KIND.SUBSCRIPTION && da && da === db) return true;
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
    ["amount", "orderRef", "occurredAt", "policy"].forEach(prefer);

    // Renewal terms are time-sensitive, so the NEWER capture wins field by
    // field -- a later billing page carries the current next date. A field is
    // still never replaced with nothing.
    if (incoming.renewal || existing.renewal) {
      const a = existing.renewal || {};
      const b = incoming.renewal || {};
      out.renewal = {
        cadence: b.cadence || a.cadence || null,
        nextDate: typeof b.nextDate === "number" ? b.nextDate
          : (typeof a.nextDate === "number" ? a.nextDate : null),
        phrase: b.phrase || a.phrase || "",
      };
    }
    // Once anything shows it is a subscription, it stays one.
    if (incoming.kind === KIND.SUBSCRIPTION) out.kind = KIND.SUBSCRIPTION;

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

  // Calendar-aware period arithmetic in UTC. Months are not 30 days: a plan
  // that bills on Jan 31 bills next on the last day of February, and 30-day
  // steps would drift a monthly renewal by a week within a year.
  function addPeriod(ms, cadence) {
    if (cadence === "weekly") return ms + 7 * DAY_MS;
    const months = cadence === "annual" ? 12 : cadence === "quarterly" ? 3 : cadence === "monthly" ? 1 : 0;
    if (!months) return null;
    const d = new Date(ms);
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + months, day = d.getUTCDate();
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(day, lastDay), d.getUTCHours(), d.getUTCMinutes());
  }

  // When does this subscription next charge? Computed at READ time, not stored:
  // a date written at capture goes stale the day after it passes, and a user
  // who saw a billing page once in March still needs a warning in October.
  //
  //   explicit future date           -> that date
  //   cadence (+ past date or none)  -> roll forward from the last known charge
  //   neither                        -> null; no date is better than a guess
  //
  // Note: rolling forward from a PAST explicit date keeps the merchant's own
  // billing day, which is more accurate than the day Sula happened to see it.
  const RENEWAL_GRACE_MS = 12 * HOUR_MS;
  function nextRenewal(entry, nowMs) {
    const now = typeof nowMs === "number" ? nowMs : Date.now();
    const r = entry && entry.renewal;
    if (!r) return null;
    if (typeof r.nextDate === "number" && r.nextDate >= now - RENEWAL_GRACE_MS) return r.nextDate;
    if (!r.cadence) return null;
    let t = typeof r.nextDate === "number" ? r.nextDate : (entry.occurredAt || entry.capturedAt);
    if (typeof t !== "number") return null;
    // Bounded: a weekly plan anchored 18 months back is ~80 steps.
    for (let i = 0; i < 1000 && t < now - RENEWAL_GRACE_MS; i++) {
      const next = addPeriod(t, r.cadence);
      if (next === null || next <= t) return null;
      t = next;
    }
    return t >= now - RENEWAL_GRACE_MS ? t : null;
  }

  // Renewals landing inside `days`, soonest first. Alerts read from this.
  // Unconfirmed checkouts are excluded: warning someone that an abandoned
  // cart is about to renew is the fastest way to teach them to ignore alerts.
  function renewalsDueWithin(entries, days, nowMs) {
    const now = typeof nowMs === "number" ? nowMs : Date.now();
    const horizon = now + days * DAY_MS;
    return activeSubscriptions(entries)
      .filter((e) => e.state === STATE.CONFIRMED)
      .map((e) => ({ e, next: nextRenewal(e, now) }))
      .filter((x) => x.next !== null && x.next <= horizon)
      .sort((a, b) => a.next - b.next)
      .map((x) => x.e);
  }

  // Confirmed purchases for the site the user is on, newest first. Matches
  // across subdomains in both directions -- the order was placed on
  // shop.acme.com and the refund is being filed from acme.com, or the reverse.
  function purchasesForHost(entries, host) {
    const h = String(host || "").toLowerCase().replace(/^www[.]/, "");
    if (!h) return [];
    return (entries || [])
      .filter((e) => {
        if (!e || e.state !== STATE.CONFIRMED || e.mine === false) return false;
        const d = e.merchant && e.merchant.domain;
        if (!d) return false;
        return d === h || h.endsWith("." + d) || d.endsWith("." + h);
      })
      .sort((a, b) => (b.occurredAt || b.capturedAt || 0) - (a.occurredAt || a.capturedAt || 0));
  }

  // ── storage ───────────────────────────────────────────────────────────
  // One key per entry: a single blob means every write rewrites the whole
  // ledger and one corrupt parse loses everything.
  const KEY_PREFIX = "sula_ledger_";
  // Named for what it is. This was `sula_ledger_optin` while the ledger was
  // off until asked for; it is now on by default and the flag records an opt
  // OUT, so the old name would have been a lie. Nothing had ever written the
  // old key -- there was no UI to set it -- so no migration is needed.
  const ENABLED_KEY = "sula_ledger_enabled";

  // Default ON, matching the side-panel and GPC toggles: absent means on,
  // and only an explicit `false` turns it off. Read this convention from
  // popup.js -- every master switch in Sula uses `!== false`.
  function isEnabled() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([ENABLED_KEY], (out) => {
          // On a storage error, fail CLOSED. Capturing because we could not
          // read the user's preference is the one outcome with no defence.
          if (chrome.runtime.lastError) return resolve(false);
          resolve(!out || out[ENABLED_KEY] !== false);
        });
      } catch (_) { resolve(false); }
    });
  }

  function setEnabled(on) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [ENABLED_KEY]: !!on }, () => resolve(true)); }
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
            if (k.indexOf(KEY_PREFIX) === 0 && k !== ENABLED_KEY && all[k]) out.push(all[k]);
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

  // What a ledger entry contributes to the refund form. Pure, so the exact
  // values that land in the form -- above all the date format the deadline
  // engine requires -- are tested rather than assumed.
  function refundPrefill(entry) {
    const e = entry || {};
    const when = e.occurredAt || e.capturedAt;
    let date = "";
    if (typeof when === "number" && isFinite(when)) {
      const d = new Date(when);
      date = d.getUTCFullYear() + "-" +
        String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
        String(d.getUTCDate()).padStart(2, "0");
    }
    const a = e.amount;
    const amount = a && typeof a.value === "number"
      ? (a.raw && /\d/.test(a.raw) ? a.raw : "$" + a.value.toFixed(2))
      : "";
    return {
      company: (e.merchant && (e.merchant.name || e.merchant.domain)) || "",
      amount,
      orderRef: e.orderRef || "",
      date,
    };
  }

  // Entries from a raw chrome.storage.local.get(null) snapshot. The background
  // worker already holds one, so it doesn't need loadAll()'s extra read.
  function entriesFromSnapshot(all) {
    const out = [];
    for (const k of Object.keys(all || {})) {
      if (k.indexOf(KEY_PREFIX) === 0 && k !== ENABLED_KEY && all[k] && typeof all[k] === "object") {
        out.push(all[k]);
      }
    }
    return out;
  }

  // The number on the toolbar badge. Pure, so the whole alert decision is
  // tested rather than just the date maths underneath it.
  //   not Pro          -> 0   (renewal alerts are a Pro feature)
  //   ledger off       -> 0
  //   otherwise        -> confirmed subscriptions renewing within `days`
  function dueCountFromSnapshot(all, opts) {
    const o = opts || {};
    if (!o.pro) return 0;
    if (!all || all[ENABLED_KEY] === false) return 0;
    const days = typeof o.days === "number" ? o.days : 5;
    return renewalsDueWithin(entriesFromSnapshot(all), days, o.now).length;
  }

  function removeKeys(keys) {
    return new Promise((resolve) => {
      try { chrome.storage.local.remove(keys, () => resolve(true)); }
      catch (_) { resolve(false); }
    });
  }

  // Erase everything the ledger holds. Deliberately one call with no
  // confirmation maze -- Sula cannot ship a cancellation dark pattern.
  //
  // The enabled flag is preserved: wiping your history is not the same as
  // changing your mind about the feature.
  function wipe() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(null, (all) => {
          const keys = Object.keys(all || {}).filter((k) => k.indexOf(KEY_PREFIX) === 0 && k !== ENABLED_KEY);
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
    const before = await loadAll();
    const all = prune(upsert(before, entry), (opts && opts.now) || Date.now());
    // persist() only WRITES. Without this, an entry dropped by prune -- or one
    // whose id changed when its order number arrived -- kept its old key, and
    // the next loadAll() brought it straight back. Pruning never removed
    // anything, and a re-keyed purchase appeared twice.
    const keep = new Set(all.map((e) => KEY_PREFIX + e.id));
    const stale = before.map((e) => KEY_PREFIX + e.id).filter((k) => !keep.has(k) && k !== ENABLED_KEY);
    if (stale.length) await removeKeys(stale);
    await persist(all);
    return all.find((e) => e.id === entry.id) ||
      all.find((e) => isSamePurchase(e, entry)) || entry;
  }

  const api = {
    KIND, STATE,
    PENDING_TTL_MS, MERGE_WINDOW_MS, PURCHASE_TTL_MS, MAX_ENTRIES,
    entryId, normalizeEntry, isSamePurchase, mergeEntries, upsert,
    prune, close, setMine,
    activeSubscriptions, purchasesAt, purchasesForHost, renewalsDueWithin,
    nextRenewal, addPeriod, entriesFromSnapshot, dueCountFromSnapshot, refundPrefill,
    isEnabled, setEnabled, loadAll, persist, wipe, capture,
  };
  if (typeof window !== "undefined") window.SulaLedger = api;
  // background.js loads this with importScripts in Chrome's service worker,
  // where there is no window.
  else if (typeof self !== "undefined") self.SulaLedger = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
