// Sula — passive ledger view.
//
// The ledger captures on by default, which places an obligation on this file:
// if Sula is remembering purchases without being asked each time, the user must
// be able to SEE everything it holds and delete all of it, in one click, from a
// surface they can actually reach.
//
// So this view is deliberately NOT Pro-gated, even though it renders inside the
// Pro Subs tab. Statement import is the paid feature; looking at your own data
// and erasing it is not something to sell back to someone. A free user who can
// be captured from but cannot see or clear the result is the one arrangement
// that would be indefensible.
//
// Renders above the statement dropzone on purpose. The ledger is the passive
// path and the import is the fallback, and the order on screen should say so.
//
// window.SulaLedgerUI

(() => {
  "use strict";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const money = (a) => {
    if (!a || typeof a.value !== "number") return "";
    const sym = { USD: "$", GBP: "£", EUR: "€", JPY: "¥", INR: "₹", KRW: "₩" }[a.currency] || "$";
    return sym + a.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const DAY = 24 * 60 * 60 * 1000;

  function whenLabel(ms, now) {
    if (typeof ms !== "number") return "";
    const days = Math.round((now - ms) / DAY);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return days + "d ago";
    if (days < 365) return Math.round(days / 30) + "mo ago";
    return Math.round(days / 365) + "y ago";
  }

  function renewalLabel(e, now) {
    const next = e.renewal && e.renewal.nextDate;
    if (typeof next !== "number") return "";
    const days = Math.ceil((next - now) / DAY);
    if (days < 0) return "";
    if (days === 0) return "renews today";
    if (days === 1) return "renews tomorrow";
    return "renews in " + days + "d";
  }

  function row(e, now) {
    const name = (e.merchant && (e.merchant.name || e.merchant.domain)) || "Unknown merchant";
    const renew = renewalLabel(e, now);
    // A pending entry is a checkout Sula saw but never saw confirmed. Saying so
    // is the honest thing -- an unlabelled maybe-purchase is how a ledger loses
    // the user's trust in the rows that are certain.
    const meta = [
      e.state === "pending" ? "not confirmed" : "",
      e.kind === "subscription" ? "subscription" : "",
      renew,
      whenLabel(e.occurredAt || e.capturedAt, now),
    ].filter(Boolean).join(" · ");

    return `
      <div class="sub-row">
        <div class="sub-main">
          <div class="sub-name">${esc(name)}</div>
          <div class="sub-meta">${esc(meta)}</div>
        </div>
        <div class="sub-amt">${esc(money(e.amount))}</div>
      </div>`;
  }

  async function render(contentEl) {
    const L = window.SulaLedger;
    if (!L || !contentEl) return;

    const enabled = await L.isEnabled();
    const now = Date.now();
    let entries = [];
    try { entries = L.prune(await L.loadAll(), now); } catch (_) { entries = []; }

    // Newest first, and never show an entry the user marked as not theirs.
    entries = entries
      .filter((e) => e && e.mine !== false && e.state !== "closed")
      .sort((a, b) => (b.occurredAt || b.capturedAt || 0) - (a.occurredAt || a.capturedAt || 0));

    let body;
    if (!enabled) {
      body = `<p class="subs-fine">Remembering purchases is turned off. Turn it back on at the bottom of this popup.</p>`;
    } else if (!entries.length) {
      // The empty state has to explain itself or it reads as broken. The ledger
      // fills as you shop; there is nothing for the user to do.
      body = `<p class="subs-fine">Nothing yet. Sula adds a purchase when you land on an order confirmation or billing page — there's nothing to set up, it fills as you shop.</p>`;
    } else {
      const shown = entries.slice(0, 25);
      body = `<div class="subs-list">${shown.map((e) => row(e, now)).join("")}</div>
        <p class="subs-fine">
          ${entries.length} remembered${entries.length > shown.length ? ` (showing ${shown.length})` : ""} ·
          stored only on this device, never uploaded ·
          <a href="#" id="ledger-wipe">delete all</a>
        </p>`;
    }

    const html = `
      <div class="subs-tracked" id="ledger-block">
        <div class="section-title">Purchases Sula remembered</div>
        ${body}
      </div>`;

    const wrap = contentEl.querySelector(".subs-wrap") || contentEl;
    wrap.insertAdjacentHTML("afterbegin", html);

    const wipe = contentEl.querySelector("#ledger-wipe");
    if (wipe) {
      wipe.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const n = await L.wipe();
        const block = contentEl.querySelector("#ledger-block");
        if (block) {
          block.innerHTML = `<div class="section-title">Purchases Sula remembered</div>
            <p class="subs-fine">Deleted ${n} remembered purchase${n === 1 ? "" : "s"}. Sula will keep remembering new ones unless you turn it off below.</p>`;
        }
      });
    }
  }

  window.SulaLedgerUI = { render };
})();
