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

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "updateBadge" && sender.tab) {
    const count = msg.count || 0;
    const text = count > 0 ? String(count) : "";
    const color = count > 0 ? "#60a5fa" : "#52525b";

    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color, tabId: sender.tab.id });
  }
});
