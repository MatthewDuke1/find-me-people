// Sula — Job-application contact finder (Pro).
//
// Trigger: the user CLICKS an apply button on a job posting. That click alone is
// the signal — we do not wait for a confirmation page, a redirect, or any proof
// the submission succeeded (per product decision: intent to apply is enough).
//
// At click time we are still ON the posting, so the employer identity is right
// there in the URL/DOM. We resolve the company, record the application locally,
// and offer to surface points of contact.
//
// Two lanes (Hybrid, opt-in):
//   • LOCAL (default, free-tier-safe): orchestrate — open the company's people
//     pages (LinkedIn people search, careers/team) where Sula's EXISTING
//     content.js extractor already runs on <all_urls>. No external calls.
//   • ENRICHMENT (Pro + explicit opt-in, default OFF): send only the company
//     DOMAIN to a people-data provider. Stubbed here (Phase 2 wires the provider
//     once BYOK-vs-backend is chosen). Breaks nothing until turned on.
//
// This file is loaded as a content script AFTER license.js + content.js so it
// can call the isPro() global and lean on the existing extractor. It never
// duplicates scanning logic.

(() => {
  "use strict";

  // ── Storage keys (chrome.storage.local) ───────────────────────────────
  const APPS_KEY = "sula_applications"; // recent application records (capped)
  const ENRICH_OPTIN_KEY = "sula_enrich_optin"; // bool — external enrichment toggle
  const DEDUPE_MS = 30 * 60 * 1000; // don't re-fire for the same employer within 30 min
  const APPS_CAP = 100; // keep the list bounded

  // ── ATS host → employer extractor ─────────────────────────────────────
  // Each returns { name, domain } | null. `domain` is best-effort; ATS URLs
  // carry a slug, not always a real company domain (Phase-2 enrichment resolves
  // slug→domain when needed).
  const ATS = [
    {
      test: (h) => /(^|\.)greenhouse\.io$/.test(h) || /(^|\.)job-boards\.greenhouse\.io$/.test(h),
      grab: (u) => slugEmployer(u.pathname.split("/").filter(Boolean)[0]),
    },
    {
      test: (h) => /(^|\.)lever\.co$/.test(h),
      grab: (u) => slugEmployer(u.pathname.split("/").filter(Boolean)[0]),
    },
    {
      test: (h) => /\.myworkdayjobs\.com$/.test(h),
      grab: (u) => slugEmployer(u.hostname.split(".")[0]),
    },
    {
      test: (h) => /(^|\.)ashbyhq\.com$/.test(h),
      grab: (u) => slugEmployer(u.pathname.split("/").filter(Boolean)[0]),
    },
    {
      test: (h) => /\.icims\.com$/.test(h),
      grab: (u) => slugEmployer(u.hostname.replace(/^careers-/, "").split(".")[0]),
    },
  ];

  // Job boards whose OWN name is never the employer — resolve via DOM instead.
  const BOARD_HOSTS = /(^|\.)(linkedin|indeed|glassdoor|ziprecruiter|dice|monster|wellfound|angel)\.(com|co)$/;

  function slugEmployer(slug) {
    if (!slug) return null;
    const name = String(slug)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
    return name ? { name, domain: null } : null;
  }

  // Pull an employer name from the page when the URL can't (LinkedIn/Indeed/etc).
  function employerFromDom() {
    const sels = [
      '[data-testid="inlineHeader-companyName"] a', // LinkedIn
      ".jobs-unified-top-card__company-name a",
      '[data-company-name]',
      '[data-testid="company-name"]', // Indeed
      'meta[property="og:site_name"]',
    ];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const v = (el.getAttribute("content") || el.textContent || "").trim();
      if (v && v.length <= 80) return { name: v, domain: null };
    }
    return null;
  }

  // Resolve the employer for the CURRENT page. Returns { name, domain } | null.
  function resolveEmployer() {
    let u;
    try {
      u = new URL(location.href);
    } catch (_) {
      return null;
    }
    const host = u.hostname.toLowerCase();
    for (const ats of ATS) {
      if (ats.test(host)) {
        const emp = ats.grab(u);
        if (emp) return emp;
      }
    }
    if (BOARD_HOSTS.test(host)) return employerFromDom();
    // Direct company career page: the site itself is the employer.
    const domEmp = employerFromDom();
    return domEmp || { name: prettyHost(host), domain: host.replace(/^www\./, "") };
  }

  function prettyHost(host) {
    const core = host.replace(/^www\./, "").split(".")[0];
    return core ? core.replace(/\b\w/g, (c) => c.toUpperCase()) : host;
  }

  // ── Apply-button detection ────────────────────────────────────────────
  const APPLY_RE =
    /^\s*(apply(\s+now|\s+for\s+this\s+job|\s+with|\s+on\s+company\s+site)?|easy\s+apply|submit\s+application|i'?m\s+interested)\s*$/i;

  function looksLikeApply(el) {
    if (!el) return false;
    const clickable = el.closest(
      'button, a, [role="button"], input[type="submit"]'
    );
    if (!clickable) return false;
    const label = (
      clickable.getAttribute("aria-label") ||
      clickable.value ||
      clickable.textContent ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    if (!label || label.length > 40) return false;
    return APPLY_RE.test(label);
  }

  // ── Pro entitlement (robust across contexts) ──────────────────────────
  // Prefer the isPro() global from license.js when co-loaded; otherwise ask
  // background; default to true (matches today's soft-launch, PRO_ENFORCED=false).
  async function isProEntitled() {
    try {
      if (typeof isPro === "function") return await isPro();
    } catch (_) {}
    try {
      const r = await chrome.runtime.sendMessage({ action: "sula:isPro" });
      if (r && typeof r.pro === "boolean") return r.pro;
    } catch (_) {}
    return true;
  }

  // ── Application record persistence ────────────────────────────────────
  function lcGet(key) {
    return new Promise((res) =>
      chrome.storage.local.get([key], (r) => res(r[key] ?? null))
    );
  }
  function lcSet(obj) {
    return new Promise((res) => chrome.storage.local.set(obj, res));
  }

  async function recentlyRecorded(name) {
    const apps = (await lcGet(APPS_KEY)) || [];
    const now = Date.now();
    return apps.some(
      (a) => a.name === name && now - (a.ts || 0) < DEDUPE_MS
    );
  }

  async function recordApplication(emp, jobUrl) {
    const apps = (await lcGet(APPS_KEY)) || [];
    apps.unshift({
      name: emp.name,
      domain: emp.domain || null,
      jobUrl,
      ts: Date.now(),
    });
    await lcSet({ [APPS_KEY]: apps.slice(0, APPS_CAP) });
  }

  // ── Orchestration: open the pages where contacts live ─────────────────
  // content.js already extracts on whatever the user lands on, so we just steer
  // them to the right pages. Opening tabs goes through background (content
  // scripts can't chrome.tabs.create directly under MV3 in all browsers).
  function openContactPages(emp) {
    const q = encodeURIComponent(`${emp.name} recruiter`);
    const targets = [
      `https://www.linkedin.com/search/results/people/?keywords=${q}`,
    ];
    if (emp.domain) targets.push(`https://${emp.domain}/about`);
    chrome.runtime
      .sendMessage({ action: "sula:openTabs", urls: targets })
      .catch(() => {
        // Fallback if background doesn't handle it yet.
        targets.forEach((url) => window.open(url, "_blank", "noopener"));
      });
  }

  // ── Enrichment lane (Pro + opt-in) — STUBBED for Phase 2 ──────────────
  // Sends ONLY the company domain to the provider. Wired once BYOK-vs-backend
  // is decided. Returns [] today so nothing external ever fires.
  async function enrichCompany(_domain) {
    // TODO Phase 2: BYOK (user key in settings) OR backend proxy.
    //   const res = await fetch(PROVIDER_ENDPOINT + "?domain=" + _domain, {...});
    //   return normalizeContacts(await res.json());
    return [];
  }

  // ── UI: a small Sula panel offering the contact lookup ────────────────
  function showPanel(emp, { pro }) {
    if (document.getElementById("sula-jc-panel")) return;
    const host = document.createElement("div");
    host.id = "sula-jc-panel";
    host.style.cssText =
      "position:fixed;z-index:2147483646;right:16px;bottom:16px;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .card{font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;background:#111827;color:#f9fafb;
              border:1px solid #374151;border-radius:12px;padding:12px 14px;max-width:280px;
              box-shadow:0 8px 24px rgba(0,0,0,.35)}
        .t{font-weight:600;margin-bottom:6px}
        .co{color:#93c5fd}
        .row{display:flex;gap:8px;margin-top:10px}
        button{font:inherit;font-weight:600;border:0;border-radius:8px;padding:7px 10px;cursor:pointer}
        .go{background:#2563eb;color:#fff;flex:1}
        .x{background:transparent;color:#9ca3af}
        .up{background:#f59e0b;color:#111827;flex:1}
        .hint{color:#9ca3af;font-size:11px;margin-top:8px}
      </style>
      <div class="card">
        <div class="t">Applied to <span class="co"></span> ✓</div>
        <div>${pro ? "Surface points of contact for outreach?" : "Find who to reach out to — a Pro feature."}</div>
        <div class="row">
          <button class="${pro ? "go" : "up"}">${pro ? "Find contacts" : "Upgrade to Pro"}</button>
          <button class="x">Dismiss</button>
        </div>
        <div class="hint"></div>
      </div>`;
    root.querySelector(".co").textContent = emp.name;

    const enrichHint = root.querySelector(".hint");
    isEnrichOn().then((on) => {
      if (pro && on) enrichHint.textContent = "External enrichment: ON";
    });

    root.querySelector(".x").addEventListener("click", () => host.remove());
    root.querySelector(pro ? ".go" : ".up").addEventListener("click", async () => {
      if (!pro) {
        // Prefer the real checkout globals directly — job-contacts.js is
        // co-loaded with license.js in the SAME content-script context, so
        // openUpgrade() is a genuine, correct global here (unlike in
        // background.js, which doesn't have license.js loaded).
        if (typeof openUpgrade === "function") openUpgrade();
        else chrome.runtime.sendMessage({ action: "sula:upgrade" }).catch(() => {});
        host.remove();
        return;
      }
      openContactPages(emp);
      if (emp.domain && (await isEnrichOn())) {
        const extra = await enrichCompany(emp.domain); // [] until Phase 2
        // Phase 2: merge `extra` into the popup's contact view for this company.
        void extra;
      }
      host.remove();
    });

    (document.body || document.documentElement).appendChild(host);
    setTimeout(() => host.remove(), 30000); // auto-dismiss
  }

  async function isEnrichOn() {
    return !!(await lcGet(ENRICH_OPTIN_KEY));
  }

  // ── Wire the apply-click trigger ──────────────────────────────────────
  // Capture phase so we see the click even if the site stops propagation.
  document.addEventListener(
    "click",
    async (e) => {
      const path = e.composedPath ? e.composedPath() : [e.target];
      const hit = path.find((n) => n && n.nodeType === 1 && looksLikeApply(n));
      if (!hit) return;
      const emp = resolveEmployer();
      if (!emp || !emp.name) return;
      if (await recentlyRecorded(emp.name)) return;
      await recordApplication(emp, location.href);
      showPanel(emp, { pro: await isProEntitled() });
    },
    true
  );
})();
