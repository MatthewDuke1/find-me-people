// Sula — Autofill tab UI. Profile editor + one-click "Fill this page".
// Saves the profile locally (never leaves the browser), then messages the
// autofill.js content script to detect + fill the current page's fields.
// window.SulaAutofillUI.

(() => {
  "use strict";

  const PROFILE_KEY = "sula_autofill_profile";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // [key, label] in display order.
  const FIELDS = [
    ["firstName", "First name"], ["lastName", "Last name"],
    ["email", "Email"], ["phone", "Phone"],
    ["linkedin", "LinkedIn URL"], ["github", "GitHub"], ["website", "Website / portfolio"],
    ["addressLine1", "Street address"], ["city", "City"], ["state", "State"],
    ["zip", "Zip / postal"], ["country", "Country"],
    ["currentCompany", "Current company"], ["currentTitle", "Current title"],
    ["yearsExperience", "Years of experience"], ["location", "Location"],
  ];

  function lcGet(k) { return new Promise((r) => chrome.storage.local.get([k], (o) => r(o[k] ?? null))); }
  function lcSet(o) { return new Promise((r) => chrome.storage.local.set(o, r)); }

  async function render(contentEl, ctx) {
    const tab = ctx && ctx.tab;
    const profile = (await lcGet(PROFILE_KEY)) || {};

    contentEl.innerHTML = `
      <div class="af-wrap">
        <div class="section">
          <div class="section-title">Autofill</div>
          <div class="af-hint">Save your details once, then fill any application or contact form in one click. Stored locally — never leaves your browser. Review highlighted fields before submitting; Sula never auto-submits.</div>
          <div class="af-actions">
            <button class="action-chip outreach-chip" id="af-fill">Fill this page</button>
            <button class="action-chip" id="af-preview">Preview fields</button>
          </div>
          <div id="af-result" class="af-note" hidden></div>
        </div>
        <div class="section">
          <div class="section-title">Your details</div>
          <div class="af-grid">
            ${FIELDS.map(([k, label]) =>
              `<label class="af-field"><span>${esc(label)}</span>
                 <input class="af-in" data-k="${k}" value="${esc(profile[k] || "")}"></label>`).join("")}
          </div>
          <div class="af-actions"><button class="action-chip" id="af-save">Save details</button><span id="af-saved" class="af-hint" style="margin:0"></span></div>
        </div>
      </div>`;

    const collect = () => {
      const p = {};
      contentEl.querySelectorAll(".af-in").forEach((i) => { const v = i.value.trim(); if (v) p[i.dataset.k] = v; });
      return p;
    };

    contentEl.querySelector("#af-save").addEventListener("click", async () => {
      await lcSet({ [PROFILE_KEY]: collect() });
      const s = contentEl.querySelector("#af-saved"); s.textContent = "Saved ✓";
      setTimeout(() => (s.textContent = ""), 1500);
    });

    contentEl.querySelector("#af-fill").addEventListener("click", async () => {
      const box = contentEl.querySelector("#af-result"); box.hidden = false; box.textContent = "Filling…";
      await lcSet({ [PROFILE_KEY]: collect() }); // fill with the latest edits, saved or not
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { action: "sula:autofill", profile: collect() });
        box.textContent = res && typeof res.filled === "number"
          ? `Filled ${res.filled} of ${res.detected} recognized field${res.detected === 1 ? "" : "s"}. Review the highlighted fields before submitting.`
          : "Couldn't reach this page — open Autofill while on the form.";
      } catch (_) { box.textContent = "Couldn't reach this page — open Autofill while on the form (some pages block extensions)."; }
    });

    contentEl.querySelector("#af-preview").addEventListener("click", async () => {
      const box = contentEl.querySelector("#af-result"); box.hidden = false; box.textContent = "Scanning…";
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { action: "sula:autofillPreview" });
        const keys = (res && res.keys) || [];
        box.textContent = keys.length
          ? `Recognized ${keys.length} field${keys.length === 1 ? "" : "s"}: ${[...new Set(keys)].join(", ")}`
          : "No fillable fields recognized on this page.";
      } catch (_) { box.textContent = "Couldn't scan this page."; }
    });
  }

  window.SulaAutofillUI = { render };
})();
