// Sula — Resume tab UI.
//
// Paste your resume once, then on any job posting: scan it, see which of the
// posting's terms your resume already supports, and get the gaps.
//
// The honesty rule from resume-injection.js carries through to the UI. Sula
// shows you which of YOUR bullets could host a missing term and asks you to
// rewrite it if it is true of the work you did. It never writes the claim for
// you, because a resume bullet is an assertion the user has to stand behind.
//
// window.SulaResumeUI

(() => {
  "use strict";

  const RESUME_KEY = "sula_resume_text";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;" }[c] || c));

  function lcGet(k) {
    return new Promise((r) => {
      try { chrome.storage.local.get([k], (o) => r(o[k] ?? null)); }
      catch (_) { r(null); }
    });
  }
  function lcSet(o) {
    return new Promise((r) => {
      try { chrome.storage.local.set(o, r); } catch (_) { r(); }
    });
  }

  // Pull the posting off the active tab. resume-injection.js is not a content
  // script (no DOM work needed in the page), so read the text via scripting.
  async function readPosting(tabId) {
    try {
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const sel = [
            '[class*="job-description"]', '[class*="jobDescription"]',
            '[id*="job-description"]', '[data-testid*="jobDescription"]',
            '[class*="description"]', "article", "main",
          ];
          for (const s of sel) {
            try {
              const c = document.querySelector(s);
              if (c && (c.innerText || "").length > 400) {
                return { title: document.title || "", text: c.innerText.slice(0, 20000) };
              }
            } catch (_) {}
          }
          return {
            title: document.title || "",
            text: ((document.body || {}).innerText || "").slice(0, 20000),
          };
        },
      });
      return (res && res[0] && res[0].result) || { title: "", text: "" };
    } catch (_) {
      return { title: "", text: "" };
    }
  }

  function scoreClass(n) {
    if (n >= 70) return "rs-good";
    if (n >= 40) return "rs-mid";
    return "rs-low";
  }

  function renderReport(host, report, postingTitle) {
    const matched = report.matched.slice(0, 24);
    const missing = report.missing.slice(0, 24);

    host.innerHTML = `
      <div class="rs-score ${scoreClass(report.score)}">
        <div class="rs-num">${report.score}%</div>
        <div class="rs-lbl">of this posting's terms your resume already supports</div>
      </div>
      ${postingTitle ? `<div class="rs-src">Scanned: ${esc(postingTitle).slice(0, 90)}</div>` : ""}

      <div class="section-title" style="margin-top:12px">Already covered (${report.matched.length})</div>
      <div class="rs-chips">${
        matched.length
          ? matched.map((t) => `<span class="rs-chip rs-hit">${esc(t)}</span>`).join("")
          : '<span class="rs-none">Nothing matched yet.</span>'
      }</div>

      <div class="section-title" style="margin-top:12px">Gaps (${report.missing.length})</div>
      <div class="rs-chips">${
        missing.length
          ? missing.map((t) => `<span class="rs-chip rs-miss">${esc(t)}</span>`).join("")
          : '<span class="rs-none">No gaps found.</span>'
      }</div>

      ${report.suggestions.length ? `
        <div class="section-title" style="margin-top:14px">Where to close them</div>
        <div class="rs-hint">Sula rewrites nothing on its own. Each gap points at one of your own bullets &mdash; use it only if it is true of the work you did.</div>
        ${report.suggestions.map((s) => `
          <div class="rs-sug">
            <div class="rs-term">${esc(s.term)}</div>
            <div class="rs-act">${esc(s.action)}</div>
            ${s.hostBullet
              ? `<div class="rs-host">${esc(s.hostBullet)}</div>
                 <button class="rs-copy" data-copy="${esc(s.hostBullet)}">Copy this bullet</button>`
              : ""}
          </div>`).join("")}
      ` : ""}

      <div class="rs-disclaim">${esc(report.disclaimer)}</div>`;

    host.querySelectorAll("[data-copy]").forEach((b) => {
      b.addEventListener("click", () => {
        navigator.clipboard.writeText(b.getAttribute("data-copy")).then(
          () => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy this bullet"), 1400); },
          () => { b.textContent = "Press Ctrl+C"; }
        );
      });
    });
  }

  async function render(contentEl, ctx) {
    const tab = ctx && ctx.tab;
    const saved = (await lcGet(RESUME_KEY)) || "";

    contentEl.innerHTML = `
      <div class="rs-wrap">
        <div class="section">
          <div class="section-title">Resume</div>
          <div class="rs-hint">Paste your resume once. It stays on this device &mdash; nothing is uploaded, and there is no account.</div>
          <textarea class="rs-ta" id="rs-text" rows="7" placeholder="Paste your resume here, bullets and all.">${esc(saved)}</textarea>
          <div class="rs-actions">
            <button class="action-chip" id="rs-save">Save resume</button>
            <span class="rs-saved" id="rs-saved"></span>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Scan this job posting</div>
          <div class="rs-hint">Open a job posting in the current tab, then scan. Sula compares the posting's language against what your resume already says.</div>
          <div class="rs-actions">
            <button class="action-chip outreach-chip" id="rs-scan">Scan this page</button>
          </div>
          <div id="rs-out" class="rs-out"></div>
        </div>
      </div>`;

    const ta = contentEl.querySelector("#rs-text");
    const out = contentEl.querySelector("#rs-out");

    contentEl.querySelector("#rs-save").addEventListener("click", async () => {
      await lcSet({ [RESUME_KEY]: ta.value });
      const s = contentEl.querySelector("#rs-saved");
      s.textContent = "Saved ✓";
      setTimeout(() => (s.textContent = ""), 1500);
    });

    contentEl.querySelector("#rs-scan").addEventListener("click", async () => {
      const resume = ta.value.trim();
      if (!resume) {
        out.innerHTML = '<div class="rs-warn">Paste your resume first &mdash; there is nothing to compare against.</div>';
        return;
      }
      await lcSet({ [RESUME_KEY]: resume }); // scan what is on screen, saved or not

      out.innerHTML = '<div class="rs-hint">Reading this page…</div>';
      if (!tab || tab.id == null) {
        out.innerHTML = '<div class="rs-warn">Couldn\'t reach this tab.</div>';
        return;
      }

      const posting = await readPosting(tab.id);
      if (!posting.text || posting.text.length < 200) {
        out.innerHTML = '<div class="rs-warn">This page doesn\'t look like a job posting. Open the posting itself and try again.</div>';
        return;
      }

      const api = window.SulaResumeInjection;
      if (!api) {
        out.innerHTML = '<div class="rs-warn">Resume engine didn\'t load. Reload the extension.</div>';
        return;
      }

      try {
        const report = api.buildReport(posting.text, resume, { limit: 30, maxSuggestions: 8 });
        renderReport(out, report, posting.title);
      } catch (_) {
        out.innerHTML = '<div class="rs-warn">Couldn\'t analyse this posting.</div>';
      }
    });
  }

  window.SulaResumeUI = { render, readPosting };
})();
