// Sula — on-page autofill button.
//
// The Autofill tab lives in the popup and the side panel, which both cost the
// user a trip to the toolbar. On a page that has no contacts to show, the side
// panel does not mount at all, so a job application is exactly the page where
// Sula is least reachable and most useful.
//
// This puts a small floating button on such a page: no contacts found, a saved
// autofill profile exists, and the page has real fillable fields. Click it and
// the fields fill in place. Nothing is auto-submitted, and nothing appears
// until the user has actually saved a profile.
//
// window.SulaAutofillButton

(() => {
  "use strict";

  const HOST_ID = "sula-autofill-fab";
  const PROFILE_KEY = "sula_autofill_profile";
  const DISMISS_PREFIX = "sula_af_fab_dismissed_";
  const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  // Enough recognized fields that this is plausibly a real form rather than a
  // stray search box or a single newsletter input.
  const MIN_FIELDS = 3;

  function lcGet(keys) {
    return new Promise((resolve) => {
      try {
        if (!chrome.storage || !chrome.storage.local) return resolve({});
        chrome.storage.local.get(keys, (r) => resolve(r || {}));
      } catch (_) { resolve({}); }
    });
  }

  function lcSet(obj) {
    try { chrome.storage.local.set(obj); } catch (_) {}
  }

  function dismissKey() {
    let host = "";
    try { host = location.hostname || ""; } catch (_) {}
    return DISMISS_PREFIX + host;
  }

  // Pure: is this page a candidate? Split out so it can be tested without a DOM.
  function shouldOffer(state) {
    const s = state || {};
    if (!s.profileSet) return false;      // nothing to fill with
    if (s.hasContacts) return false;      // side panel already covers this page
    if (s.dismissed) return false;        // user said no on this site
    if ((s.fieldCount || 0) < MIN_FIELDS) return false;
    return true;
  }

  function countFields() {
    try {
      if (window.SulaAutofill && typeof window.SulaAutofill.scanFields === "function") {
        return window.SulaAutofill.scanFields().length;
      }
    } catch (_) {}
    return 0;
  }

  function hasContactsOnPage() {
    // content.js owns contact scanning and exposes its results when it runs.
    // Absent that (e.g. this frame only), assume no contacts so the button can
    // still appear on an iframe-hosted application form.
    try {
      const r = window.__sulaResults;
      if (!r) return false;
      return ((r.emails || []).length + (r.phones || []).length) > 0;
    } catch (_) { return false; }
  }

  function removeButton() {
    const el = document.getElementById(HOST_ID);
    if (el) el.remove();
  }

  const ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
    'stroke-linecap="round" stroke-linejoin="round" width="18" height="18">' +
    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h6"/>' +
    '<path d="M9 12h6"/><path d="m9 16 1.5 1.5L14 14"/></svg>';

  function render(fieldCount) {
    if (document.getElementById(HOST_ID)) return;

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText =
      "position:fixed;z-index:2147483646;right:18px;bottom:18px;";
    const root = host.attachShadow({ mode: "open" });

    root.innerHTML =
      "<style>" +
      ".w{font:13px/1.4 -apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;gap:8px}" +
      ".b{display:inline-flex;align-items:center;gap:8px;background:#60a5fa;color:#071022;" +
      "border:0;border-radius:999px;padding:10px 15px;font:inherit;font-weight:700;cursor:pointer;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.35)}" +
      ".b:hover{background:#93c5fd}" +
      ".b[disabled]{opacity:.7;cursor:default}" +
      ".x{background:#111827;color:#9ca3af;border:1px solid #374151;border-radius:999px;" +
      "width:24px;height:24px;font:inherit;line-height:1;cursor:pointer;padding:0}" +
      ".x:hover{color:#f9fafb}" +
      ".m{background:#111827;color:#f9fafb;border:1px solid #374151;border-radius:10px;" +
      "padding:8px 11px;max-width:230px;box-shadow:0 8px 24px rgba(0,0,0,.35)}" +
      "</style>" +
      '<div class="w">' +
      '<button class="x" title="Not on this site" aria-label="Dismiss">&times;</button>' +
      '<button class="b" type="button">' + ICON +
      "<span>Fill " + fieldCount + " field" + (fieldCount === 1 ? "" : "s") + "</span></button>" +
      "</div>";

    const fillBtn = root.querySelector(".b");
    const label = fillBtn.querySelector("span");

    fillBtn.addEventListener("click", async () => {
      fillBtn.setAttribute("disabled", "");
      label.textContent = "Filling…";
      const store = await lcGet([PROFILE_KEY]);
      const profile = store[PROFILE_KEY] || {};
      let res = null;
      try {
        res = window.SulaAutofill.autofill(profile);
      } catch (_) { res = null; }

      const wrap = root.querySelector(".w");
      if (res && typeof res.filled === "number" && res.filled > 0) {
        wrap.innerHTML =
          '<div class="m">Filled ' + res.filled + " of " + res.detected +
          " field" + (res.detected === 1 ? "" : "s") +
          ". Review the highlighted fields before submitting.</div>";
      } else {
        wrap.innerHTML =
          '<div class="m">Nothing matched your saved details on this page.</div>';
      }
      setTimeout(() => { if (host.isConnected) host.remove(); }, 6000);
    });

    root.querySelector(".x").addEventListener("click", () => {
      lcSet({ [dismissKey()]: Date.now() });
      host.remove();
    });

    (document.body || document.documentElement).appendChild(host);
  }

  async function maybeShow() {
    if (typeof document === "undefined") return;
    if (window.top !== window.self) return;   // top frame only; one button per page
    removeButton();

    const store = await lcGet([PROFILE_KEY, dismissKey()]);
    const profile = store[PROFILE_KEY] || {};
    const dismissedAt = store[dismissKey()] || 0;

    const state = {
      profileSet: Object.keys(profile).length > 0,
      hasContacts: hasContactsOnPage(),
      dismissed: dismissedAt > 0 && (Date.now() - dismissedAt) < DISMISS_TTL_MS,
      fieldCount: countFields(),
    };

    if (!shouldOffer(state)) return;
    render(state.fieldCount);
  }

  // Application forms are usually client-rendered, so the fields often are not
  // in the DOM at document_idle. Re-check a few times, then stop.
  function schedule() {
    let tries = 0;
    const tick = () => {
      tries++;
      maybeShow();
      if (tries < 4) setTimeout(tick, 1800);
    };
    setTimeout(tick, 1500);
  }

  if (typeof document !== "undefined") schedule();

  const api = { shouldOffer, countFields, maybeShow, MIN_FIELDS };
  if (typeof window !== "undefined") window.SulaAutofillButton = api;
})();
