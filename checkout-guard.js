// Sula — Checkout Guard (content script).
//
// On a pre-purchase checkout page, read the fine print the merchant buries and
// show a quiet advisory card BEFORE the user pays: the return window,
// restocking / final-sale flags, whether it auto-renews, and whether a
// cancellation path exists. Advisory only — never blocks, acts, or promises.
//
// Reuses two content scripts already loaded on the page:
//   - window.SulaCheckoutSignals — classifyCheckout / scanAutoRenew / scanFlags
//   - window.SulaRefundPolicy     — summarizePolicy(text) -> { windowDays, summary }
//
// No new permission, no network, nothing leaves the page. See
// docs/checkout-guard-scope.md.

(() => {
  "use strict";

  if (typeof document === "undefined" || typeof location === "undefined") return;

  const CARD_ID = "sula-checkout-guard";
  const MAX_TEXT = 8000; // cap the text we scan for performance

  function pageText() {
    return ((document.body && document.body.innerText) || "").slice(0, MAX_TEXT);
  }

  // Build the list of facts to show. Each fact is { tone: "good"|"warn"|"info",
  // text }. Only facts actually found are returned — never invent one.
  function gatherFacts(text) {
    const sig = window.SulaCheckoutSignals;
    const pol = window.SulaRefundPolicy;
    const facts = [];

    // 1. Return window (from the policy extractor, read at checkout).
    if (pol && typeof pol.summarizePolicy === "function") {
      let summary = null;
      try { summary = pol.summarizePolicy(text); } catch (_e) {}
      if (summary && summary.windowDays) {
        facts.push({ tone: "good", text: `${summary.windowDays}-day return window` });
      } else if (pol.findPolicyOnPage) {
        // A policy exists on the page but no explicit window — worth a nudge.
        let onPage = [];
        try { onPage = pol.findPolicyOnPage() || []; } catch (_e) {}
        const withWindow = onPage.find((p) => p.summary && p.summary.windowDays);
        if (withWindow) {
          facts.push({ tone: "good", text: `${withWindow.summary.windowDays}-day return window` });
        }
      }
    }

    // 2. Restocking / final-sale / non-refundable flags.
    if (sig && typeof sig.scanFlags === "function") {
      for (const label of sig.scanFlags(text)) {
        facts.push({ tone: "warn", text: label });
      }
    }

    // 3. Auto-renewal.
    if (sig && typeof sig.scanAutoRenew === "function") {
      const ar = sig.scanAutoRenew(text);
      if (ar.autoRenew) {
        facts.push({ tone: "warn", text: "Renews automatically — you'll be charged again" });
      }
    }

    return facts;
  }

  function injectCard(facts) {
    if (document.getElementById(CARD_ID)) return;
    const host = document.createElement("div");
    host.id = CARD_ID;
    host.style.cssText =
      "position:fixed;z-index:2147483646;right:16px;bottom:16px;";
    const root = host.attachShadow({ mode: "open" });

    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rows = facts.map((f) => {
      const dot = f.tone === "good" ? "✓" : f.tone === "warn" ? "!" : "•";
      const cls = f.tone === "good" ? "g" : f.tone === "warn" ? "w" : "i";
      return `<div class="row"><span class="dot ${cls}">${dot}</span><span>${escapeHtml(f.text)}</span></div>`;
    }).join("");

    root.innerHTML =
      `<style>
        .card{font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;background:#111827;color:#f9fafb;
          border:1px solid #374151;border-radius:12px;padding:12px 14px;max-width:270px;
          box-shadow:0 10px 30px rgba(0,0,0,.4);${reduce ? "" : "animation:in .2s ease-out;"}}
        @keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .top{display:flex;align-items:center;gap:7px;margin-bottom:8px}
        .badge{font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#93c5fd;
          background:rgba(96,165,250,.15);padding:2px 7px;border-radius:6px}
        .x{margin-left:auto;background:none;border:0;color:#9ca3af;font:16px/1 inherit;cursor:pointer;padding:0 2px}
        .x:hover{color:#f9fafb}
        .row{display:flex;gap:8px;align-items:flex-start;padding:3px 0}
        .dot{flex:none;width:15px;height:15px;border-radius:50%;font-size:10px;font-weight:700;
          display:grid;place-items:center;margin-top:1px}
        .dot.g{background:rgba(74,222,128,.18);color:#4ade80}
        .dot.w{background:rgba(251,191,36,.18);color:#fbbf24}
        .dot.i{background:rgba(148,163,184,.18);color:#94a3b8}
        .foot{margin-top:10px;padding-top:8px;border-top:1px solid #1f2937;display:flex;gap:10px;align-items:flex-start}
        .hint{color:#9ca3af;font-size:11px;line-height:1.4}
        .dismiss{background:none;border:0;color:#6b7280;font:12px inherit;cursor:pointer;padding:0;margin-left:auto;flex:none}
      </style>
      <div class="card" role="status" aria-label="Sula checkout guard">
        <div class="top"><span class="badge">Before you buy</span>
          <button class="x" aria-label="Dismiss">×</button></div>
        ${rows}
        <div class="foot">
          <span class="hint">Full policy &amp; refund help: click the Sula icon → Advocacy</span>
          <button class="dismiss" id="dismiss">Dismiss</button>
        </div>
      </div>`;

    const close = () => { if (host.isConnected) host.remove(); };
    root.querySelector(".x").addEventListener("click", close);
    root.getElementById("dismiss").addEventListener("click", close);

    (document.body || document.documentElement).appendChild(host);
    // Auto-dismiss after 20s if the user hasn't interacted (matches the moment
    // detector's quiet-guard behavior). Cancelled on hover.
    let timer = setTimeout(close, 20000);
    root.querySelector(".card").addEventListener("mouseenter", () => clearTimeout(timer));
    root.querySelector(".card").addEventListener("mouseleave", () => { timer = setTimeout(close, 20000); });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function run() {
    const sig = window.SulaCheckoutSignals;
    if (!sig || typeof sig.classifyCheckout !== "function") return;

    const text = pageText();
    const cls = sig.classifyCheckout({
      url: location.href,
      title: document.title || "",
      bodyText: text,
    });
    if (!cls.isCheckout) return;

    const facts = gatherFacts(text);
    // No facts found ⇒ no card. Never show an empty or speculative card just
    // because the page looks like a checkout.
    if (!facts.length) return;

    injectCard(facts);
  }

  // Run once after the page settles. A short delay lets late-rendered checkout
  // widgets (payment iframes, dynamic totals) paint first.
  setTimeout(run, 1400);

  // Expose for tests / manual triggering.
  if (typeof window !== "undefined") {
    window.SulaCheckoutGuard = { run, gatherFacts };
  }
})();
