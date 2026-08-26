// Sula - Background Service Worker
// Manages badge count and tab-level state

// Post-uninstall survey. When the user removes the extension, Chrome opens
// this URL in a new tab — a short, optional, anonymous "why did you leave?"
// page on our site. Standard chrome.runtime.setUninstallURL mechanism; needs
// no permissions and sends nothing from the extension itself. We pass the
// version so feedback can be tied to a release. Set on every service-worker
// startup (idempotent) so it survives SW teardown and updates.
(function setUninstallSurvey() {
  try {
    const version = chrome.runtime.getManifest().version;
    chrome.runtime.setUninstallURL(
      `https://trysula.com/uninstall.html?v=${encodeURIComponent(version)}`
    );
  } catch (_) {
    // setUninstallURL can be unavailable/throw in rare contexts — non-fatal.
  }
})();

// The release that first enforces Pro. MUST match the manifest version of the
// build that flips PRO_ENFORCED=true, or grandfathering silently misfires.
const PRICING_VERSION = "2.1.0";

// Numeric semver compare: is a < b?
function versionLt(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

chrome.runtime.onInstalled.addListener((details) => {
  // Rebrand notice: only people who knew it as "Find Me People" (1.x).
  if (
    details.reason === "update" &&
    details.previousVersion &&
    details.previousVersion.startsWith("1.")
  ) {
    chrome.storage.local.set({ sula_rebrand_notice: true });
  }

  // Grandfathering. Everyone who had Sula before it cost anything keeps Pro
  // for good. Two ways to qualify, so nobody slips through:
  //   1. They are running a build older than PRICING_VERSION (install OR
  //      update) -- the flag is written now, before pricing ever ships.
  //   2. They update straight into the pricing build from an older one,
  //      having skipped the builds in (1).
  // A clean install of the pricing build matches neither, so new users pay.
  const myVersion = chrome.runtime.getManifest().version;
  const qualifies =
    versionLt(myVersion, PRICING_VERSION) ||
    (details.reason === "update" &&
      details.previousVersion &&
      versionLt(details.previousVersion, PRICING_VERSION));
  if (qualifies) {
    chrome.storage.local.set({ sula_early_supporter: true });
  }
});

// --- Global Privacy Control (GPC) ruleset sync -------------------------------
// The `Sec-GPC: 1` request header is set by a declarativeNetRequest ruleset
// (gpc-rules.json), which ships enabled by default. When the user toggles GPC
// off in the popup we must actually stop sending the header, so we enable or
// disable the static ruleset to match the stored flag. (The JS-property half
// is handled separately by gpc-inject.js reading the same flag.)
const GPC_KEY = "sula_gpc_enabled";
const GPC_RULESET_ID = "gpc_ruleset";

async function syncGpcRuleset() {
  if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateEnabledRulesets) return;
  try {
    const r = await chrome.storage.local.get([GPC_KEY]);
    const enabled = r[GPC_KEY] !== false; // default ON
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      enabled
        ? { enableRulesetIds: [GPC_RULESET_ID] }
        : { disableRulesetIds: [GPC_RULESET_ID] }
    );
  } catch (_e) {
    // Non-fatal: the static ruleset's own "enabled": true is the fallback.
  }
}

// Keep the header in step with the toggle, and re-assert on worker startup.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.prototype.hasOwnProperty.call(changes, GPC_KEY)) {
    syncGpcRuleset();
  }
});
syncGpcRuleset();

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "updateBadge" && sender.tab) {
    const count = msg.count || 0;
    const text = count > 0 ? String(count) : "";
    const color = count > 0 ? "#60a5fa" : "#52525b";

    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color, tabId: sender.tab.id });
  }
});

// ── Email verification pipeline — Tier 2/3 network egress ──────────────────
// Deliberately handled here (service worker), not in a content script:
// fetch() from a service worker is NOT subject to the current page's
// Content-Security-Policy connect-src directive, so a CSP-strict page can
// never silently break these calls. Single, auditable point of network
// egress for the whole verification feature. See email-verify.js for the
// full pipeline design (Tiers 1-4).

// Tier 2 — MX record lookup via a PUBLIC DNS-over-HTTPS resolver (Cloudflare).
// Not Sula-run infra: only the bare domain is sent, to a third-party
// privacy-respecting resolver, never the full email address or any page
// content. Real, functioning check — not a stub.
async function checkMxViaDoh(domain) {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/dns-json" },
      signal: controller.signal,
    });
    if (!res.ok) return { hasMx: null, error: `http_${res.status}` };
    const data = await res.json();
    // Status 0 = NOERROR. Answer entries with type 15 are MX records.
    const hasMx =
      data && data.Status === 0 && Array.isArray(data.Answer) &&
      data.Answer.some((a) => a.type === 15);
    return { hasMx: !!hasMx };
  } catch (e) {
    return { hasMx: null, error: e && e.name === "AbortError" ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timeout);
  }
}

