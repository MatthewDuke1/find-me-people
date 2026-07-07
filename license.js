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
const PRO_ENFORCED = false; // <-- flip to true when the LemonSqueezy store is live
const VALIDATE_EVERY_MS = 24 * 60 * 60 * 1000; // re-check at most daily

// Your LemonSqueezy hosted checkout links (fill in after creating the products).
const CHECKOUT = {
  monthly: "https://REPLACE_STORE.lemonsqueezy.com/buy/REPLACE_MONTHLY_ID",
  annual: "https://REPLACE_STORE.lemonsqueezy.com/buy/REPLACE_ANNUAL_ID",
  lifetime: "https://REPLACE_STORE.lemonsqueezy.com/buy/REPLACE_LIFETIME_ID",
};
// Which checkout the "Upgrade to Pro" button opens by default.
const DEFAULT_CHECKOUT = CHECKOUT.lifetime;

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
      error: (r && r.error) || "That license key couldn't be activated.",
    };
  } catch (_) {
    return { ok: false, error: "Network error — try again." };
  }
}

// Is this install entitled to Pro? Cheap + offline-tolerant: trusts the cached
// flag for VALIDATE_EVERY_MS, then re-validates against LemonSqueezy (which
// reflects subscription lapse / refund). Network failure never locks out a
// paying user.
async function isPro() {
  if (!PRO_ENFORCED) return true; // store not live yet — everyone is Pro
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
