// Sula — Advocacy tab UI. The user-facing layer that finally wires the refund
// pipeline into a usable flow. Consumes the pure-logic modules loaded in the
// popup context (deadlines, templates, chargeback, escalation, advocacy
// letters, subscription guardian) directly, and messages the content script
// for the on-page policy read.
//
// Freemium split: the deadline calculator and policy read are FREE (the hook
// that proves value); generating letters and escalation drafts are Pro
// (gateProFeature). Sula drafts — the user sends. window.SulaAdvocacyUI.

(() => {
  "use strict";

  const SUBS_KEY = "sula_subscriptions";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function lcGet(k) { return new Promise((r) => chrome.storage.local.get([k], (o) => r(o[k] ?? null))); }
  function lcSet(o) { return new Promise((r) => chrome.storage.local.set(o, r)); }

  // Pro gate — reuse popup.js's global if present; else soft-allow (matches
  // soft-launch). Returns true if the action may proceed.
  async function gate(label) {
    if (typeof gateProFeature === "function") return await gateProFeature(label);
    return true;
  }

  const urgencyColor = (u) => ({ expired: "#52525b", urgent: "#f87171", soon: "#fbbf24", ok: "#4ade80" }[u] || "#a1a1aa");

  async function render(contentEl, ctx) {
    const tab = ctx && ctx.tab;
    const host = (ctx && ctx.pageHost) || "";
    const D = window.SulaRefundDeadlines, T = window.SulaRefundTemplates,
          C = window.SulaChargebackGuide, E = window.SulaEscalationRegistry,
          A = window.SulaAdvocacyLetters;

    contentEl.innerHTML = `
      <div class="adv-wrap">
        <div class="section">
          <div class="section-title">Refund Assistant</div>
          <div class="adv-hint">Enter the charge, see your deadlines, draft the request. Sula drafts — you send.</div>
          <div class="adv-grid">
            <input class="adv-in" id="adv-company" placeholder="Company" value="${esc(host.replace(/^www\./, ""))}">
            <input class="adv-in" id="adv-amount" placeholder="Amount (e.g. $40)">
            <input class="adv-in" id="adv-order" placeholder="Order # (optional)">
            <input class="adv-in" id="adv-date" placeholder="Charge date (YYYY-MM-DD)">
          </div>
          <div class="adv-row">
            <label class="adv-lbl">Paid with</label>
            <select class="adv-in adv-sel" id="adv-pay"><option value="credit">Credit card</option><option value="debit">Debit card</option><option value="other">Other</option></select>
            <button class="action-chip" id="adv-readpolicy">Read this site's policy</button>
          </div>
          <div id="adv-policy" class="adv-note" hidden></div>
          <div id="adv-deadlines"></div>
        </div>

        <div class="section">
          <div class="section-title">Draft your request <span class="pro-tag">PRO</span></div>
          <div class="adv-row">
            <select class="adv-in adv-sel" id="adv-scenario"></select>
            <button class="action-chip outreach-chip" id="adv-gen">Generate letter</button>
          </div>
          <textarea class="adv-letter" id="adv-out" placeholder="Your drafted letter appears here — edit before sending." rows="8" hidden></textarea>
          <div class="adv-row" id="adv-letter-actions" hidden>
            <button class="action-chip" id="adv-copy">Copy</button>
            <button class="action-chip" id="adv-email">Open in email</button>
          </div>
        </div>

        <div class="section">
          <div class="section-title">If they ignore you: escalate <span class="pro-tag">PRO</span></div>
          <div class="adv-row">
            <button class="action-chip" id="adv-chargeback">Is a chargeback appropriate?</button>
          </div>
          <div id="adv-cb" class="adv-note" hidden></div>
          <div class="adv-row">
            <select class="adv-in adv-sel" id="adv-cat"></select>
            <button class="action-chip outreach-chip" id="adv-file">Route + draft complaint</button>
          </div>
          <div id="adv-esc" class="adv-note" hidden></div>
        </div>

        <div class="section">
          <div class="section-title">Subscription Guardian</div>
          <div class="adv-grid">
            <input class="adv-in" id="sub-company" placeholder="Service">
            <input class="adv-in" id="sub-amount" placeholder="Amount">
            <select class="adv-in adv-sel" id="sub-cadence"><option value="monthly">Monthly</option><option value="annual">Annual</option><option value="quarterly">Quarterly</option><option value="weekly">Weekly</option></select>
            <input class="adv-in" id="sub-start" placeholder="Started (YYYY-MM-DD)">
          </div>
          <div class="adv-row"><button class="action-chip" id="sub-add">Track subscription</button><span id="sub-msg" class="adv-hint" style="margin:0" role="alert" aria-live="polite"></span></div>
          <div id="sub-list"></div>
        </div>
      </div>`;

    // Populate selectors from the modules.
    const scenSel = contentEl.querySelector("#adv-scenario");
    (T ? T.listScenarios() : []).forEach((s) => { const o = document.createElement("option"); o.value = s.id; o.textContent = s.label; scenSel.appendChild(o); });
    const catSel = contentEl.querySelector("#adv-cat");
    (E ? E.listCategories() : []).forEach((c) => { const o = document.createElement("option"); o.value = c.id; o.textContent = c.label; catSel.appendChild(o); });

    const facts = () => ({
      company: contentEl.querySelector("#adv-company").value.trim(),
      amount: contentEl.querySelector("#adv-amount").value.trim(),
      orderId: contentEl.querySelector("#adv-order").value.trim(),
      date: contentEl.querySelector("#adv-date").value.trim(),
    });

    let policyOverrideDays = null;

    function refreshDeadlines() {
      const el = contentEl.querySelector("#adv-deadlines");
      const date = contentEl.querySelector("#adv-date").value.trim();
      const pay = contentEl.querySelector("#adv-pay").value;
      if (!date || !D) { el.innerHTML = ""; return; }
      const r = D.computeDeadlines(date, { paymentType: pay, overrides: policyOverrideDays ? { merchant_return: policyOverrideDays } : {} });
      if (!r.ok) { el.innerHTML = `<div class="adv-note">Enter the charge date as YYYY-MM-DD to see your deadlines.</div>`; return; }
      el.innerHTML = r.remedies.map((m) =>
        `<div class="adv-dl" style="border-left:3px solid ${urgencyColor(m.urgency)}">
           <div class="adv-dl-top"><strong>${esc(m.label)}</strong><span>${m.expired ? "expired" : m.daysLeft + " days left"}</span></div>
           <div class="adv-dl-sub">by ${esc(m.deadline)} · ${esc(m.note)}</div>
         </div>`).join("");
    }

    // --- events (delegated where it helps) ---
    ["#adv-date", "#adv-pay"].forEach((sel) => contentEl.querySelector(sel).addEventListener("input", refreshDeadlines));
    contentEl.querySelector("#adv-pay").addEventListener("change", refreshDeadlines);

    contentEl.querySelector("#adv-readpolicy").addEventListener("click", async () => {
      const box = contentEl.querySelector("#adv-policy");
      box.hidden = false; box.textContent = "Reading the page…";
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { action: "sula:getPolicy" });
        const best = res && res.policies && res.policies.find((p) => p.summary);
        if (best && best.summary) {
          box.textContent = best.summary.summary;
          if (best.summary.windowDays) { policyOverrideDays = best.summary.windowDays; refreshDeadlines(); }
        } else box.textContent = "No refund policy found on this page — check the site's footer, or ask the merchant.";
      } catch (_) { box.textContent = "Couldn't read this page (open the Advocacy tab while on the merchant's site)."; }
    });

    contentEl.querySelector("#adv-gen").addEventListener("click", async () => {
      if (!(await gate("Refund letter"))) return;
      const l = T.buildLetter(scenSel.value, facts());
      if (!l) return;
      const out = contentEl.querySelector("#adv-out");
      out.value = l.subject + "\n\n" + l.body; out.hidden = false;
      contentEl.querySelector("#adv-letter-actions").hidden = false;
    });
    contentEl.querySelector("#adv-copy").addEventListener("click", () => {
      navigator.clipboard.writeText(contentEl.querySelector("#adv-out").value).catch(() => {});
    });
    contentEl.querySelector("#adv-email").addEventListener("click", () => {
      const v = contentEl.querySelector("#adv-out").value; const nl = v.indexOf("\n");
      const subj = nl > 0 ? v.slice(0, nl) : "Refund request"; const body = v.slice(nl + 1).trim();
      window.open(`mailto:?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`, "_blank");
    });

    contentEl.querySelector("#adv-chargeback").addEventListener("click", () => {
      const box = contentEl.querySelector("#adv-cb"); box.hidden = false;
      const r = C.assessReadiness({ contactedMerchant: true, merchantIgnoredDays: 7 });
      const steps = C.issuerSteps("generic");
      box.innerHTML = `<strong>${esc(r.recommendation)}</strong><ul>${steps.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;
    });

    contentEl.querySelector("#adv-file").addEventListener("click", async () => {
      if (!(await gate("Escalation"))) return;
      const entry = E.getCategoryEntry(catSel.value);
      const box = contentEl.querySelector("#adv-esc"); box.hidden = false;
      const letter = A ? A.buildLetter("regulatory", { company: facts().company, desired: "a full refund", priorAttempts: "I contacted the company and it was not resolved." }) : null;
      box.innerHTML = `<strong>${esc(entry.agency)}</strong> — <a href="${esc(entry.url)}" target="_blank" rel="noopener">File here</a>
        <div class="adv-dl-sub">${esc(entry.filingTips || "")}</div>` +
        (letter ? `<textarea class="adv-letter" rows="6">${esc(letter.subject + "\n\n" + letter.body)}</textarea>` : "");
    });

    // --- Subscription Guardian ---
    const G = window.SulaSubscriptionGuardian;
    async function renderSubs() {
      const list = (await lcGet(SUBS_KEY)) || [];
      const el = contentEl.querySelector("#sub-list");
      if (!list.length) { el.innerHTML = `<div class="adv-note">No subscriptions tracked yet.</div>`; return; }
      const now = Date.now();
      el.innerHTML = list.map((s, i) => {
        let days = null; try { days = G.daysUntilRenewal(s, now); } catch (_) {}
        return `<div class="adv-dl"><div class="adv-dl-top"><strong>${esc(s.company)}</strong><span>${days == null ? "" : "renews in " + days + "d"}</span></div>
          <div class="adv-dl-sub">${esc(s.amount || "")} · ${esc(s.cadence)} <button class="adv-del" data-del="${i}" data-name="${esc(s.company)}">remove</button></div></div>`;
      }).join("");
      el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
        // Confirm before deleting — a tracked subscription is easy to lose by a
        // stray click, and there's no undo. window.confirm is fine in a popup.
        const name = b.getAttribute("data-name") || "this subscription";
        if (!window.confirm(`Remove ${name} from tracking?`)) return;
        const arr = (await lcGet(SUBS_KEY)) || []; arr.splice(+b.dataset.del, 1); await lcSet({ [SUBS_KEY]: arr }); renderSubs();
      }));
    }

    // Inline validation feedback for the add form. Clears itself so the message
    // doesn't linger past the next successful action.
    const subMsg = contentEl.querySelector("#sub-msg");
    let subMsgTimer = null;
    function showSubMsg(text, ok) {
      if (!subMsg) return;
      subMsg.textContent = text;
      subMsg.style.color = ok ? "" : "#c0392b";
      if (subMsgTimer) clearTimeout(subMsgTimer);
      if (ok) subMsgTimer = setTimeout(() => { subMsg.textContent = ""; }, 1800);
    }

    contentEl.querySelector("#sub-add").addEventListener("click", async () => {
      const company = contentEl.querySelector("#sub-company").value.trim();
      const amountRaw = contentEl.querySelector("#sub-amount").value.trim();
      const startStr = contentEl.querySelector("#sub-start").value.trim();

      // --- Field validation with a visible message (was: silent no-op) ---
      if (!company) return showSubMsg("Enter a service name.", false);
      // Amount is optional, but if given it must read as money. Accept things
      // like "$9.99", "9.99", "12" — reject letters/garbage.
      if (amountRaw && !/^\$?\d{1,7}(\.\d{1,2})?$/.test(amountRaw))
        return showSubMsg("Amount must be a number, e.g. 9.99.", false);
      // Date is optional (defaults to today), but a typed date must be valid.
      let startMs = Date.now();
      if (startStr) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || isNaN(Date.parse(startStr)))
          return showSubMsg("Date must be YYYY-MM-DD.", false);
        startMs = Date.parse(startStr);
      }

      const norm = G.normalizeSubscription({
        company,
        amount: amountRaw,
        cadence: contentEl.querySelector("#sub-cadence").value,
        startMs,
      });
      if (!norm.ok) return showSubMsg("Couldn't save that subscription — check the fields.", false);

      const arr = (await lcGet(SUBS_KEY)) || [];
      // --- Duplicate guard (#12): match on service name, case-insensitive ---
      const key = norm.sub.company.trim().toLowerCase();
      if (arr.some((s) => (s.company || "").trim().toLowerCase() === key))
        return showSubMsg(`${norm.sub.company} is already tracked.`, false);

      arr.unshift(norm.sub); await lcSet({ [SUBS_KEY]: arr.slice(0, 100) });
      // Clear the inputs so a second add doesn't accidentally re-submit the same
      // values, and confirm success.
      contentEl.querySelector("#sub-company").value = "";
      contentEl.querySelector("#sub-amount").value = "";
      contentEl.querySelector("#sub-start").value = "";
      showSubMsg("Tracking ✓", true);
      renderSubs();
    });

    refreshDeadlines();
    renderSubs();
  }

  window.SulaAdvocacyUI = { render };
})();
