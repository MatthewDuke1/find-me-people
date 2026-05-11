// Find Me People - Popup Script

// Click-to-call deep links: hand the phone number off to the user's chosen app
const VOIP_SERVICES = [
  { id: "tel",      name: "Phone",        buildUrl: (e164) => `tel:${e164}` },
  { id: "whatsapp", name: "WhatsApp",     buildUrl: (e164) => `https://wa.me/${e164.replace(/^\+/, "")}` },
  { id: "gvoice",   name: "Google Voice", buildUrl: (e164) => `https://voice.google.com/u/0/calls?a=nc,${encodeURIComponent(e164)}` },
  { id: "facetime", name: "FaceTime",     buildUrl: (e164) => `facetime-audio:${e164}` },
  { id: "teams",    name: "Teams",        buildUrl: (e164) => `https://teams.microsoft.com/l/call/0/0?users=4:${encodeURIComponent(e164)}` },
];

// Boilerplate composer templates -- subject + body get URL-encoded into the chosen mail client.
// "Blank" is intentionally first so the most common quick action ("just open Gmail with this
// address loaded, I'll write the message myself") is always one click into the Compose panel.
const EMAIL_TEMPLATES = [
  {
    id: "blank",
    label: "Blank",
    subject: "",
    body: "",
  },
  {
    id: "refund",
    label: "Refund",
    subject: "Refund Request",
    body: [
      "Hello,",
      "",
      "I'd like to request a refund for [order number / purchase date].",
      "",
      "Reason: [briefly describe]",
      "",
      "Please let me know what additional information you need to process this. I appreciate your help.",
      "",
      "Thank you,",
      "[Your name]",
    ].join("\n"),
  },
  {
    id: "complaint",
    label: "Complaint",
    subject: "Customer Complaint",
    body: [
      "Hello,",
      "",
      "I'm writing to share a concern about a recent experience with [product/service].",
      "",
      "What happened:",
      "[describe the issue]",
      "",
      "What I'd like to see resolved:",
      "[desired outcome]",
      "",
      "I appreciate your time and look forward to your response.",
      "",
      "Best regards,",
      "[Your name]",
    ].join("\n"),
  },
  {
    id: "cancel",
    label: "Cancel",
    subject: "Cancellation Request",
    body: [
      "Hello,",
      "",
      "I'd like to cancel my [account / subscription / service].",
      "",
      "Account details: [email or account number]",
      "Effective date: [date or \"as soon as possible\"]",
      "",
      "Please confirm the cancellation and let me know if anything further is needed on my end.",
      "",
      "Thank you,",
      "[Your name]",
    ].join("\n"),
  },
  {
    id: "billing",
    label: "Billing",
    subject: "Billing Question",
    body: [
      "Hello,",
      "",
      "I have a question about a charge on my account:",
      "",
      "- Date: [date]",
      "- Amount: [amount]",
      "- Description: [what was charged]",
      "",
      "[Your question or concern]",
      "",
      "Could you please look into this and get back to me?",
      "",
      "Thank you,",
      "[Your name]",
    ].join("\n"),
  },
  {
    id: "support",
    label: "Support",
    subject: "Support Request",
    body: [
      "Hello,",
      "",
      "I'm having an issue I'd appreciate help with.",
      "",
      "What's happening:",
      "[describe]",
      "",
      "What I've already tried:",
      "[any troubleshooting]",
      "",
      "Any guidance would be appreciated.",
      "",
      "Thanks,",
      "[Your name]",
    ].join("\n"),
  },
];

// Default (mailto:) was dropped -- it relied on the OS having a configured
// default mail handler, which most users don't, so the chip looked like it
// did nothing. Two-option universe now: Gmail (default selection) + Outlook.
const EMAIL_CLIENTS = [
  {
    id: "gmail",
    name: "Gmail",
    buildUrl: ({ to, subject, body }) =>
      `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },
  {
    id: "outlook",
    name: "Outlook",
    buildUrl: ({ to, subject, body }) =>
      `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },
];

const CLIENT_STORAGE_KEY = "fmp_email_client";

function getSelectedClient() {
  // Normalize the old "default" value (and any other unrecognized value) to
  // "gmail" so users who saved a preference under the prior 3-option UI land
  // on a working chip instead of seeing no selection.
  try {
    const stored = localStorage.getItem(CLIENT_STORAGE_KEY);
    return stored === "gmail" || stored === "outlook" ? stored : "gmail";
  } catch (_) { return "gmail"; }
}

function setSelectedClient(id) {
  try { localStorage.setItem(CLIENT_STORAGE_KEY, id); } catch (_) {}
}

