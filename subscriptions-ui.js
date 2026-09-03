// Sula — Subscriptions tab (Pro). Import your own bank statement, see the
// recurring charges, and get a summary — all local.
//
// The anti-Rocket-Money flow: the user exports their OWN statement (CSV / OFX /
// QFX) from their OWN bank and drops the file here. Sula parses it with
// statement-parser.js entirely in the browser, surfaces the recurring charges,
// and offers a downloadable summary. The file never leaves the device; Sula
// never touches the bank. That local-only posture is exactly why this avoids
// the aggregator / GLBA regulatory burden Plaid-based tools carry.
//
// Detected subscriptions can be pushed into the Subscription Guardian model
// (sula_subscriptions) so renewal reminders work. window.SulaSubscriptionsUI.

(() => {
  "use strict";

  const SUBS_KEY = "sula_subscriptions";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lcGet = (k) => new Promise((r) => chrome.storage.local.get([k], (o) => r(o[k] ?? null)));
  const lcSet = (o) => new Promise((r) => chrome.storage.local.set(o, r));
  const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function gate(label) {
    if (typeof gateProFeature === "function") return await gateProFeature(label);
    return true; // soft-launch
  }

  // Both entry points write to sula_subscriptions, but they disagreed on the
  // field name: Advocacy's manual tracker stores `company`, the statement
  // import stores `name`. One store, two shapes, so each view rendered the
  // other's records blank — half of QA SULA-011. Read through this everywhere.
  function subName(s) {
    return String((s && (s.company || s.name)) || "").trim();
  }

  // Where a tracked subscription came from, for the source label QA asked for.
  function subSource(s) {
    return (s && s.source) === "statement-import" ? "imported" : "added manually";
  }

  const CADENCE_LABEL = { weekly: "wk", monthly: "mo", quarterly: "qtr", annual: "yr" };

  function summaryText(recs) {
    const totalYr = recs.reduce((s, r) => s + r.annualized, 0);
    const lines = [
      "SULA — SUBSCRIPTION SUMMARY",
      "Generated locally from your own statement. Nothing left your device.",
      "",
      `${recs.length} recurring charges found · ~${money(totalYr)}/year`,
      "",
    ];
    for (const r of recs) {
      lines.push(
        `${r.merchant}  —  ${money(r.amount)}/${CADENCE_LABEL[r.cadence]}` +
        `  (${money(r.annualized)}/yr)` +
        (r.priceChanged ? "  [price changed]" : "")
      );
    }
    lines.push("", "Cancel one? Open Sula on the merchant's site — it finds the real cancellation contact.");
    return lines.join("\n");
  }

  function downloadSummary(recs) {
    const blob = new Blob([summaryText(recs)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sula-subscriptions.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function pushToGuardian(recs) {
    const existing = (await lcGet(SUBS_KEY)) || [];
    // Dedup across BOTH shapes, or an import re-adds something the user
    // already tracked by hand in Advocacy (QA SULA-011).
    const seen = new Set(existing.map((s) => subName(s).toUpperCase()));
    let added = 0;
    for (const r of recs) {
      if (seen.has(r.merchant.toUpperCase())) continue;
      existing.push({
        // Write both keys so either view renders the record correctly,
        // whichever field it reads.
        name: r.merchant,
        company: r.merchant,
        amount: r.amount,
        cadence: r.cadence,
        startMs: r.lastChargeMs,
        source: "statement-import",
      });
      added++;
    }
    await lcSet({ [SUBS_KEY]: existing });
    return added;
  }

  function renderResults(contentEl, recs, ctx) {
    const totalYr = recs.reduce((s, r) => s + r.annualized, 0);
    const totalMo = recs.reduce((s, r) => s + r.annualized / 12, 0);

    const rows = recs.map((r) => `
      <div class="sub-row">
        <div class="sub-main">
          <div class="sub-name">${esc(r.merchant)}${r.priceChanged ? ` <span class="sub-flag">price changed</span>` : ""}</div>
          <div class="sub-meta">${esc(r.count)} charges · last ${new Date(r.lastChargeMs).toLocaleDateString()}</div>
        </div>
        <div class="sub-amt">${money(r.amount)}<span class="sub-per">/${CADENCE_LABEL[r.cadence]}</span>
          <div class="sub-yr">${money(r.annualized)}/yr</div>
        </div>
      </div>`).join("");

    contentEl.innerHTML = `
      <div class="subs-wrap">
        <div class="subs-tally">
          <div class="subs-tally-big">${money(totalMo)}<span>/mo</span></div>
          <div class="subs-tally-sub">${recs.length} subscriptions · ${money(totalYr)}/year</div>
        </div>
        <div class="subs-list">${rows}</div>
        <div class="subs-actions">
          <button class="subs-btn primary" id="subs-download" type="button">Download summary</button>
          <button class="subs-btn" id="subs-track" type="button">Track these for renewals</button>
        </div>
        <button class="subs-reimport" id="subs-reimport" type="button">Import a different statement</button>
        <p class="subs-fine">Parsed on your device from the file you chose. Nothing was uploaded.</p>
      </div>`;

    contentEl.querySelector("#subs-download").addEventListener("click", () => downloadSummary(recs));
    contentEl.querySelector("#subs-track").addEventListener("click", async (e) => {
      const n = await pushToGuardian(recs);
      e.target.textContent = n ? `Added ${n} to renewal tracking ✓` : "Already tracking these ✓";
      e.target.disabled = true;
    });
    contentEl.querySelector("#subs-reimport").addEventListener("click", () => render(contentEl, ctx));
  }

  function renderDropzone(contentEl, ctx) {
    contentEl.innerHTML = `
      <div class="subs-wrap">
        <div class="subs-intro">
          <div class="subs-intro-title">Find your subscriptions</div>
          <p>Export your statement from your bank as <b>CSV</b>, <b>OFX</b>, or <b>QFX</b>, then drop it here. Sula reads it right on your device — the file never leaves your browser, and Sula never connects to your bank.</p>
        </div>
        <label class="subs-drop" id="subs-drop">
          <input type="file" id="subs-file" accept=".csv,.ofx,.qfx,.txt" hidden>
          <div class="subs-drop-icon">📄</div>
          <div class="subs-drop-main">Choose or drop your statement file</div>
          <div class="subs-drop-sub">CSV / OFX / QFX — Chase, Wells Fargo, Capital One &amp; more</div>
          <div class="subs-drop-limit">Maximum file size: 10 MB</div>
        </label>
        <div class="subs-err" id="subs-err" hidden></div>
        <p class="subs-fine">100% local. No account, no bank login, nothing uploaded — that's the whole point.</p>
      </div>`;

    const fileInput = contentEl.querySelector("#subs-file");
    const drop = contentEl.querySelector("#subs-drop");
    const errEl = contentEl.querySelector("#subs-err");

    function showErr(msg) { errEl.hidden = false; errEl.textContent = msg; }

    const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — must match the stated limit

    async function handleFile(file) {
      if (!file) return;
      errEl.hidden = true;
      if (file.size > MAX_BYTES)
        return showErr("That file is over the 10 MB limit. A single account's CSV/OFX export is well under this — pick one account and try again.");
      let text;
      try { text = await file.text(); }
      catch (_e) { return showErr("Couldn't read that file. Try exporting again."); }

      const parser = window.SulaStatementParser;
      if (!parser) return showErr("Parser unavailable.");
      const { transactions, error } = parser.parse(text, file.name);
      if (error === "no_header" || error === "no_rows")
        return showErr("That doesn't look like a bank CSV/OFX export. Make sure you exported transactions (not a PDF), then try again.");
      if (!transactions.length)
        return showErr("No transactions found in that file.");

      const recs = parser.detectRecurring(transactions, Date.now());
      if (!recs.length)
        return showErr(`Read ${transactions.length} transactions, but found no clearly recurring charges. A longer statement (a few months) helps Sula spot the pattern.`);

      renderResults(contentEl, recs, ctx);
    }

    fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault(); drop.classList.remove("over");
      handleFile(e.dataTransfer.files[0]);
    });
  }

  // The renewal list every entry point shares (QA SULA-011). Previously the
  // Subs tab rendered only the import dropzone, so a subscription tracked in
  // Advocacy was nowhere to be found here and looked lost.
  async function renderTrackedList(contentEl) {
    const list = (await lcGet(SUBS_KEY)) || [];
    if (!list.length) return "";
    const G = window.SulaSubscriptionGuardian;
    const now = Date.now();
    const rows = list.map((s) => {
      let days = null;
      try { if (G) days = G.daysUntilRenewal(s, now); } catch (_e) {}
      return `
        <div class="sub-row">
          <div class="sub-main">
            <div class="sub-name">${esc(subName(s))}</div>
            <div class="sub-meta">${esc(s.cadence || "")} · ${esc(subSource(s))}</div>
          </div>
          <div class="sub-amt">${s.amount ? esc(String(s.amount)) : ""}
            <div class="sub-yr">${days == null ? "" : "renews in " + days + "d"}</div>
          </div>
        </div>`;
    }).join("");
    return `
      <div class="subs-tracked">
        <div class="section-title">Tracked renewals (${list.length})</div>
        <div class="subs-list">${rows}</div>
        <p class="subs-fine">Everything you track — added by hand or imported from a statement — appears here.</p>
      </div>`;
  }

  async function render(contentEl, ctx) {
    if (!(await gate("Subscriptions"))) return;
    renderDropzone(contentEl, ctx);
    // Prepend the shared renewal list above the import workflow.
    const tracked = await renderTrackedList(contentEl);
    if (tracked) {
      const wrap = contentEl.querySelector(".subs-wrap");
      if (wrap) wrap.insertAdjacentHTML("afterbegin", tracked);
    }
  }

  window.SulaSubscriptionsUI = { render };
})();