// Tier 3 — real mailbox (SMTP-level) verification. STUBBED: no provider is
// wired yet (see docs/ — build-vs-buy: rent verification from an established
// provider like MyEmailVerifier/ZeroBounce rather than run our own
// SMTP-probing infra; port 25 is blocked outbound by default on AWS/Azure,
// and IP-reputation/greylisting management is a real ongoing cost).
//
// TO WIRE A REAL PROVIDER:
//   1. Pick a provider, get an API key.
//   2. Replace this function's body with a fetch() to that provider,
//      normalizing its response to { status: "verified"|"invalid"|
//      "catch_all"|"greylisted"|"unknown", reason? }.
//   3. NEVER ship the provider's API key in the extension bundle — this
//      function already runs in the background service worker, so the key
//      can live in a small server-side proxy this function calls instead of
//      the provider directly (keeps the key off the client entirely).
//   4. Real Pro enforcement for a PAID backend call should validate the
//      LemonSqueezy license key server-side at that proxy — do not trust a
//      same-device chrome.storage flag for this, since that's locally
//      spoofable. The client-side isPro() check in email-verify.js is a UX
//      gate (avoid the round-trip when obviously free), not the security
//      boundary.
async function verifyMailboxStub(_email) {
  return { status: "not_configured", reason: "provider_not_wired" };
}

// Lightweight Pro-check forwarder. Soft-launch (PRO_ENFORCED=false in
// license.js) means everyone is Pro today, so this mirrors that rather than
// re-implementing license.js's full validate-against-LemonSqueezy flow in
// the service worker. Once a real Tier-3 provider is wired and Pro is
// actually enforced, verifyMailboxStub's real replacement should validate
// the license key directly (see note above) rather than rely on this.
async function isProViaStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["fmp_license", "sula_early_supporter"], (r) => {
      resolve(!!(r.sula_early_supporter || (r.fmp_license && r.fmp_license.pro)));
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "sula:checkMx") {
    checkMxViaDoh(msg.domain).then(sendResponse);
    return true; // async response
  }
  if (msg.action === "sula:verifyMailbox") {
    verifyMailboxStub(msg.email).then(sendResponse);
    return true;
  }
  if (msg.action === "sula:isPro") {
    isProViaStorage().then((pro) => sendResponse({ pro })).catch(() => sendResponse({ pro: true }));
    return true;
  }
  // Autofill fan-out for the side panel. A content script can't call
  // chrome.scripting itself, and ATS forms (iCIMS, Workday) live in iframes,
  // so the panel asks the background to run the call in EVERY frame of its tab
  // and returns the summed tally.
  if (msg.action === "sula:autofillAllFrames") {
    const tabId = sender && sender.tab && sender.tab.id;
    if (tabId == null) { sendResponse({ parts: [] }); return true; }
    chrome.scripting
      .executeScript({
        target: { tabId, allFrames: true },
        args: [msg.mode === "fill" ? "autofill" : "preview", msg.profile || null],
        func: (name, payload) => {
          try {
            const api = window.SulaAutofill;
            if (!api || typeof api[name] !== "function") return null;
            return name === "autofill" ? api.autofill(payload) : { keys: api.preview() };
          } catch (_) { return null; }
        },
      })
      .then((results) => sendResponse({ parts: (results || []).map((r) => r && r.result).filter(Boolean) }))
      .catch(() => sendResponse({ parts: [] }));
    return true;
  }
  // job-contacts.js's local-orchestration lane: open the company's people
  // pages (LinkedIn search, /about) from the background, since content
  // scripts can't chrome.tabs.create directly under MV3 in all browsers.
  if (msg.action === "sula:openTabs") {
    const urls = Array.isArray(msg.urls) ? msg.urls : [];
    Promise.all(urls.map((url) => chrome.tabs.create({ url }).catch(() => null)))
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.action === "sula:upgrade") {
    // Fallback path only — license.js (which owns the real CHECKOUT URLs) is
    // not loaded into this service worker's context, so this never
    // references its globals directly (that would throw a ReferenceError,
    // not fail safely). Callers that ARE co-loaded with license.js (any
    // content script sharing that manifest entry) should call openUpgrade()
    // directly instead of round-tripping through this message — see
    // job-contacts.js, which does exactly that.
    chrome.tabs.create({ url: "https://trysula.com/#pro" }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }
  return false; // let other listeners (e.g. updateBadge above) handle their own messages
});