function toE164(phone) {
  let s = String(phone).replace(/[^\d+]/g, "");
  if (s.startsWith("+")) return s;
  if (s.length === 10) return "+1" + s;
  if (s.length === 11 && s.startsWith("1")) return "+" + s;
  return "+" + s;
}

function openUrl(url) {
  // HTTPS URLs go through chrome.tabs.create -- the official extension API
  // bypasses popup-blocker suppression that silently kills programmatic
  // anchor.click() new-tab opens from MV3 popup contexts. Protocol URIs
  // (mailto:, tel:, facetime-audio:, skype:, etc.) still need an anchor
  // click so the OS protocol handler picks them up; chrome.tabs.create
  // would just open an empty tab pointing at an unhandled URL.
  if (/^https?:\/\//i.test(url)) {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url });
      return;
    }
  }
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Review prompt: persistent footer link + one-time toast after the user
// has demonstrably gotten value (PROMPT_THRESHOLD successful copies).
// Live store URLs -- Chrome listing carries the published extension ID;
// the /reviews suffix lands users directly on the rating tab.
const REVIEW_URLS = {
  chrome:  "https://chromewebstore.google.com/detail/find-me-people/ngfklhkcicocfchdmepiajdmboialikf/reviews",
  firefox: "https://addons.mozilla.org/addon/find-me-people/",
};
const COPY_COUNT_KEY = "fmp_copy_count";
const PROMPT_DISMISSED_KEY = "fmp_review_prompt_dismissed";
const PROMPT_THRESHOLD = 5;

function isFirefox() { return navigator.userAgent.includes("Firefox"); }
function getReviewUrl() { return isFirefox() ? REVIEW_URLS.firefox : REVIEW_URLS.chrome; }

function getCopyCount() {
  try { return parseInt(localStorage.getItem(COPY_COUNT_KEY), 10) || 0; }
  catch (_) { return 0; }
}
function incrementCopyCount() {
  try {
    const n = getCopyCount() + 1;
    localStorage.setItem(COPY_COUNT_KEY, String(n));
    return n;
  } catch (_) { return 0; }
}
function isPromptDismissed() {
  try { return localStorage.getItem(PROMPT_DISMISSED_KEY) === "1"; }
  catch (_) { return true; }
}
function dismissPrompt() {
  try { localStorage.setItem(PROMPT_DISMISSED_KEY, "1"); } catch (_) {}
}
function shouldShowReviewPrompt() {
  return !isPromptDismissed() && getCopyCount() >= PROMPT_THRESHOLD;
}

