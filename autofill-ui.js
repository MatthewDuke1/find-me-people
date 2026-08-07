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

    // Applicant-tracking systems (iCIMS, Workday, Greenhouse/Lever embeds) put
    // the real form inside an iframe, often cross-origin. A plain
    // tabs.sendMessage only reaches the TOP frame, so it would report 0 fields
    // on exactly the pages that matter. Fan the message out to every frame and
    // sum the replies; frames without the script simply reject and are ignored.
    // Uses chrome.scripting with allFrames (the "scripting" permission we
    // already hold — no new permission, so no extra store-review surface).
    // Each frame runs the call against its own window.SulaAutofill and returns
    // its own tally; frames where the script didn't load return null.
    async function runInAllFrames(fnName, arg) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          args: [fnName, arg === undefined ? null : arg],
          func: (name, payload) => {
            try {
              const api = window.SulaAutofill;
              if (!api || typeof api[name] !== "function") return null;
              return name === "autofill"
                ? api.autofill(payload)
                : { keys: api.preview() };
            } catch (_) { return null; }
          },
        });
        return (results || []).map((r) => r && r.result).filter(Boolean);
      } catch (_) {
        return [];
      }
    }

    contentEl.querySelector("#af-fill").addEventListener("click", async () => {
      const box = contentEl.querySelector("#af-result"); box.hidden = false; box.textContent = "Filling…";
      await lcSet({ [PROFILE_KEY]: collect() }); // fill with the latest edits, saved or not
      try {
        const parts = await runInAllFrames("autofill", collect());
        if (!parts.length) {
          box.textContent = "Couldn't reach this page — open Autofill while on the form (some pages block extensions).";
          return;
        }
        const filled = parts.reduce((n, r) => n + (r.filled || 0), 0);
        const detected = parts.reduce((n, r) => n + (r.detected || 0), 0);
        box.textContent = detected === 0
          ? "No fillable fields recognized on this page."
          : `Filled ${filled} of ${detected} recognized field${detected === 1 ? "" : "s"}. Review the highlighted fields before submitting.`;
      } catch (_) { box.textContent = "Couldn't reach this page — open Autofill while on the form (some pages block extensions)."; }
    });

    contentEl.querySelector("#af-preview").addEventListener("click", async () => {
      const box = contentEl.querySelector("#af-result"); box.hidden = false; box.textContent = "Scanning…";
      try {
        const parts = await runInAllFrames("preview");
        const keys = parts.flatMap((r) => r.keys || []);
        box.textContent = keys.length
          ? `Recognized ${keys.length} field${keys.length === 1 ? "" : "s"}: ${[...new Set(keys)].join(", ")}`
          : "No fillable fields recognized on this page.";
      } catch (_) { box.textContent = "Couldn't scan this page."; }
    });
  }

  window.SulaAutofillUI = { render };
})();
