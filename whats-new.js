// Sula — "What's new" panel. A small, dismissible card that appears once after
// the extension updates, showing that release's notes. A light re-engagement
// nudge: it reminds people what changed so an update is a reason to open Sula
// again, not a silent background event.
//
// How it fires:
//   1. background.js sets `sula_whatsnew_pending = <version>` on an update
//      (never on a fresh install — new users get onboarding instead).
//   2. popup.js calls window.SulaWhatsNew.maybeShow() after init.
//   3. If the pending version has notes here AND hasn't been seen, we show the
//      card and write `sula_whatsnew_seen = <version>`, so it appears at most
//      once per release.
//
// Adding a release: prepend an entry to NOTES.
//
// Notes show ONLY for the version a user updates TO. Someone jumping from
// 2.6.5 to 2.6.7 never sees a 2.6.6 entry, so each release's notes must cover
// everything since the last version most users actually had -- not just the
// delta from the previous build number.
//
// An entry may carry:
//   feature  { title, body }  one prominent callout, rendered above the list.
//                             Use it for the release's headline feature.
//   items    string[]         the rest, plainly.
//   cta      { label, view }  a primary button that dismisses the card and
//                             opens that popup tab, so the headline feature is
//                             one click away instead of merely described.

(() => {
  "use strict";

  const PENDING_KEY = "sula_whatsnew_pending";
  const SEEN_KEY = "sula_whatsnew_seen";

  // version -> { headline, feature?, items[], cta? }. Newest first. See the
  // header for what each field does and what a release entry must cover.
  const NOTES = {
    "2.6.8": {
      headline: "Your purchases, remembered",
      feature: {
        title: "Sula now keeps a ledger of what you buy",
        body: "When you land on an order confirmation or billing page, Sula notes the merchant, the amount and the order number. With Pro, it warns you before a subscription renews and fills in your refund form from what it saw.",
      },
      items: [
        "Fixed: Sula\u2019s introduction no longer reopens on every page, and the welcome tour no longer restarts each time you open Sula.",
        "Renewal alerts (Pro): a number on the Sula icon, and a banner here naming what renews, when a subscription is due in the next 5 days.",
        "Refund form filled in (Pro): on a site where you bought something, the date, amount and order number are already there, so your deadlines appear straight away.",
        "Sula remembers purchases for everyone. Free shows how many it has remembered; Pro shows every one.",
        "Stored only on this device and never uploaded. Turn it off with \u201cRemember my purchases\u201d at the bottom of this popup, and delete everything from the Subs tab \u2014 free or Pro.",
        "Card numbers are never recorded, and nothing is captured in a private window.",
        "Bank statement imports (Pro) now recognise 335 subscription brands \u2014 \u201cSpotify\u201d, not \u201cPAYPAL\u201d.",
        "A subscription whose bank description changes each month is no longer split up and missed.",
        "The old \u201cFind Me People is now Sula\u201d banner is gone.",
      ],
      cta: { label: "See your purchase ledger", view: "subs" },
    },
    "2.6.7": {
      headline: "Your purchases, remembered",
      feature: {
        title: "Sula now keeps a ledger of what you buy",
        body: "When you land on an order confirmation or billing page, Sula notes the merchant, the amount and the order number. With Pro, it warns you before a subscription renews and fills in your refund form from what it saw.",
      },
      items: [
        "Renewal alerts (Pro): a number on the Sula icon, and a banner here naming what renews, when a subscription is due in the next 5 days.",
        "Refund form filled in (Pro): on a site where you bought something, the date, amount and order number are already there, so your deadlines appear straight away.",
        "Sula remembers purchases for everyone. Free shows how many it has remembered; Pro shows every one.",
        "Stored only on this device and never uploaded. Turn it off with \u201cRemember my purchases\u201d at the bottom of this popup, and delete everything from the Subs tab \u2014 free or Pro.",
        "Card numbers are never recorded, and nothing is captured in a private window.",
        "Bank statement imports (Pro) now recognise 335 subscription brands \u2014 \u201cSpotify\u201d, not \u201cPAYPAL\u201d.",
        "A subscription whose bank description changes each month is no longer split up and missed.",
        "The old \u201cFind Me People is now Sula\u201d banner is gone.",
      ],
      cta: { label: "See your purchase ledger", view: "subs" },
    },
    "2.6.5": {
      headline: "Accuracy fixes from a 20-tester QA round",
      items: [
        "Order and invoice numbers are no longer mistaken for phone numbers.",
        "Contacts found elsewhere on a site are labelled as such, not as being on the page you're viewing.",
        "Refund letters use only the details you enter — no invented dates, and your order number is included.",
        "Resume matching understands word endings, so \"automation\" now covers \"automated\".",
        "Bank imports accept plain Date/Description/Amount CSVs.",
      ],
    },
    "2.6.4": {
      headline: "New: Checkout Guard",
      items: [
        "At checkout, Sula reads the fine print before you pay — the return window, restocking or final-sale catches, and whether it auto-renews.",
        "A quiet heads-up, right when it matters. Nothing leaves your browser.",
      ],
    },
    "2.6.3": {
      headline: "Refund letters are now free",
      items: [
        "Draft a refund-request letter without Pro — read the policy, see your deadline, send.",
        "Cleaner Pro screen so you can see exactly what's included.",
        "Fixes from user testing: form validation, a search clear button, and more.",
      ],
    },
  };

  function lcGet(keys) {
    return new Promise((resolve) => {
      try { chrome.storage.local.get(keys, (r) => resolve(r || {})); }
      catch (_e) { resolve({}); }
    });
  }
  function lcSet(obj) {
    try { chrome.storage.local.set(obj); } catch (_e) { /* non-fatal */ }
  }

  function injectStyles() {
    if (document.getElementById("sula-wn-styles")) return;
    const css = `
      #sula-wn {
        position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 9998;
        background: #111113; border: 1px solid #262629; border-radius: 12px;
        box-shadow: 0 14px 40px rgba(0,0,0,0.5);
        animation: sula-wn-in 0.22s ease-out;
        max-height: calc(100vh - 24px); overflow-y: auto;
      }
      @media (prefers-reduced-motion: reduce) { #sula-wn { animation: none; } }
      @keyframes sula-wn-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      #sula-wn .wn-top {
        display: flex; align-items: center; gap: 8px;
        padding: 12px 14px 8px;
      }
      #sula-wn .wn-badge {
        font-size: 9px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase;
        color: #60a5fa; background: rgba(96,165,250,0.15);
        padding: 2px 7px; border-radius: 6px;
      }
      #sula-wn .wn-ver { font-size: 11px; color: #71717a; font-variant-numeric: tabular-nums; }
      #sula-wn .wn-x {
        margin-left: auto; background: none; border: 0; color: #71717a;
        font-size: 18px; line-height: 1; cursor: pointer; padding: 0 4px;
      }
      #sula-wn .wn-x:hover { color: #fafafa; }
      #sula-wn .wn-head {
        font-size: 14px; font-weight: 700; color: #fafafa;
        padding: 0 14px 6px;
      }
      #sula-wn .wn-feature {
        margin: 2px 14px 10px; padding: 12px 14px;
        background: rgba(74,222,128,0.07);
        border: 1px solid rgba(74,222,128,0.28); border-radius: 10px;
      }
      #sula-wn .wn-feature-title {
        font-size: 15px; font-weight: 700; color: #fafafa; line-height: 1.3;
        margin-bottom: 6px;
      }
      #sula-wn .wn-feature-body { font-size: 13px; color: #d4d4d8; line-height: 1.5; }
      #sula-wn ul { list-style: none; margin: 0; padding: 0 14px 6px; }
      #sula-wn li {
        font-size: 12px; color: #a1a1aa; line-height: 1.45;
        padding: 3px 0 3px 16px; position: relative;
      }
      #sula-wn li::before {
        content: ""; position: absolute; left: 3px; top: 9px;
        width: 4px; height: 4px; border-radius: 50%; background: #4ade80;
      }
      #sula-wn .wn-foot { padding: 6px 14px 12px; }
      #sula-wn .wn-ok {
        width: 100%; background: #60a5fa; color: #071022; border: 0;
        font-family: inherit; font-size: 12px; font-weight: 700;
        padding: 8px; border-radius: 8px; cursor: pointer;
      }
      #sula-wn .wn-ok:hover { background: #93c5fd; }
      #sula-wn .wn-cta {
        width: 100%; background: #4ade80; color: #052e16; border: 0;
        font-family: inherit; font-size: 13px; font-weight: 700;
        padding: 10px; border-radius: 8px; cursor: pointer; margin-bottom: 6px;
      }
      #sula-wn .wn-cta:hover { background: #86efac; }
      #sula-wn .wn-cta + .wn-ok {
        background: transparent; color: #a1a1aa; border: 1px solid #262629;
      }
      #sula-wn .wn-cta + .wn-ok:hover { color: #fafafa; background: transparent; }
    `;
    const el = document.createElement("style");
    el.id = "sula-wn-styles";
    el.textContent = css;
    document.head.appendChild(el);
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function dismiss(version) {
    lcSet({ [SEEN_KEY]: version });
    // Clear the pending marker so it can't re-fire on the next popup open.
    try { chrome.storage.local.remove(PENDING_KEY); } catch (_e) {}
    const el = document.getElementById("sula-wn");
    if (el) el.remove();
  }

  function render(version, note) {
    injectStyles();
    if (document.getElementById("sula-wn")) return;
    const card = document.createElement("div");
    card.id = "sula-wn";
    card.setAttribute("role", "status");
    card.innerHTML =
      '<div class="wn-top">' +
        '<span class="wn-badge">What’s new</span>' +
        '<span class="wn-ver">v' + esc(version) + '</span>' +
        '<button class="wn-x" aria-label="Dismiss">×</button>' +
      '</div>' +
      '<div class="wn-head">' + esc(note.headline) + '</div>' +
      (note.feature
        ? '<div class="wn-feature">' +
            '<div class="wn-feature-title">' + esc(note.feature.title) + '</div>' +
            '<div class="wn-feature-body">' + esc(note.feature.body) + '</div>' +
          '</div>'
        : '') +
      '<ul>' + note.items.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>' +
      '<div class="wn-foot">' +
        (note.cta ? '<button class="wn-cta">' + esc(note.cta.label) + '</button>' : '') +
        '<button class="wn-ok">Got it</button>' +
      '</div>';
    document.body.appendChild(card);
    // Seen once it has been shown. It used to be recorded only by the card's
    // buttons, so closing the popup without clicking one showed it again on
    // every open. The buttons still just remove the card.
    lcSet({ [SEEN_KEY]: version });
    try { chrome.storage.local.remove(PENDING_KEY); } catch (_e) {}
    card.querySelector(".wn-x").addEventListener("click", () => dismiss(version));
    card.querySelector(".wn-ok").addEventListener("click", () => dismiss(version));
    const cta = card.querySelector(".wn-cta");
    if (cta && note.cta) {
      cta.addEventListener("click", () => {
        dismiss(version);
        // Open the tab by clicking its real button, so the popup's own
        // switching logic runs and there is one code path, not two.
        const tabBtn = document.querySelector('.view-tab[data-view="' + note.cta.view + '"]');
        if (tabBtn) tabBtn.click();
      });
    }
  }

  async function maybeShow() {
    const st = await lcGet([PENDING_KEY, SEEN_KEY]);
    const pending = st[PENDING_KEY];
    if (!pending) return;                  // no update happened
    if (st[SEEN_KEY] === pending) return;  // already shown for this version
    const note = NOTES[pending];
    if (!note) {                           // no notes authored for this version
      // Still clear the marker so we don't re-check forever.
      try { chrome.storage.local.remove(PENDING_KEY); } catch (_e) {}
      return;
    }
    render(pending, note);
  }

  window.SulaWhatsNew = { maybeShow };
})();
