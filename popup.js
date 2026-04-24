// Find Me People - Popup Script

document.addEventListener("DOMContentLoaded", async () => {
  const contentEl = document.getElementById("content");
  const siteEl = document.getElementById("site-url");

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const RESTRICTED_PROTOCOLS = ["chrome://", "about:", "moz-extension://", "chrome-extension://", "resource://", "view-source:"];
  if (!tab || !tab.url || RESTRICTED_PROTOCOLS.some((p) => tab.url.startsWith(p))) {
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
    const hours = data.hours || [];
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

    // Hours banner (right after status)
    html += renderHoursBanner(hours);

    html += '<div class="scroll">';

    // Emails
    if (emails.length > 0) {
      html += '<div class="section"><div class="section-title">Email</div>';
      emails.slice(0, 8).forEach((e) => {
        const scoreClass = e.score >= 70 ? "score-high" : e.score >= 40 ? "score-mid" : "score-low";
        const scoreLabel = e.score >= 70 ? "Likely support" : e.score >= 40 ? "Possible" : "Low match";
        html += `
          <div class="contact-item" data-copy="${escapeHtml(e.value)}">
            <div class="value">${escapeHtml(e.value)}</div>
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
          <div class="contact-item" data-copy="${escapeHtml(p.value)}">
            <div class="value">${escapeHtml(p.value)}</div>
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
        let pathname = "";
        try { pathname = new URL(l.url).pathname; } catch (_) {}
        html += `<a class="link-item" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(l.text || "Contact Page")}
          <div class="link-label">${escapeHtml(pathname)}</div>
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

    // Wire up click-to-copy (inline onclick is blocked by MV3 CSP)
    contentEl.querySelectorAll("[data-copy]").forEach((el) => {
      el.addEventListener("click", () => copyToClipboard(el.dataset.copy));
    });

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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function renderHoursBanner(hours) {
  if (!hours || hours.length === 0) {
    return `
      <div class="hours-banner unknown">
        <div class="pulse"></div>
        <div class="status-text">
          <div class="status-label">Hours not posted</div>
          <div class="status-detail">No business hours detected on this page</div>
        </div>
      </div>`;
  }

  // Determine if currently open
  const now = new Date();
  const todayIdx = now.getDay();
  const todayName = DAY_NAMES[todayIdx].toLowerCase();
  const todayShort = DAY_SHORT[todayIdx].toLowerCase();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let openNow = false;
  let todayHours = null;

  hours.forEach((h) => {
    const display = (h.display || "").toLowerCase();
    const days = (h.days || []).map((d) => String(d).toLowerCase());
    const matchesToday =
      display.includes(todayName) ||
      display.includes(todayShort) ||
      days.some((d) => d.includes(todayShort) || d.includes(todayName));

    if (matchesToday && !todayHours) {
      todayHours = h.display;
      // Try to parse open/close to determine if currently open
      if (h.opens && h.closes) {
        const openMin = parseTimeToMinutes(h.opens);
        const closeMin = parseTimeToMinutes(h.closes);
        if (openMin !== null && closeMin !== null) {
          if (currentMinutes >= openMin && currentMinutes < closeMin) openNow = true;
        }
      }
    }
  });

  // Fallback: if no today match, use first entry
  if (!todayHours) todayHours = hours[0].display;

  const bannerClass = openNow ? "open" : todayHours ? "closed" : "unknown";
  const statusLabel = openNow ? "Open Now" : "Closed Now";
  const detail = todayHours ? `Today: ${todayHours}` : "Hours not detected for today";

  let html = `
    <div class="hours-banner ${bannerClass}">
      <div class="pulse"></div>
      <div class="status-text">
        <div class="status-label">${statusLabel}</div>
        <div class="status-detail">${escapeHtml(detail)}</div>
      </div>
    </div>`;

  // Full hours list (deduped)
  if (hours.length > 1) {
    const seen = new Set();
    const rows = [];
    hours.forEach((h) => {
      if (!seen.has(h.display)) {
        seen.add(h.display);
        const isToday =
          (h.display || "").toLowerCase().includes(todayName) ||
          (h.display || "").toLowerCase().includes(todayShort);
        rows.push({ display: h.display, isToday });
      }
    });

    html += '<div class="hours-list">';
    rows.slice(0, 7).forEach((r) => {
      const parts = r.display.split(/:\s+/);
      const day = parts[0] || r.display;
      const time = parts.slice(1).join(": ") || "";
      html += `<div class="hours-row${r.isToday ? " today" : ""}">
        <span class="day">${escapeHtml(day)}</span>
        <span>${escapeHtml(time)}</span>
      </div>`;
    });
    html += "</div>";
  }

  return html;
}

function parseTimeToMinutes(t) {
  if (!t) return null;
  const s = String(t).trim().toLowerCase();
  // "9am", "9:30pm", "17:00"
  let m = s.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3];
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return h * 60 + min;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
