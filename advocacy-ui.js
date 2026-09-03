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

  // Pure: turn the user's answer into the shape chargeback-guide expects.
  // `answer` is "no" | "ignored" | "refused"; `days` is what they typed.
  // Nothing here may default to "contacted" — that assumption is QA SULA-009.
  function toContactState(answer, days) {
    const n = parseInt(days, 10);
    const since = isNaN(n) || n < 0 ? null : n;
    if (answer === "refused") {
      return { contactedMerchant: true, merchantRespondedNo: true,
               merchantIgnoredDays: since === null ? undefined : since };
    }
    if (answer === "ignored") {
      return { contactedMerchant: true, merchantRespondedNo: false,
               merchantIgnoredDays: since === null ? 0 : since };
    }
    return { contactedMerchant: false, merchantRespondedNo: false };
  }

  // Pure: the sentence a complaint may contain about prior contact. Returns ""
  // when the user has not contacted the merchant, so the draft simply omits
  // the claim instead of inventing one.
  function priorAttemptsSentence(state) {
    if (!state || !state.contactedMerchant) return "";
    if (state.merchantRespondedNo) {
      return "I contacted the company about this charge and they declined to resolve it.";
    }
    const d = state.merchantIgnoredDays;
    return typeof d === "number" && d > 0
      ? `I contacted the company about this charge ${d} day${d === 1 ? "" : "s"} ago and have not received a resolution.`
      : "I contacted the company about this charge and have not received a resolution.";
  }

  // Pure: which required facts is a refund letter missing? A letter without
  // the company, amount, or charge date is not merely incomplete — it is not
  // sendable, and generating one silently is QA SULA-006. Returns [] when the
  // minimum set is present. Order matters: the first entry gets focus.
  function missingLetterFields(f) {
    const out = [];
    const v = (x) => String((f && x) || "").trim();
    if (!v(f.company)) out.push({ id: "adv-company", label: "company" });
    if (!v(f.amount)) out.push({ id: "adv-amount", label: "amount" });
    if (!v(f.date)) out.push({ id: "adv-date", label: "charge date" });
    return out;
  }

  // Pure: "a", "a and b", "a, b and c" — used in the validation message.
  function listPhrase(items) {
    const a = (items || []).filter(Boolean);
    if (a.length <= 1) return a[0] || "";
    if (a.length === 2) return a[0] + " and " + a[1];
    return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  }

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
          <div class="section-title">Draft your request</div>
          <div class="adv-row">
            <select class="adv-in adv-sel" id="adv-scenario"></select>
            <button class="action-chip outreach-chip" id="adv-gen">Generate letter</button>
          </div>
          <div id="adv-msg" class="adv-err" role="alert" aria-live="assertive" hidden></div>
          <textarea class="adv-letter" id="adv-out" placeholder="Your drafted letter appears here — edit before sending." rows="8" hidden></textarea>
          <div class="adv-row" id="adv-letter-actions" hidden>
            <button class="action-chip" id="adv-copy">Copy</button>
            <button class="action-chip" id="adv-email">Open in email</button>
          </div>
        </div>

        <div class="section">
          <div class="section-title">If they ignore you: escalate <span class="pro-tag">PRO</span></div>
          <!-- Ask, never assume (QA SULA-009). These answers decide what the
               chargeback assessment and the complaint draft may assert. The
               previous build hardcoded "merchant contacted, ignored 7 days"
               and printed it as the user's own statement to a bank. -->
          <div class="adv-row">
            <label class="adv-lbl">Contacted the merchant?</label>
            <select class="adv-in adv-sel" id="adv-contacted">
              <option value="no">Not yet</option>
              <option value="ignored">Yes — no reply</option>
              <option value="refused">Yes — they refused</option>
            </select>
          </div>
          <div class="adv-row" id="adv-since-row" hidden>
            <label class="adv-lbl">Days since you contacted them</label>
            <input class="adv-in" id="adv-since" type="number" min="0" max="365" placeholder="e.g. 7">
          </div>
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

    // Reads the merchant-contact answers off the form (QA SULA-009).
    function merchantContactState() {
      const sel = contentEl.querySelector("#adv-contacted");
      const days = contentEl.querySelector("#adv-since");
      return toContactState(sel ? sel.value : "no", days ? days.value : "");
    }
    // The "days since" question only makes sense once contact happened.
    const contactedSel = contentEl.querySelector("#adv-contacted");
    if (contactedSel) {
      const syncSince = () => {
        const row = contentEl.querySelector("#adv-since-row");
        if (row) row.hidden = contactedSel.value === "no";
      };
      contactedSel.addEventListener("change", syncSince);
      syncSince();
    }

    let policyOverrideDays = null;

    // Validation messaging for the letter form. The message PERSISTS until the
    // user acts — an error that auto-clears after a second is the reason QA
    // reported "no validation message appeared" for the sibling Resume bug.
    function showAdvMsg(text) {
      const el = contentEl.querySelector("#adv-msg");
      if (!el) return;
      el.textContent = text;
      el.hidden = false;
    }
    function clearAdvMsg() {
      const el = contentEl.querySelector("#adv-msg");
      if (el) { el.textContent = ""; el.hidden = true; }
      contentEl.querySelectorAll(".adv-invalid").forEach((i) => i.classList.remove("adv-invalid"));
    }
    // Typing in any field clears the error state for that field.
    ["#adv-company", "#adv-amount", "#adv-date"].forEach((sel) => {
      const el = contentEl.querySelector(sel);
      if (el) el.addEventListener("input", () => {
        el.classList.remove("adv-invalid");
        if (!contentEl.querySelector(".adv-invalid")) clearAdvMsg();
      });
    });

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
      // Refund letter is FREE — it's the deliverable half of the "get refunds"
      // promise, so the headline hook works without paying. (Escalation, cold
      // outreach, statement import, export, CRM stay Pro.)

      // Validate before generating (QA SULA-006): generating from blank inputs
      // produced an empty output box with no error, so users couldn't tell
      // what was required or whether generation had failed. A letter missing
      // the company/amount/date is also materially useless to send.
      const missing = missingLetterFields(facts());
      if (missing.length) {
        showAdvMsg(`Add the ${listPhrase(missing.map((m) => m.label))} before generating.`);
        const first = contentEl.querySelector("#" + missing[0].id);
        if (first) { first.focus(); first.classList.add("adv-invalid"); }
        return;
      }
      clearAdvMsg();

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
      // Real answers, not assumptions (QA SULA-009).
      const r = C.assessReadiness(merchantContactState());
      const steps = C.issuerSteps("generic");
      box.innerHTML = `<strong>${esc(r.recommendation)}</strong><ul>${steps.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;
    });

    contentEl.querySelector("#adv-file").addEventListener("click", async () => {
      if (!(await gate("Escalation"))) return;
      const entry = E.getCategoryEntry(catSel.value);
      const box = contentEl.querySelector("#adv-esc"); box.hidden = false;
      // Only state prior contact if the user told us it happened. A complaint
      // to a regulator is a statement of fact by the user (QA SULA-009).
      const st = merchantContactState();
      const letter = A ? A.buildLetter("regulatory", {
        company: facts().company,
        desired: "a full refund",
        priorAttempts: priorAttemptsSentence(st),
      }) : null;
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
