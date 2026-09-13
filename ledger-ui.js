// Sula — passive ledger view (Pro).
//
// The ledger is Sula's cornerstone Pro feature. Capture runs for EVERY user,
// free and Pro, so the day someone upgrades they already have the history they
// built -- the upgrade opens a ledger that is full, not one that starts today.
//
// That arrangement carries obligations, and this file is where they are kept:
//
//   A free user can always see HOW MUCH Sula has remembered, can delete all of
//   it in one click, and can switch capture off. What Pro unlocks is the
//   detail (which purchases, from where, for how much) and what the ledger
//   powers: renewal alerts and refund-form prefill. A free user is never kept
//   in the dark about whether data exists, and never has to pay to remove it.
//
// The deciding logic is the pure `viewModel`, so every branch -- off, locked,
// empty, full -- is unit-tested without a DOM. `render` only draws it.
//
// window.SulaLedgerUI

(() => {
  "use strict";

  const DAY = 24 * 60 * 60 * 1000;
  const ALERT_HORIZON_DAYS = 5;   // matches background.js RENEWAL_HORIZON_DAYS
  const UPCOMING_HORIZON_DAYS = 30;
  const MAX_ROWS = 25;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function money(a) {
    if (!a || typeof a.value !== "number") return "";
    const sym = { USD: "$", GBP: "£", EUR: "€", JPY: "¥", INR: "₹", KRW: "₩" }[a.currency] || "$";
    return sym + a.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function agoLabel(ms, now) {
    if (typeof ms !== "number") return "";
    const days = Math.round((now - ms) / DAY);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return days + "d ago";
    if (days < 365) return Math.round(days / 30) + "mo ago";
    return Math.round(days / 365) + "y ago";
  }

  function renewsLabel(nextMs, now) {
    if (typeof nextMs !== "number") return "";
    const days = Math.ceil((nextMs - now) / DAY);
    if (days <= 0) return "renews today";
    if (days === 1) return "renews tomorrow";
    return "renews in " + days + "d";
  }

  const nameOf = (e) => (e.merchant && (e.merchant.name || e.merchant.domain)) || "Unknown merchant";

  // Pure. Everything the view shows is decided here.
  function viewModel(entries, opts) {
    const o = opts || {};
    const now = typeof o.now === "number" ? o.now : Date.now();
    const L = o.ledger;

    const visible = (entries || [])
      .filter((e) => e && e.mine !== false && e.state !== "closed")
      .sort((a, b) => (b.occurredAt || b.capturedAt || 0) - (a.occurredAt || a.capturedAt || 0));
    const count = visible.length;
    const subscriptions = visible.filter((e) => e.kind === "subscription").length;

    if (!o.enabled) return { mode: "off", count, subscriptions };

    // Locked: counts only. No merchant, amount or date crosses this line for a
    // free user -- the count is what makes the upgrade concrete.
    if (!o.pro) return { mode: "locked", count, subscriptions };

    if (!count) return { mode: "empty", count: 0, subscriptions: 0 };

    const next = (e) => (L && e.kind === "subscription" ? L.nextRenewal(e, now) : null);

    const upcoming = visible
      .filter((e) => e.kind === "subscription" && e.state === "confirmed")
      .map((e) => ({ e, at: next(e) }))
      .filter((x) => x.at !== null && x.at <= now + UPCOMING_HORIZON_DAYS * DAY)
      .sort((a, b) => a.at - b.at)
      .map((x) => ({
        name: nameOf(x.e),
        amount: money(x.e.amount),
        when: renewsLabel(x.at, now),
        urgent: x.at <= now + ALERT_HORIZON_DAYS * DAY,
      }));

    const rows = visible.slice(0, MAX_ROWS).map((e) => ({
      name: nameOf(e),
      amount: money(e.amount),
      // A pending entry is a checkout Sula saw but never saw confirmed. Saying
      // so is the honest thing: an unlabelled maybe-purchase is how a ledger
      // loses the user's trust in the rows that are certain.
      meta: [
        e.state === "pending" ? "not confirmed" : "",
        e.kind === "subscription" ? "subscription" : "",
        e.kind === "subscription" ? renewsLabel(next(e), now) : "",
        agoLabel(e.occurredAt || e.capturedAt, now),
      ].filter(Boolean).join(" · "),
    }));

    return { mode: "full", count, subscriptions, upcoming, rows, truncated: count > rows.length };
  }

  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

  function lockedHtml(vm) {
    const summary = vm.count
      ? `Sula has remembered <strong>${plural(vm.count, "purchase", "purchases")}</strong>` +
        (vm.subscriptions ? `, including ${plural(vm.subscriptions, "subscription", "subscriptions")}.` : ".")
      : "Sula is remembering purchases as you shop. Nothing yet.";
    return `
      <p class="subs-fine" style="font-size:13px;color:#d4d4d8">${summary}</p>
      <p class="subs-fine">Pro shows every purchase, warns you before a subscription renews, and fills in your refund form from what Sula saw.</p>
      <button class="action-chip outreach-chip" id="ledger-upgrade" type="button">Unlock the ledger &mdash; $6/mo</button>
      <p class="subs-fine">Stored only on this device, never uploaded${vm.count ? ` &middot; <a href="#" id="ledger-wipe">delete all</a>` : ""}</p>`;
  }

  function fullHtml(vm) {
    const upcoming = vm.upcoming.length
      ? `<div class="section-title" style="margin-top:4px">Renewing soon</div>
         <div class="subs-list">${vm.upcoming.map((u) => `
           <div class="sub-row"${u.urgent ? ' style="border-left:3px solid #fbbf24;padding-left:8px"' : ""}>
             <div class="sub-main"><div class="sub-name">${esc(u.name)}</div>
               <div class="sub-meta">${esc(u.when)}</div></div>
             <div class="sub-amt">${esc(u.amount)}</div>
           </div>`).join("")}</div>`
      : "";
    const rows = vm.rows.map((r) => `
      <div class="sub-row">
        <div class="sub-main"><div class="sub-name">${esc(r.name)}</div>
          <div class="sub-meta">${esc(r.meta)}</div></div>
        <div class="sub-amt">${esc(r.amount)}</div>
      </div>`).join("");
    return `${upcoming}
      <div class="section-title" style="margin-top:4px">Everything Sula remembered</div>
      <div class="subs-list">${rows}</div>
      <p class="subs-fine">
        ${plural(vm.count, "purchase", "purchases")} remembered${vm.truncated ? ` (showing ${vm.rows.length})` : ""} &middot;
        stored only on this device, never uploaded &middot;
        <a href="#" id="ledger-wipe">delete all</a>
      </p>`;
  }

  async function proStatus() {
    try { return typeof isPro === "function" ? !!(await isPro()) : false; }
    catch (_) { return false; }
  }

  async function render(contentEl) {
    const L = window.SulaLedger;
    if (!L || !contentEl) return;
    const now = Date.now();
    const [enabled, pro, raw] = await Promise.all([L.isEnabled(), proStatus(), L.loadAll()]);
    let entries = [];
    try { entries = L.prune(raw, now); } catch (_) { entries = []; }
    const vm = viewModel(entries, { enabled, pro, now, ledger: L });

    let body;
    if (vm.mode === "off") {
      body = `<p class="subs-fine">Remembering purchases is turned off. Turn it back on with &ldquo;Remember my purchases&rdquo; at the bottom of this popup.</p>`;
    } else if (vm.mode === "locked") {
      body = lockedHtml(vm);
    } else if (vm.mode === "empty") {
      // The empty state has to explain itself or it reads as broken.
      body = `<p class="subs-fine">Nothing yet. Sula adds a purchase when you land on an order confirmation or billing page &mdash; there's nothing to set up, it fills as you shop.</p>`;
    } else {
      body = fullHtml(vm);
    }

    const title = `Your purchase ledger${pro ? "" : ' <span class="pro-tag">PRO</span>'}`;
    const wrap = contentEl.querySelector(".subs-wrap") || contentEl;
    wrap.insertAdjacentHTML("afterbegin",
      `<div class="subs-tracked" id="ledger-block"><div class="section-title">${title}</div>${body}</div>`);

    const up = contentEl.querySelector("#ledger-upgrade");
    if (up) up.addEventListener("click", () => { if (typeof openUpgrade === "function") openUpgrade(); });

    const wipe = contentEl.querySelector("#ledger-wipe");
    if (wipe) {
      wipe.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const n = await L.wipe();
        const block = contentEl.querySelector("#ledger-block");
        if (block) {
          block.innerHTML = `<div class="section-title">${title}</div>
            <p class="subs-fine">Deleted ${plural(n, "remembered purchase", "remembered purchases")}. Sula will keep remembering new ones unless you turn it off at the bottom of this popup.</p>`;
        }
      });
    }
  }

  // A renewal alert has two halves: the badge gets attention, and this banner
  // answers "what is renewing?" when the popup opens. Without it the badge
  // points at a popup that shows contacts and nothing about the renewal.
  // Pro only, matching the badge.
  async function renderRenewalBanner(beforeEl) {
    const L = window.SulaLedger;
    if (!L || !beforeEl || !beforeEl.parentNode) return;
    if (document.getElementById("ledger-renewal-banner")) return;
    const [enabled, pro, raw] = await Promise.all([L.isEnabled(), proStatus(), L.loadAll()]);
    if (!enabled || !pro) return;
    const due = L.renewalsDueWithin(raw, ALERT_HORIZON_DAYS, Date.now());
    if (!due.length) return;

    const names = due.slice(0, 2).map(nameOf).join(" and ") + (due.length > 2 ? ` and ${due.length - 2} more` : "");
    const el = document.createElement("div");
    el.id = "ledger-renewal-banner";
    el.setAttribute("role", "status");
    el.style.cssText = "margin:8px 16px 0;padding:10px 12px;border-radius:10px;" +
      "background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.35);" +
      "font-size:12px;color:#fde68a;display:flex;gap:8px;align-items:center";
    el.innerHTML =
      `<span style="flex:1"><strong>${plural(due.length, "subscription renews", "subscriptions renew")} in the next ${ALERT_HORIZON_DAYS} days</strong><br>${esc(names)}</span>` +
      `<button class="action-chip" id="ledger-renewal-see" type="button">See them</button>`;
    beforeEl.parentNode.insertBefore(el, beforeEl);
    el.querySelector("#ledger-renewal-see").addEventListener("click", () => {
      const tab = document.querySelector('.view-tab[data-view="subs"]');
      if (tab) tab.click();
    });
  }

  window.SulaLedgerUI = { render, renderRenewalBanner, viewModel };
})();
