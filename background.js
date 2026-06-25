// Find Me People - Background Service Worker
// Manages badge count and tab-level state

// Load the Pro entitlement engine (license.js) into this worker so the keyboard
// shortcut reuses the EXACT same isPro() gate as the popup — one source of
// truth. Chrome's service worker loads it via importScripts; Firefox already
// has it via background.scripts (see manifest), so guard against double-load.
if (typeof isPro === "undefined") {
  try { importScripts("license.js"); } catch (_) {}
}

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

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "updateBadge" && sender.tab) {
    const count = msg.count || 0;
    const text = count > 0 ? String(count) : "";
    const color = count > 0 ? "#a78bfa" : "#52525b";

    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color, tabId: sender.tab.id });
  }
});

// Keyboard shortcut (Pro): copy all contacts on the active page in 0 clicks.
// Reuses the content script's existing scan results; gated by isPro() — free
// users get an upsell toast instead of the copy.
if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command !== "copy-all-contacts") return;
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) return;
      let pro = true;
      try { pro = typeof isPro === "function" ? await isPro() : true; } catch (_) {}
      const action = pro ? "copyAllContacts" : "proUpsell";
      const send = () =>
        chrome.tabs.sendMessage(tab.id, { action }, () => void chrome.runtime.lastError);
      // content.js is auto-injected on <all_urls>, but inject + retry for pages
      // that loaded before the extension was installed/updated.
      chrome.tabs.sendMessage(tab.id, { action }, () => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript(
            { target: { tabId: tab.id }, files: ["content.js"] },
            () => { if (!chrome.runtime.lastError) send(); }
          );
        }
      });
    });
  });
}
