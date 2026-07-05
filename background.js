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
      `https://find-me-people.com/uninstall.html?v=${encodeURIComponent(version)}`
    );
  } catch (_) {
    // setUninstallURL can be unavailable/throw in rare contexts — non-fatal.
  }
})();

// Rebrand notice gate. Only people updating from a 1.x version ever knew the
// extension as "Find Me People", so only they get the one-time popup notice.
// Fresh installs (reason: "install") and future 2.x -> 2.x updates skip it.
chrome.runtime.onInstalled.addListener((details) => {
  if (
    details.reason === "update" &&
    details.previousVersion &&
    details.previousVersion.startsWith("1.")
  ) {
    chrome.storage.local.set({ sula_rebrand_notice: true });
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "updateBadge" && sender.tab) {
    const count = msg.count || 0;
    const text = count > 0 ? String(count) : "";
    const color = count > 0 ? "#a78bfa" : "#52525b";

    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color, tabId: sender.tab.id });
  }
});