function renderReviewToastHtml() {
  if (!shouldShowReviewPrompt()) return "";
  return `
    <div class="review-toast" id="review-toast">
      <button class="review-toast-close" data-review-action="dismiss" aria-label="Dismiss">&times;</button>
      <div class="review-toast-title"><span class="star">&#9733;</span> Enjoying Find Me People?</div>
      <div class="review-toast-body">A quick review really helps reach more people who need this.</div>
      <div class="review-toast-actions">
        <button class="review-btn-primary" data-review-action="rate">Rate it</button>
        <button class="review-btn-secondary" data-review-action="dismiss">Not now</button>
      </div>
    </div>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const contentEl = document.getElementById("content");
  const siteEl = document.getElementById("site-url");

  // Always-visible footer link -- target depends on browser
  const rateLink = document.getElementById("rate-link");
  if (rateLink) rateLink.href = getReviewUrl();

  // Side panel master toggle -- persisted to chrome.storage.local so the
  // content scripts on every tab can read it. Default is ON.
  const SP_MASTER_KEY = "fmp_side_panel_enabled";
  const spToggle = document.getElementById("side-panel-toggle");
  if (spToggle && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([SP_MASTER_KEY], (r) => {
      const on = r[SP_MASTER_KEY] !== false;
      spToggle.classList.toggle("on", on);
      spToggle.setAttribute("aria-checked", on ? "true" : "false");
    });
    spToggle.addEventListener("click", () => {
      const willBeOn = !spToggle.classList.contains("on");
      spToggle.classList.toggle("on", willBeOn);
      spToggle.setAttribute("aria-checked", willBeOn ? "true" : "false");
      chrome.storage.local.set({ [SP_MASTER_KEY]: willBeOn });
    });
  }

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
            }, 1500);
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

    // Review prompt toast (renders only after PROMPT_THRESHOLD successful copies)
    html += renderReviewToastHtml();

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
      const currentClient = getSelectedClient();
      html += '<div class="section"><div class="section-title">Email</div>';
      // One client picker for the whole section -- preference persisted across popup opens
      html += '<div class="client-picker"><span class="picker-label">Templates open in</span>';
      EMAIL_CLIENTS.forEach((c) => {
        const sel = c.id === currentClient ? " selected" : "";
        html += `<button class="action-chip${sel}" data-set-client="${c.id}">${escapeHtml(c.name)}</button>`;
      });
      html += "</div>";
      emails.slice(0, 8).forEach((e, idx) => {
        const scoreClass = e.score >= 70 ? "score-high" : e.score >= 40 ? "score-mid" : "score-low";
        const scoreLabel = e.score >= 70 ? "Likely support" : e.score >= 40 ? "Possible" : "Low match";
        const escVal = escapeHtml(e.value);
        const id = `email-${idx}`;
        const tplChips = EMAIL_TEMPLATES.map(
          (t) => `<button class="action-chip" data-template="${t.id}" data-email="${escVal}">${escapeHtml(t.label)}</button>`
        ).join("");
        html += `
          <div class="contact-item">
            <div class="contact-main" data-copy="${escVal}">
              <div class="value">${escVal}</div>
              <div class="meta">
                <span>Click to copy</span>
                <span class="score ${scoreClass}">${scoreLabel}</span>
              </div>
            </div>
            <button class="actions-toggle" data-toggle="${id}">Compose <span class="caret">&#9662;</span></button>
            <div class="actions-panel" data-panel="${id}">
              <div class="action-chips">${tplChips}</div>
            </div>
          </div>`;
      });
      html += "</div>";
    }

    // Phones
    if (phones.length > 0) {
      html += '<div class="section"><div class="section-title">Phone</div>';
      phones.slice(0, 6).forEach((p, idx) => {
        const scoreClass = p.score >= 70 ? "score-high" : p.score >= 40 ? "score-mid" : "score-low";
        const scoreLabel = p.score >= 70 ? "Likely support" : p.score >= 40 ? "Possible" : "Low match";
        const escVal = escapeHtml(p.value);
        const escE164 = escapeHtml(toE164(p.value));
        const id = `phone-${idx}`;
        const voipChips = VOIP_SERVICES.map(
          (s) => `<button class="action-chip" data-voip="${s.id}" data-phone="${escE164}">${escapeHtml(s.name)}</button>`
        ).join("");
        html += `
          <div class="contact-item">
            <div class="contact-main" data-copy="${escVal}">
              <div class="value">${escVal}</div>
              <div class="meta">
                <span>Click to copy</span>
                <span class="score ${scoreClass}">${scoreLabel}</span>
              </div>
            </div>
            <button class="actions-toggle" data-toggle="${id}">Call <span class="caret">&#9662;</span></button>
            <div class="actions-panel" data-panel="${id}">
              <div class="action-chips">${voipChips}</div>
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
    html += '<button class="rescan-btn" id="rescan-btn">Rescan this site</button>';

    contentEl.innerHTML = html;

    // Wire up click-to-copy (inline onclick is blocked by MV3 CSP)
    contentEl.querySelectorAll("[data-copy]").forEach((el) => {
      el.addEventListener("click", () => copyToClipboard(el.dataset.copy));
    });

    // Expand/collapse the Compose / Call action panel under each contact
    contentEl.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.toggle;
        const panel = contentEl.querySelector(`[data-panel="${id}"]`);
        if (panel) {
          panel.classList.toggle("open");
          btn.classList.toggle("open");
        }
      });
    });

    // Email client preference (Default / Gmail / Outlook) -- persisted in localStorage
    contentEl.querySelectorAll("[data-set-client]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.setClient;
        setSelectedClient(id);
        contentEl.querySelectorAll("[data-set-client]").forEach((b) => {
          b.classList.toggle("selected", b.dataset.setClient === id);
        });
      });
    });

    // Compose template chip -> open chosen mail client with subject + body pre-filled
    contentEl.querySelectorAll("[data-template]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const tpl = EMAIL_TEMPLATES.find((t) => t.id === btn.dataset.template);
        const client = EMAIL_CLIENTS.find((c) => c.id === getSelectedClient()) || EMAIL_CLIENTS[0];
        const to = btn.dataset.email;
        if (tpl && to) openUrl(client.buildUrl({ to, subject: tpl.subject, body: tpl.body }));
      });
    });

    // VOIP chip -> open the chosen app/site with the phone number passed in
    contentEl.querySelectorAll("[data-voip]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const svc = VOIP_SERVICES.find((s) => s.id === btn.dataset.voip);
        const phone = btn.dataset.phone;
        if (svc && phone) openUrl(svc.buildUrl(phone));
      });
    });

    // Review toast actions: "Rate it" opens store + dismisses; "Not now" / X just dismisses
    contentEl.querySelectorAll("[data-review-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (btn.dataset.reviewAction === "rate") openUrl(getReviewUrl());
        dismissPrompt();
        const toast = document.getElementById("review-toast");
        if (toast) toast.remove();
      });
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
          }, 1500);
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
  incrementCopyCount();
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
