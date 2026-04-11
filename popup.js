// Find Me People - Popup Script

document.addEventListener("DOMContentLoaded", async () => {
  const contentEl = document.getElementById("content");
  const siteEl = document.getElementById("site-url");

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || tab.url.startsWith("chrome://")) {
    siteEl.textContent = "Not available on this page";
    contentEl.innerHTML = '<div class="empty"><strong>Can\'t scan this page</strong><br>Navigate to a website to find contact info.</div>';
    return;
  }

  siteEl.textContent = new URL(tab.url).hostname;

  // Request scan results from content script
  try {
    chrome.tabs.sendMessage(tab.id, { action: "getContacts" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        // Content script not loaded -- inject and retry
        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, files: ["content.js"] },
          () => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { action: "getContacts" }, (r) => {
                if (r) renderResults(r);
                else renderEmpty();
              });
            }, 500);
          }
        );
        return;
      }
      renderResults(response);
    });
  } catch (e) {
    renderEmpty();
  }

  function renderResults(data) {
    const emails = data.emails || [];
    const phones = data.phones || [];
    const links = data.links || [];
    const total = emails.length + phones.length;

    let html = "";

    // Status bar
    if (total > 0) {
      html += `<div class="status"><span class="dot dot-green"></span> Found ${total} contact${total > 1 ? "s" : ""} on this page</div>`;
    } else if (links.length > 0) {
      html += `<div class="status"><span class="dot dot-yellow"></span> No direct contacts found, but support pages detected</div>`;
    } else {
      html += `<div class="status"><span class="dot dot-red"></span> No contacts found on this page</div>`;
    }

    html += '<div class="scroll">';

    // Emails
    if (emails.length > 0) {
      html += '<div class="section"><div class="section-title">Email</div>';
      emails.slice(0, 8).forEach((e) => {
        const scoreClass = e.score >= 70 ? "score-high" : e.score >= 40 ? "score-mid" : "score-low";
        const scoreLabel = e.score >= 70 ? "Likely support" : e.score >= 40 ? "Possible" : "Low match";
        html += `
          <div class="contact-item" onclick="copyToClipboard('${e.value}')">
            <div class="value">${e.value}</div>
            <div class="meta">
              <span>Click to copy</span>
              <span class="score ${scoreClass}">${scoreLabel}</span>
            </div>
          </div>`;
      });
      html += "</div>";
    }

    // Phones
    if (phones.length > 0) {
      html += '<div class="section"><div class="section-title">Phone</div>';
      phones.slice(0, 6).forEach((p) => {
        const scoreClass = p.score >= 70 ? "score-high" : p.score >= 40 ? "score-mid" : "score-low";
        const scoreLabel = p.score >= 70 ? "Likely support" : p.score >= 40 ? "Possible" : "Low match";
        html += `
          <div class="contact-item" onclick="copyToClipboard('${p.value}')">
            <div class="value">${p.value}</div>
            <div class="meta">
              <span>Click to copy</span>
              <span class="score ${scoreClass}">${scoreLabel}</span>
            </div>
          </div>`;
      });
      html += "</div>";
    }

    // Contact page links
    if (links.length > 0) {
      html += '<div class="section"><div class="section-title">Support Pages</div>';
      links.slice(0, 5).forEach((l) => {
        html += `<a class="link-item" href="${l.url}" target="_blank">
          ${l.text || "Contact Page"}
          <div class="link-label">${new URL(l.url).pathname}</div>
        </a>`;
      });
      html += "</div>";
    }

    // Empty state
    if (total === 0 && links.length === 0) {
      html += `<div class="empty">
        <strong>No contacts detected</strong><br>
        This site may hide its contact info. Try checking their footer, "About" page, or searching "[company name] customer service" online.
      </div>`;
    }

    html += "</div>";

    // Rescan button
    html += '<button class="rescan-btn" id="rescan-btn">Rescan this page</button>';

    contentEl.innerHTML = html;

    document.getElementById("rescan-btn").addEventListener("click", () => {
      contentEl.innerHTML = '<div class="scanning"><div class="spinner"></div><p>Rescanning...</p></div>';
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["content.js"] },
        () => {
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: "getContacts" }, (r) => {
              if (r) renderResults(r);
              else renderEmpty();
            });
          }, 500);
        }
      );
    });
  }

  function renderEmpty() {
    contentEl.innerHTML = `<div class="empty">
      <strong>Couldn't scan this page</strong><br>
      The page may still be loading or may block extensions.
    </div>`;
  }
});

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  const el = document.getElementById("copied");
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1500);
}
