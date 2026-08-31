// Sula — LemonSqueezy licensing / Pro entitlement.
//
// LemonSqueezy is the Merchant of Record (it handles checkout + global tax).
// Pro is unlocked by a LemonSqueezy *license key*. The license activate/
// validate/deactivate endpoints authenticate with the license key itself, so
// the extension talks to them directly — no backend, and we never ship a
// LemonSqueezy API secret. host_permissions is already <all_urls>, so the
// fetch to api.lemonsqueezy.com needs no manifest change.
//
// SOFT LAUNCH: PRO_ENFORCED is false until your LemonSqueezy store + license-
// key product are live. While false, isPro() returns true for everyone (the
// gating rails are wired but nothing is locked). Flip it to true once you've:
//   1. created the store + Pro product(s) with "Generate license keys" on,
//   2. pasted your checkout URLs into CHECKOUT below.
// See UNINSTALL-SURVEY.md-style runbook in LEMONSQUEEZY.md.

const LS_API = "https://api.lemonsqueezy.com/v1/licenses";
const LIC_STORE_KEY = "fmp_license"; // chrome.storage.local
// Set by background.js for anyone who installed before Pro cost anything.
const EARLY_KEY = "sula_early_supporter";
const PRO_ENFORCED = true; // live since 2.1.0 — must ship with manifest >= PRICING_VERSION
const VALIDATE_EVERY_MS = 24 * 60 * 60 * 1000; // re-check at most daily

// Your LemonSqueezy hosted checkout links (fill in after creating the products).
const CHECKOUT = {
  monthly: "https://sula.lemonsqueezy.com/checkout/buy/47598c36-6163-4f4e-93de-9266450ebfaa",
  annual: "https://sula.lemonsqueezy.com/checkout/buy/ac76da47-0b68-4431-8728-a2b8d6ad5ecf",
  lifetime: "https://sula.lemonsqueezy.com/checkout/buy/1f26fe80-e487-4305-9593-5301dd0279cb",
};
// Which checkout the "Upgrade to Pro" button opens by default.
const DEFAULT_CHECKOUT = CHECKOUT.monthly;

function _lcGet(key) {
  return new Promise((res) => {
    if (!chrome.storage || !chrome.storage.local) return res(null);
    chrome.storage.local.get([key], (r) => res(r[key] ?? null));
  });
}
function _lcSet(obj) {
  return new Promise((res) => {
    if (!chrome.storage || !chrome.storage.local) return res();
    chrome.storage.local.set(obj, res);
  });
}
function _lsForm(params) {
  return {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  };
}

// Map a raw LemonSqueezy API error to a message a user should see. The API
// returns technical strings like "license_key not found." — never show those
// (#7). Anything unrecognized falls back to a generic, non-technical line.
function _friendlyLicenseError(raw) {
  const s = String(raw || "").toLowerCase();
  if (s.includes("not found") || s.includes("invalid"))
    return "That license key wasn't recognized. Check for typos and try again.";
  if (s.includes("activation limit") || s.includes("reached"))
    return "This key is already active on the maximum number of devices. Deactivate it on another device first.";
  if (s.includes("expired"))
    return "This license has expired. Renew it to reactivate Pro.";
  if (s.includes("disabled"))
    return "This license has been disabled. Contact support if you think that's a mistake.";
  return "That license key couldn't be activated. Check the key and try again.";
}

// Activate a license key on this install. Stores the instance id so we can
// validate later. Returns { ok } or { ok:false, error }.
async function activateLicense(key) {
  const license_key = (key || "").trim();
  if (!license_key) return { ok: false, error: "Enter your license key." };
  try {
    const r = await fetch(
      `${LS_API}/activate`,
      _lsForm({
        license_key,
        instance_name: `Sula ${(navigator.userAgent || "").slice(0, 40)}`,
      })
    ).then((res) => res.json());
    if (r && r.activated) {
      await _lcSet({
        [LIC_STORE_KEY]: {
          key: license_key,
          instanceId: r.instance && r.instance.id,
          pro: true,
          checked: Date.now(),
        },
      });
      return { ok: true };
    }
    return {
      ok: false,
      error: _friendlyLicenseError(r && r.error),
    };
  } catch (_) {
    return { ok: false, error: "Network error — try again." };
  }
}

// Is this install entitled to Pro? Cheap + offline-tolerant: trusts the cached
// flag for VALIDATE_EVERY_MS, then re-validates against LemonSqueezy (which
// reflects subscription lapse / refund). Network failure never locks out a
// paying user.
async function isEarlySupporter() {
  return !!(await _lcGet(EARLY_KEY));
}

async function isPro() {
  if (!PRO_ENFORCED) return true; // store not live yet — everyone is Pro
  if (await isEarlySupporter()) return true; // grandfathered, no license needed
  const lic = await _lcGet(LIC_STORE_KEY);
  if (!lic || !lic.pro) return false;
  if (Date.now() - (lic.checked || 0) < VALIDATE_EVERY_MS) return true;
  try {
    const r = await fetch(
      `${LS_API}/validate`,
      _lsForm({ license_key: lic.key, instance_id: lic.instanceId })
    ).then((res) => res.json());
    const ok = !!(r && r.valid && r.license_key && r.license_key.status === "active");
    await _lcSet({ [LIC_STORE_KEY]: { ...lic, pro: ok, checked: Date.now() } });
    return ok;
  } catch (_) {
    return true; // best-effort; don't punish a paying user for being offline
  }
}

// Release this install's seat (so the key can be used elsewhere).
async function deactivateLicense() {
  const lic = await _lcGet(LIC_STORE_KEY);
  if (lic && lic.key && lic.instanceId) {
    try {
      await fetch(
        `${LS_API}/deactivate`,
        _lsForm({ license_key: lic.key, instance_id: lic.instanceId })
      );
    } catch (_) {}
  }
  await _lcSet({ [LIC_STORE_KEY]: null });
}

// Open the hosted LemonSqueezy checkout in a new tab.
function openUpgrade(plan) {
  const url = (plan && CHECKOUT[plan]) || DEFAULT_CHECKOUT;
  if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
  else window.open(url, "_blank", "noopener");
}
