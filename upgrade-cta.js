// Sula — Day-7 upgrade CTA.
//
// After a week of use, a one-time in-popup card makes the case for Pro: the
// value people leave on the table (time saved + refunds), and the fact that
// Sula takes no commission where Rocket Money keeps 30-40%. Shows once, then
// never again.
//
// GUARDRAILS (this must NEVER show to someone who already pays):
//   1. isPro() -> skip. This is the important one, and it covers BOTH paying
//      AND grandfathered users -- license.js's isPro() returns true for early
//      supporters (sula_early_supporter) as well as active license holders.
//   2. Onboarding not finished -> skip. New users get the walkthrough first;
//      we don't stack an upgrade ask on top of a first run.
//   3. Less than 7 days since install -> skip.
//   4. Already shown or dismissed -> skip.
// Only when every gate passes does it render. Dismissing or clicking through
// sets the shown flag, so it fires at most once.
//
// Depends on license.js (loaded before this in popup.html) for isPro().
// Exposes window.SulaUpgradeCta.maybeShow() for popup.js to call after init.

(() => {
  "use strict";

  const SHOWN_KEY = "sula_upgrade_cta_shown";
  const INSTALL_KEY = "sula_installed_at";
  const ONBOARDED_KEY = "sula_onboarded";
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  // The default checkout the CTA button opens (matches license.js).
  const CHECKOUT_URL =
    "https://sula.lemonsqueezy.com/checkout/buy/47598c36-6163-4f4e-93de-9266450ebfaa";

  function get(keys) {
    return new Promise((resolve) => {
      try { chrome.storage.local.get(keys, (r) => resolve(r || {})); }
      catch (_e) { resolve({}); }
    });
  }
  function markShown() {
    try { chrome.storage.local.set({ [SHOWN_KEY]: true }); } catch (_e) { /* non-fatal */ }
  }

  function injectStyles() {
    if (document.getElementById("sula-cta-styles")) return;
    const css = `
      #sula-cta { position: fixed; inset: 0; z-index: 9998;
        background: rgba(6,8,12,0.88); display: flex; align-items: center;
        justify-content: center; padding: 16px; }
      #sula-cta .cta-card { background: #111113; border: 1px solid #262629;
        border-radius: 14px; width: 100%; max-width: 328px; padding: 22px 20px 18px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        animation: cta-in 0.34s cubic-bezier(0.22,0.68,0,1); }
      @keyframes cta-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) { #sula-cta .cta-card { animation: none; } }
      #sula-cta .cta-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 1.5px;
        text-transform: uppercase; color: #35ce8d; margin-bottom: 10px; }
      #sula-cta .cta-value { font-size: 30px; font-weight: 800; color: #e7b75a;
        line-height: 1; margin-bottom: 4px; }
      #sula-cta .cta-value .yr { font-size: 13px; color: #71717a; font-weight: 600; }
      #sula-cta .cta-title { font-size: 15px; font-weight: 700; color: #fafafa;
        margin-bottom: 8px; line-height: 1.3; }
      #sula-cta .cta-body { font-size: 12.5px; line-height: 1.55; color: #a1a1aa; }
      #sula-cta .cta-contrast { margin: 14px 0; padding: 10px 12px; border-radius: 8px;
        background: rgba(53,206,141,0.08); border: 1px solid rgba(53,206,141,0.2);
        font-size: 12px; color: #cbd5e1; line-height: 1.5; }
      #sula-cta .cta-contrast b { color: #57e5a8; }
      #sula-cta .cta-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
      #sula-cta .cta-go { background: #4c8dff; color: #05101f; border: none;
        border-radius: 9px; font-size: 14px; font-weight: 700; padding: 11px;
        cursor: pointer; font-family: inherit; transition: background 0.15s, transform 0.15s; }
      #sula-cta .cta-go:hover { background: #6ba3ff; transform: translateY(-1px); }
      #sula-cta .cta-later { background: none; border: none; color: #71717a;
        font-size: 12px; cursor: pointer; font-family: inherit; padding: 4px; }
      #sula-cta .cta-later:hover { color: #a1a1aa; }
      #sula-cta .cta-fine { margin-top: 10px; font-size: 10px; color: #52525b; line-height: 1.4; }
      #sula-cta button:focus-visible { outline: 2px solid #6ba3ff; outline-offset: 2px; }
    `;
    const s = document.createElement("style");
    s.id = "sula-cta-styles";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function show() {
    injectStyles();
    const overlay = document.createElement("div");
    overlay.id = "sula-cta";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Upgrade to Sula Pro");
    overlay.innerHTML = `
      <div class="cta-card">
        <div class="cta-eyebrow">You've used Sula for a week</div>
        <div class="cta-value">~$2,200<span class="yr"> /yr</span></div>
        <div class="cta-title">That's what Sula Pro is worth to a typical user.</div>
        <div class="cta-body">About 50 hours a year you'd spend fighting customer service, valued at the US average wage, plus the refunds early users won back.</div>
        <div class="cta-contrast">Rocket Money keeps <b>30&ndash;40%</b> of every refund. Sula keeps <b>$0</b> &mdash; you keep all of it.</div>
        <div class="cta-actions">
          <button class="cta-go" id="cta-go" type="button">See the value &amp; get Pro &mdash; $6/mo</button>
          <button class="cta-later" id="cta-later" type="button">Maybe later</button>
        </div>
        <div class="cta-fine">Estimate from our user testing; individual results vary. Cancel anytime.</div>
      </div>`;
    document.body.appendChild(overlay);

    const go = overlay.querySelector("#cta-go");
    const later = overlay.querySelector("#cta-later");

    function close() { markShown(); overlay.remove(); }

    go.addEventListener("click", () => {
      markShown();
      if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url: CHECKOUT_URL });
      else window.open(CHECKOUT_URL, "_blank", "noopener");
      overlay.remove();
    });
    later.addEventListener("click", close);
    overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } });
    go.focus();
  }

  async function maybeShow() {
    // Gate 1 — already a paying OR grandfathered user. isPro() covers both.
    // This is the guardrail that must never let the CTA reach a Pro user.
    try {
      if (typeof isPro === "function" && (await isPro())) return;
    } catch (_e) {
      // If we genuinely can't tell, fail safe: do NOT show. Better to miss a
      // conversion than to nag someone who might already be paying.
      return;
    }

    const st = await get([SHOWN_KEY, INSTALL_KEY, ONBOARDED_KEY]);

    // Gate 2 — onboarding must be done first.
    if (!st[ONBOARDED_KEY]) return;
    // Gate 3 — at least 7 days since install. If we never recorded an install
    // time (e.g. upgraded from a build before this shipped), backfill it now so
    // the clock starts, and don't show this session.
    if (!st[INSTALL_KEY]) {
      try { chrome.storage.local.set({ [INSTALL_KEY]: Date.now() }); } catch (_e) {}
      return;
    }
    if (Date.now() - st[INSTALL_KEY] < SEVEN_DAYS_MS) return;
    // Gate 4 — only once, ever.
    if (st[SHOWN_KEY]) return;

    show();
  }

  window.SulaUpgradeCta = { maybeShow };
})();
