// Find Me People - Background Service Worker
// Manages badge count and tab-level state

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "updateBadge" && sender.tab) {
    const count = msg.count || 0;
    const text = count > 0 ? String(count) : "";
    const color = count > 0 ? "#a78bfa" : "#52525b";

    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color, tabId: sender.tab.id });
  }
});
