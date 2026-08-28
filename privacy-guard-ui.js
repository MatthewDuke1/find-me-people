// Sula — Privacy Guard tab (Pro).
//
// The honest privacy layer. Two jobs, both local:
//   1. GPC status — shows whether Sula's "don't sell my data" signal is on
//      (the sula_gpc_enabled flag, same one gpc-inject.js / background.js use).
//   2. Data-broker opt-out tracker — the brokers that sell your info to the
//      spammers, each with its real opt-out page, a "done" checkbox you tick,
//      and a re-check reminder six months out (brokers re-list you).
//
// What this is NOT: Sula cannot submit removals for you. That needs
// per-broker forms, email confirmation, sometimes ID — server-side work a
// local, backend-less extension can't do (it's what DeleteMe charges for).
// So the copy is deliberately "we point you at each one and track it," never
// "we remove you." That honesty is the point for a consumer-advocacy tool.
//
// Pro-gated (matches the site's Privacy Guard positioning). State lives in
// chrome.storage.local under sula_broker_optouts. window.SulaPrivacyGuardUI.

(() => {
  "use strict";

  const STORE_KEY = "sula_broker_optouts";   // { [id]: { done: ts } }
  const GPC_KEY = "sula_gpc_enabled";
  const RECHECK_MS = 182 * 24 * 60 * 60 * 1000; // ~6 months

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lcGet = (k) => new Promise((r) => chrome.storage.local.get([k], (o) => r(o[k] ?? null)));
  const lcSet = (o) => new Promise((r) => chrome.storage.local.set(o, r));

  async function gate(label) {
    if (typeof gateProFeature === "function") return await gateProFeature(label);
    return true; // soft-launch: matches license.js
  }

  // The brokers worth the user's time, highest-impact first. Links verified
  // Aug 2026; the tracker is data-driven so this list is the single source.
  const BROKERS = [
    { id: "spokeo", name: "Spokeo", url: "https://www.spokeo.com/optout", note: "Paste your listing URL, confirm by email." },
    { id: "whitepages", name: "WhitePages", url: "https://www.whitepages.com/suppression-requests", note: "May ask for a phone verification." },
    { id: "beenverified", name: "BeenVerified", url: "https://www.beenverified.com/app/optout/search", note: "Find your record, verify by email." },
    { id: "truepeoplesearch", name: "TruePeopleSearch", url: "https://www.truepeoplesearch.com/removal", note: "One of the most-scraped free sites." },
    { id: "peopleconnect", name: "Intelius / TruthFinder / Instant Checkmate", url: "https://suppression.peopleconnect.us/login", note: "One portal clears all three." },
    { id: "radaris", name: "Radaris", url: "https://radaris.com/control/privacy", note: "Use their privacy control page." },
    { id: "acxiom", name: "Acxiom", url: "https://isapps.acxiom.com/optout/optout.aspx", note: "Big aggregator that feeds the others." },
    { id: "lexisnexis", name: "LexisNexis", url: "https://optout.lexisnexis.com", note: "Feeds background checks; needs ID, ~30 days." },
  ];

  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch (_e) { return ""; }
  }

  async function render(contentEl, _ctx) {
    if (!(await gate("Privacy Guard"))) return; // gateProFeature renders its own upsell

    const state = (await lcGet(STORE_KEY)) || {};
    const gpcOn = (await lcGet(GPC_KEY)) !== false; // default on

    const doneCount = BROKERS.filter((b) => state[b.id] && state[b.id].done).length;

    const rows = BROKERS.map((b) => {
      const rec = state[b.id];
      const done = !!(rec && rec.done);
      const recheck = done ? rec.done + RECHECK_MS : 0;
      const recheckDue = done && Date.now() >= recheck;
      return `
        <div class="pg-row${done ? " pg-done" : ""}">
          <button class="pg-check" data-broker="${esc(b.id)}" role="checkbox"
                  aria-checked="${done ? "true" : "false"}"
                  aria-label="Mark ${esc(b.name)} opt-out done"></button>
          <div class="pg-row-body">
            <div class="pg-name">${esc(b.name)}</div>
            <div class="pg-note">${esc(b.note)}</div>
            ${done
              ? `<div class="pg-status${recheckDue ? " pg-due" : ""}">${recheckDue
                  ? "Time to re-check — brokers re-list you"
                  : "Done · re-check " + fmtDate(recheck)}</div>`
              : `<a class="pg-link" href="${esc(b.url)}" target="_blank" rel="noopener">Open opt-out page ↗</a>`}
          </div>
        </div>`;
    }).join("");

    contentEl.innerHTML = `
      <div class="pg-wrap">
        <div class="pg-gpc ${gpcOn ? "on" : "off"}">
          <span class="pg-gpc-dot"></span>
          <div>
            <div class="pg-gpc-title">Do-not-sell signal ${gpcOn ? "on" : "off"}</div>
            <div class="pg-gpc-sub">${gpcOn
              ? "Sula tells every site not to sell or share your data — a legally-binding request."
              : "Turn Global Privacy Control on in Settings to send the do-not-sell signal."}</div>
          </div>
        </div>

        <div class="pg-head">
          <div class="pg-head-title">Get off the data brokers</div>
          <div class="pg-progress">${doneCount}/${BROKERS.length}</div>
        </div>
        <p class="pg-intro">These brokers sell your info to the spammers. Sula points you at each real opt-out page and tracks what you've done — we can't submit removals for you, but this is the list that matters, in order.</p>

        <div class="pg-list">${rows}</div>

        <p class="pg-fine">Brokers re-list you every few months, so Sula reminds you to re-check six months after each opt-out. Links current as of Aug 2026.</p>
      </div>`;

    // Wire the checkboxes: toggle done, persist, re-render.
    contentEl.querySelectorAll(".pg-check").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.broker;
        const s = (await lcGet(STORE_KEY)) || {};
        if (s[id] && s[id].done) delete s[id];
        else s[id] = { done: Date.now() };
        await lcSet({ [STORE_KEY]: s });
        render(contentEl, _ctx);
      });
    });
  }

  window.SulaPrivacyGuardUI = { render };
})();
