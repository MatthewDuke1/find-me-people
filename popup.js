// Sula - Popup Script

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

// ---- Draft the First Touch (Pro) ----------------------------------------
// One-click personalized outreach: fills an outreach template with the page's
// company + the user's saved sender profile, then opens it pre-written in the
// chosen mail client. 100% local — no LLM/API, nothing leaves the browser.
const OUTREACH_TEMPLATES = [
  {
    id: "cold-intro", label: "Cold intro",
    subject: "Quick intro — {senderName} × {company}",
    body: [
      "Hi,", "",
      "I came across {company} and wanted to reach out. {senderPitch}", "",
      "Would you be open to a quick chat to see if there's a fit? Happy to work around your schedule.", "",
      "Best,", "{senderName}",
    ].join("\n"),
  },
  {
    id: "partnership", label: "Partnership",
    subject: "Partnership idea for {company}",
    body: [
      "Hi,", "",
      "I'm {senderName}. {senderPitch}", "",
      "I think there's a strong partnership opportunity with {company} — would you be open to exploring it?", "",
      "Best,", "{senderName}",
    ].join("\n"),
  },
  {
    id: "recruit", label: "Recruiting",
    subject: "Opportunity — saw your work at {company}",
    body: [
      "Hi,", "",
      "I came across your work at {company} and was impressed. {senderPitch}", "",
      "I'm reaching out about an opportunity I think you'd be a great fit for — open to a quick conversation?", "",
      "Best,", "{senderName}",
    ].join("\n"),
  },
  {
    id: "follow-up", label: "Follow-up",
    subject: "Following up — {company}",
    body: [
      "Hi,", "",
      "Just following up on my note about {company} — I know inboxes get busy.", "",
      "{senderPitch}", "",
      "Would a short call next week work? Happy to send a couple of times.", "",
      "Best,", "{senderName}",
    ].join("\n"),
  },
];

const SENDER_KEY = "fmp_sender_profile";
function getSenderProfile() {
  try { const s = localStorage.getItem(SENDER_KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; }
}
function setSenderProfile(p) {
  try { localStorage.setItem(SENDER_KEY, JSON.stringify(p)); } catch (_) {}
}

// Best-guess company name from the page host (acme.com -> "Acme"). Local only.
function companyFromHost(host) {
  const p = String(host || "").replace(/^www\./, "").split(".").filter(Boolean);
  if (!p.length) return "your company";
  let i = p.length - 2;
  if (i > 0 && ["co", "com", "org", "net", "gov", "ac", "edu"].includes(p[p.length - 2])) i = p.length - 3;
  const label = p[Math.max(0, i)] || p[0];
  return label.replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function fillTemplate(s, vars) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}

// Build the personalized draft and open it pre-filled in the chosen mail client.
function draftOutreach(to, tplId, pageHost) {
  const tpl = OUTREACH_TEMPLATES.find((t) => t.id === tplId) || OUTREACH_TEMPLATES[0];
  const profile = getSenderProfile() || { name: "", pitch: "" };
  const vars = {
    company: companyFromHost(pageHost),
    senderName: profile.name || "[Your name]",
    senderPitch: profile.pitch || "",
  };
  const client = EMAIL_CLIENTS.find((c) => c.id === getSelectedClient()) || EMAIL_CLIENTS[0];
  openUrl(client.buildUrl({ to, subject: fillTemplate(tpl.subject, vars), body: fillTemplate(tpl.body, vars) }));
  showToast("Draft opened in " + client.name);
}

// One-time inline capture of the sender profile (name + one-line pitch), shown
// in the contact's compose panel the first time they draft outreach.
function showSenderProfileForm(btn, onDone) {
  const panel = btn.closest(".actions-panel") || btn.parentElement;
  if (!panel) { onDone(); return; }
  if (panel.querySelector(".sender-form")) return;
  const form = document.createElement("div");
  form.className = "sender-form";
  form.innerHTML =
    '<div class="sender-hint">One-time: personalize your drafts</div>' +
    '<input class="sender-name" type="text" placeholder="Your name" autocomplete="off" />' +
    '<input class="sender-pitch" type="text" placeholder="One line about you / what you offer" autocomplete="off" />' +
    '<button class="sender-save">Save &amp; draft</button>';
  panel.appendChild(form);
  const nameEl = form.querySelector(".sender-name");
  nameEl.focus();
  form.querySelector(".sender-save").addEventListener("click", () => {
    const name = form.querySelector(".sender-name").value.trim();
    const pitch = form.querySelector(".sender-pitch").value.trim();
    if (!name) { nameEl.focus(); return; }
    setSenderProfile({ name, pitch });
    form.remove();
    onDone();
  });
}

function toE164(phone) {
  let s = String(phone).replace(/[^\d+]/g, "");
  if (s.startsWith("+")) return s;
  if (s.length === 10) return "+1" + s;
  if (s.length === 11 && s.startsWith("1")) return "+" + s;
  return "+" + s;
}

// Contact history -- kept in chrome.storage.local so it survives popup
// reopens, browser restarts, and is shared with the side panel. Capped at 50
// most-recent entries; same value re-copied bubbles to the top.
const HISTORY_KEY = "fmp_history";
const HISTORY_MAX = 50;

function getHistory(cb) {
  if (!chrome.storage || !chrome.storage.local) return cb([]);
  chrome.storage.local.get([HISTORY_KEY], (r) => cb(Array.isArray(r[HISTORY_KEY]) ? r[HISTORY_KEY] : []));
}
function addToHistory(entry) {
  if (!chrome.storage || !chrome.storage.local) return;
  if (!entry || !entry.value) return;
  getHistory((hist) => {
    const filtered = hist.filter((e) => e.value !== entry.value);
    filtered.unshift({ ...entry, timestamp: Date.now() });
    if (filtered.length > HISTORY_MAX) filtered.length = HISTORY_MAX;
    chrome.storage.local.set({ [HISTORY_KEY]: filtered });
  });
}
function clearHistory(cb) {
  if (!chrome.storage || !chrome.storage.local) return cb && cb();
  chrome.storage.local.set({ [HISTORY_KEY]: [] }, cb);
}
function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 86400 * 7) return Math.floor(s / 86400) + "d ago";
  return Math.floor(s / (86400 * 7)) + "w ago";
}

// ---- Export (CSV + vCard) -----------------------------------------------
// Turn found/saved contacts into downloadable files. Entirely local: a Blob
// + anchor click, so no `downloads` permission is needed. CSV is for
// spreadsheets/CRMs; vCard (.vcf) imports straight into phone/Google/Outlook
// contacts. Both group nothing the user didn't already see on the page.

function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function safeName(s) {
  return String(s || "page").replace(/[^a-z0-9.-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "page";
}

function confidenceLabel(score) {
  const n = Number(score) || 0;
  return n >= 70 ? "Likely support" : n >= 40 ? "Possible" : "Low match";
}

// ---- Email-quality triage (local, no verification API) -------------------
// The #1 complaint about paid contact tools is bouncing/low-quality data. We
// can't (and won't) SMTP-verify — that needs a server and breaks "100% local."
// Instead we flag the quality signals readable from the address ITSELF, so the
// user can triage before they reach out: a direct work address > a personal
// free-mail > a role inbox (info@, lower response) > a disposable/junk domain.
const FMP_FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com",
  "hotmail.co.uk", "outlook.com", "live.com", "msn.com", "aol.com", "icloud.com",
  "me.com", "mac.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com",
  "mail.com", "yandex.com", "yahoo.co.uk",
]);
const FMP_DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwawaymail.com", "yopmail.com", "getnada.com", "nada.email",
  "trashmail.com", "sharklasers.com", "dispostable.com", "maildrop.cc",
  "fakeinbox.com", "mintemail.com", "mohmal.com", "tempr.email", "discard.email",
]);
const FMP_ROLE_LOCALPARTS = new Set([
  "info", "support", "sales", "admin", "contact", "hello", "team", "help",
  "office", "billing", "accounts", "careers", "jobs", "hr", "press", "media",
  "marketing", "noreply", "no-reply", "donotreply", "do-not-reply", "webmaster",
  "postmaster", "enquiries", "inquiries", "general", "mail", "abuse", "privacy",
]);
function emailQuality(email) {
  const e = String(email || "").trim().toLowerCase();
  const m = e.match(/^([^@\s]+)@([^@\s]+\.[a-z]{2,})$/i);
  if (!m) return { label: "Check format", tone: "warn" };
  const local = m[1];
  const domain = m[2];
  if (/\.\.|^\.|\.$/.test(local)) return { label: "Check format", tone: "warn" };
  if (FMP_DISPOSABLE.has(domain)) return { label: "Disposable", tone: "bad" };
  if (FMP_ROLE_LOCALPARTS.has(local.replace(/\+.*/, ""))) return { label: "Role inbox", tone: "warn" };
  if (FMP_FREE_MAIL.has(domain)) return { label: "Personal", tone: "ok" };
  return { label: "Direct", tone: "good" }; // named local-part @ a real domain
}

// ---- Provenance / freshness (counters the "stale data" complaint) ---------
// FMP reads the LIVE page, so every contact is "found here, just now" — the
// structural opposite of a months-old database scrape. We surface WHERE on the
// page each contact came from (its scan source) as a visible trust signal.
const FMP_SOURCE_LABEL = {
  mailto: "mailto link", "iframe-mailto": "mailto link",
  tel: "tel link", "iframe-tel": "tel link", sms: "sms link",
  address: "address tag", "json-ld": "structured data", microdata: "structured data",
  meta: "page meta", footer: "footer", "form-value": "form field",
  aria: "aria label", "data-attr": "data attribute", cf: "decoded",
  noscript: "noscript", "inline-script": "page script", globals: "page data",
  shadow: "web component", press: "press contact", "site-override": "verified page",
  sitemap: "sitemap", "discovered-page": "contact page", fetch: "contact page",
  text: "page text", "zendesk-kb": "help center",
};
function provenanceLabel(source) {
  const key = String(source || "").replace(/:$/, "");
  return FMP_SOURCE_LABEL[key] || "this page";
}

// Build a flat contact list from a content-script scan response.
function normalizeScanContacts(data, hostname) {
  const out = [];
  const stamp = todayStamp();
  (data.emails || []).forEach((e) => out.push({ type: "email", value: e.value, score: e.score, hostname, date: stamp }));
  (data.phones || []).forEach((p) => out.push({ type: "phone", value: p.value, score: p.score, hostname, date: stamp }));
  return out;
}

// Build the same flat list from saved history entries.
function historyToContacts(hist) {
  return (hist || [])
    .filter((e) => e && (e.type === "email" || e.type === "phone"))
    .map((e) => ({
      type: e.type,
      value: e.value,
      score: e.score,
      hostname: e.hostname || "",
      date: e.timestamp ? new Date(e.timestamp).toISOString().slice(0, 10) : "",
    }));
}

// --- CSV ---
function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function contactsToCsv(contacts) {
  const header = ["Type", "Value", "Score", "Confidence", "Source", "Found"];
  const rows = [header.map(csvCell).join(",")];
  contacts.forEach((c) => {
    rows.push([
      c.type,
      c.value,
      c.score != null ? c.score : "",
      confidenceLabel(c.score),
      c.hostname || "",
      c.date || "",
    ].map(csvCell).join(","));
  });
  // BOM so Excel renders accented characters; CRLF for spreadsheet friendliness.
  return "﻿" + rows.join("\r\n") + "\r\n";
}

// --- vCard 3.0 (grouped by domain so each company is one importable card) ---
function vEsc(s) {
  return (s == null ? "" : String(s))
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
function contactsToVCard(contacts) {
  const byOrg = new Map();
  contacts.forEach((c) => {
    const org = c.hostname || "Unknown";
    if (!byOrg.has(org)) byOrg.set(org, { emails: [], phones: [] });
    const g = byOrg.get(org);
    if (c.type === "email" && c.value) g.emails.push(c.value);
    else if (c.type === "phone" && c.value) g.phones.push(toE164(c.value));
  });
  const cards = [];
  byOrg.forEach((g, org) => {
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:" + vEsc(org + " (support)"),
      "ORG:" + vEsc(org),
    ];
    Array.from(new Set(g.emails)).forEach((e) => lines.push("EMAIL;TYPE=INTERNET:" + vEsc(e)));
    Array.from(new Set(g.phones)).forEach((p) => lines.push("TEL;TYPE=VOICE:" + vEsc(p)));
    lines.push("NOTE:" + vEsc("Found via Sula — " + org));
    lines.push("END:VCARD");
    cards.push(lines.join("\r\n"));
  });
  return cards.join("\r\n") + "\r\n";
}

// Trigger a client-side download. Blob + anchor click works in MV3 popups and
// needs no extra permission (unlike chrome.downloads).
function downloadFile(filename, mimeType, text) {
  const blob = new Blob([text], { type: mimeType + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a beat so the download isn't cancelled mid-flight.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Lightweight toast reusing the existing #copied element (defaults back to the
// "Copied to clipboard" label so copy actions are unaffected).
function showToast(msg) {
  const el = document.getElementById("copied");
  if (!el) return;
  el.textContent = msg || "Copied to clipboard";
  el.classList.add("show");
  setTimeout(() => {
    el.classList.remove("show");
    el.textContent = "Copied to clipboard";
  }, 1600);
}

// ---- Send to Webhook / CRM (Pro) ----------------------------------------
// POST the found contacts as JSON to a user-saved webhook URL so a single
// click pushes a page's contacts straight into Zapier / Make / HubSpot (or
// any endpoint that accepts a JSON body). The URL lives in
// chrome.storage.local under WEBHOOK_KEY; first use with nothing saved opens
// a small inline input row (window.prompt is blocked in MV3 popups).

const WEBHOOK_KEY = "fmp_webhook"; // chrome.storage.local

function getWebhookUrl() {
  return new Promise((res) => {
    if (!chrome.storage || !chrome.storage.local) return res("");
    chrome.storage.local.get([WEBHOOK_KEY], (r) => res(typeof r[WEBHOOK_KEY] === "string" ? r[WEBHOOK_KEY] : ""));
  });
}
function setWebhookUrl(url) {
  return new Promise((res) => {
    if (!chrome.storage || !chrome.storage.local) return res();
    chrome.storage.local.set({ [WEBHOOK_KEY]: url }, res);
  });
}

// Only accept http(s) endpoints — protects against pasting junk and keeps the
// POST to something a CRM/automation tool can actually receive.
function isValidWebhookUrl(url) {
  try {
    const u = new URL(String(url).trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (_) {
    return false;
  }
}

// Shape the payload Zapier/Make/HubSpot-style endpoints expect: a top-level
// object with metadata + a contacts array (each tagged with its source host).
function buildWebhookPayload(contacts, hostname) {
  return {
    source: "Sula",
    hostname: hostname || "",
    exportedAt: new Date().toISOString(),
    count: contacts.length,
    contacts: contacts.map((c) => ({
      type: c.type,
      value: c.value,
      score: c.score != null ? c.score : null,
      confidence: confidenceLabel(c.score),
      hostname: c.hostname || hostname || "",
      foundAt: c.date || "",
    })),
  };
}

// POST contacts to the saved webhook. Returns { ok } or { ok:false, error }.
// Uses no-cors-incompatible JSON, but host_permissions <all_urls> means the
// request is a normal CORS fetch — most automation webhooks return 200 with
// permissive CORS; if one doesn't, the opaque/failed response surfaces as an
// error toast rather than a silent success.
async function sendToWebhook(url, contacts, hostname) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildWebhookPayload(contacts, hostname)),
    });
    if (r && (r.ok || (r.status >= 200 && r.status < 300))) return { ok: true };
    return { ok: false, error: `Webhook returned ${r ? r.status : "no response"}` };
  } catch (_) {
    return { ok: false, error: "Couldn't reach that webhook URL" };
  }
}

// ---- Pro / LemonSqueezy gating ------------------------------------------
// isPro / openUpgrade / activateLicense / deactivateLicense / PRO_ENFORCED are
// globals from license.js (loaded before popup.js). With PRO_ENFORCED=false,
// isPro() always resolves true, so these are no-ops until the store goes live.

// Returns true if the user may export; otherwise nudges to upgrade.
async function gateExport() {
  try {
    if (await isPro()) return true;
  } catch (_) {
    return true; // never block on a licensing error
  }
  showToast("Export is a Pro feature");
  if (typeof openUpgrade === "function") openUpgrade();
  return false;
}

// Render the upgrade/activate footer -- only when licensing is enforced, so
// nothing shows during soft-launch.
async function renderProFooter() {
  const el = document.getElementById("pro-footer");
  if (!el || typeof PRO_ENFORCED === "undefined" || !PRO_ENFORCED) return;
  let pro = false;
  try { pro = await isPro(); } catch (_) {}
  if (pro) {
    el.innerHTML =
      '<div class="pro-row"><span class="pro-label"><span class="bolt">&#9889;</span> Sula <span class="pro-pill on">PRO</span></span>' +
      '<button class="pro-manage" id="pro-deactivate">Deactivate</button></div>';
    const d = document.getElementById("pro-deactivate");
    if (d) d.addEventListener("click", async () => { await deactivateLicense(); renderProFooter(); });
    return;
  }
  el.innerHTML =
    '<div class="pro-row"><span class="pro-label"><span class="bolt">&#9889;</span> Unlock Pro &mdash; export &amp; more</span>' +
    '<button class="pro-cta" id="pro-upgrade">Upgrade</button></div>' +
    '<div class="pro-activate"><input id="pro-key" type="text" placeholder="Paste license key" autocomplete="off" />' +
    '<button id="pro-activate-btn">Activate</button></div>' +
    '<div class="pro-msg" id="pro-msg"></div>';
  document.getElementById("pro-upgrade").addEventListener("click", () => openUpgrade());
  document.getElementById("pro-activate-btn").addEventListener("click", async () => {
    const msg = document.getElementById("pro-msg");
    const key = document.getElementById("pro-key").value;
    msg.textContent = "Activating…"; msg.className = "pro-msg";
    const r = await activateLicense(key);
    if (r.ok) { msg.textContent = "Activated — Pro unlocked."; msg.className = "pro-msg ok"; setTimeout(renderProFooter, 900); }
    else { msg.textContent = r.error; msg.className = "pro-msg err"; }
  });
}

// Build and trigger a .vcf download for a SINGLE email or phone contact -- the
// per-row "Save .vcf" button. Complements the bulk CSV/vCard export above
// (that saves everything at once; this saves one contact). vCard 3.0 imports
// into every native Contacts app and major mail client; CRLF-joined per RFC 6350.
function buildEmailVCard(email, org) {
  const fn = org ? `${org} Support` : email;
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${fn}`,
    org ? `ORG:${org}` : null,
    `EMAIL;TYPE=WORK:${email}`,
    "END:VCARD",
  ].filter(Boolean).join("\r\n") + "\r\n";
}
function buildPhoneVCard(displayPhone, e164, org) {
  const fn = org ? `${org} Support` : displayPhone;
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${fn}`,
    org ? `ORG:${org}` : null,
    `TEL;TYPE=WORK,VOICE:${e164}`,
    "END:VCARD",
  ].filter(Boolean).join("\r\n") + "\r\n";
}
function vCardFilename(org, label) {
  const safe = (org || "contact").replace(/[^\w.-]+/g, "_").toLowerCase();
  return `${safe}-${label}.vcf`;
}
function downloadVCard(content, filename) {
  const blob = new Blob([content], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
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
      <div class="review-toast-title"><span class="star">&#9733;</span> Enjoying Sula?</div>
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

  // Pro upgrade/activate footer (no-op visually until license.js PRO_ENFORCED).
  if (typeof renderProFooter === "function") renderProFooter();

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

  // View tab switching (On this page <-> History). The "now" view is the
  // existing scan render; "history" lazy-renders from chrome.storage.local
  // whenever the tab is selected (cheap, history is < 50 entries).
  document.querySelectorAll(".view-tab").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      document.querySelectorAll(".view-tab").forEach((b) => b.classList.toggle("active", b === tabBtn));
      const v = tabBtn.dataset.view;
      if (v === "history") renderHistoryView();
      else if (v === "now" && window._lastScanResults) renderResults(window._lastScanResults);
    });
  });

  function renderHistoryView(filter) {
    getHistory((hist) => {
      const q = (filter || "").trim().toLowerCase();
      const matched = q
        ? hist.filter((e) => (e.value + " " + (e.hostname || "")).toLowerCase().includes(q))
        : hist;
      let html = `<input class="history-search" id="history-search" type="search" placeholder="Search history (${hist.length})" value="${escapeHtml(filter || "")}" />`;
      html += '<div class="history-list">';
      if (matched.length === 0) {
        html += `<div class="history-empty">${hist.length === 0 ? "No copied contacts yet. Click any contact above to save it here." : "No matches."}</div>`;
      } else {
        matched.forEach((e) => {
          const v = escapeHtml(e.value);
          html += `
            <div class="history-item" data-copy="${v}" data-copy-type="${e.type}" data-copy-score="${e.score || 0}">
              <div class="history-row1">
                <span class="history-value">${v}</span>
                <span class="history-when">${timeAgo(e.timestamp)}</span>
              </div>
              <div class="history-row2">
                <span class="history-type">${e.type}</span>
                <span>${escapeHtml(e.hostname || "")}</span>
              </div>
            </div>`;
        });
      }
      html += "</div>";
      if (hist.length > 0) {
        html += `<div class="history-footer">
          <button class="history-export" data-export-history="csv">Export CSV</button>
          <button class="history-export" data-export-history="vcard">Export vCard</button>
          <button class="history-clear" id="history-clear">Clear history</button>
        </div>`;
      }
      contentEl.innerHTML = html;
      // Wire search box (re-render on input, preserving focus across re-renders)
      const search = document.getElementById("history-search");
      if (search) {
        search.addEventListener("input", () => renderHistoryView(search.value));
        search.focus();
        // Place caret at end
        const v = search.value; search.value = ""; search.value = v;
      }
      // Wire click-to-recopy on each history entry
      contentEl.querySelectorAll("[data-copy]").forEach((el) => {
        el.addEventListener("click", () => {
          const value = el.dataset.copy;
          copyToClipboard(value);
          const type = el.dataset.copyType || "unknown";
          const score = parseInt(el.dataset.copyScore || "0", 10) || 0;
          let host = "";
          try { host = new URL(tab.url).hostname.replace(/^www\./, ""); } catch (_) {}
          if (type === "email" || type === "phone") addToHistory({ value, type, hostname: host, score });
        });
      });
      // Export the full saved history as CSV / vCard.
      contentEl.querySelectorAll("[data-export-history]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!(await gateExport())) return;
          const contacts = historyToContacts(hist);
          if (contacts.length === 0) { showToast("Nothing to export"); return; }
          const base = `sula-history-${todayStamp()}`;
          if (btn.dataset.exportHistory === "csv") {
            downloadFile(`${base}.csv`, "text/csv", contactsToCsv(contacts));
          } else {
            downloadFile(`${base}.vcf`, "text/vcard", contactsToVCard(contacts));
          }
          showToast(`Exported ${contacts.length} contact${contacts.length > 1 ? "s" : ""}`);
        });
      });

      const clearBtn = document.getElementById("history-clear");
      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          if (confirm("Clear all history entries?")) {
            clearHistory(() => renderHistoryView(""));
          }
        });
      }
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
      window._lastScanResults = response;
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
        const q = emailQuality(e.value);
        const provE = provenanceLabel(e.source);
        const tplChips = EMAIL_TEMPLATES.map(
          (t) => `<button class="action-chip" data-template="${t.id}" data-email="${escVal}">${escapeHtml(t.label)}</button>`
        ).join("");
        const outreachChips = OUTREACH_TEMPLATES.map(
          (t) => `<button class="action-chip outreach-chip" data-outreach="${t.id}" data-email="${escVal}">${escapeHtml(t.label)}</button>`
        ).join("");
        html += `
          <div class="contact-item">
            <div class="contact-main" data-copy="${escVal}" data-copy-type="email" data-copy-score="${e.score}">
              <div class="value">${escVal}</div>
              <div class="meta">
                <span class="email-quality q-${q.tone}" title="Email-quality hint (read locally from the address)">${q.label}</span>
                <span class="provenance" title="Found live on this page just now — read from the page, not a stored database">via ${provE}</span>
                <span class="score ${scoreClass}">${scoreLabel}</span>
              </div>
            </div>
            <div class="row-actions">
              <button class="actions-toggle" data-toggle="${id}">Compose <span class="caret">&#9662;</span></button>
              <button class="actions-toggle vcard-btn" data-save-vcard="email" data-value="${escVal}" title="Save as .vcf contact">&#11015; .vcf</button>
            </div>
            <div class="actions-panel" data-panel="${id}">
              <div class="action-chips">${tplChips}</div>
              <div class="outreach-block">
                <div class="outreach-label">&#10022; Draft outreach <span class="pro-tag">PRO</span></div>
                <div class="action-chips">${outreachChips}</div>
              </div>
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
        const provP = provenanceLabel(p.source);
        const voipChips = VOIP_SERVICES.map(
          (s) => `<button class="action-chip" data-voip="${s.id}" data-phone="${escE164}">${escapeHtml(s.name)}</button>`
        ).join("");
        html += `
          <div class="contact-item">
            <div class="contact-main" data-copy="${escVal}" data-copy-type="phone" data-copy-score="${p.score}">
              <div class="value">${escVal}</div>
              <div class="meta">
                <span class="provenance" title="Found live on this page just now — read from the page, not a stored database">via ${provP}</span>
                <span class="score ${scoreClass}">${scoreLabel}</span>
              </div>
            </div>
            <div class="row-actions">
              <button class="actions-toggle" data-toggle="${id}">Call <span class="caret">&#9662;</span></button>
              <button class="actions-toggle vcard-btn" data-save-vcard="phone" data-value="${escVal}" data-e164="${escE164}" title="Save as .vcf contact">&#11015; .vcf</button>
            </div>
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

    // Export bar -- only when there's something to export (emails/phones).
    if (total > 0) {
      html += `
        <div class="export-bar">
          <span class="export-label">Export ${total}</span>
          <button class="export-btn" data-export="csv" title="Download as CSV (spreadsheet)">&#8595; CSV</button>
          <button class="export-btn" data-export="vcard" title="Download as vCard (.vcf) for your contacts app">&#8595; vCard</button>
          <button class="export-btn" data-send-webhook title="Send these contacts to your CRM / Zapier / Make webhook">&#8599; Send to CRM</button>
        </div>
        <div class="webhook-row" id="webhook-row" hidden>
          <input class="webhook-input" id="webhook-input" type="url" inputmode="url" autocomplete="off"
                 placeholder="Paste your CRM / Zapier / Make webhook URL" />
          <button class="webhook-save" id="webhook-save">Save &amp; Send</button>
          <button class="webhook-cancel" id="webhook-cancel" title="Cancel">&times;</button>
        </div>`;
    }

    // Rescan button
    html += '<button class="rescan-btn" id="rescan-btn">Rescan this site</button>';

    contentEl.innerHTML = html;

    // Wire up click-to-copy (inline onclick is blocked by MV3 CSP). Each
    // copy also records the contact into history so the user can find it
    // later via the History view -- no extra UI clutter, just a side effect.
    let hostname = "";
    try { hostname = new URL(tab.url).hostname.replace(/^www\./, ""); } catch (_) {}
    contentEl.querySelectorAll("[data-copy]").forEach((el) => {
      el.addEventListener("click", () => {
        const value = el.dataset.copy;
        copyToClipboard(value);
        const type = el.dataset.copyType || "unknown";
        const score = parseInt(el.dataset.copyScore || "0", 10) || 0;
        if (type === "email" || type === "phone") {
          addToHistory({ value, type, hostname, score });
        }
      });
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

    // Draft outreach (Pro) -> personalized first-touch email pre-filled into the
    // mail client, using the page's company + the user's saved sender profile.
    contentEl.querySelectorAll("[data-outreach]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!(await gateExport())) return;
        const to = btn.dataset.email;
        if (!to) return;
        const run = () => draftOutreach(to, btn.dataset.outreach, pageHost);
        if (!getSenderProfile()) { showSenderProfileForm(btn, run); return; }
        run();
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

    // Save .vcf chip -> build a vCard 3.0 blob and trigger download
    contentEl.querySelectorAll("[data-save-vcard]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const kind = btn.dataset.saveVcard;
        const value = btn.dataset.value;
        let host = "";
        try { host = new URL(tab.url).hostname.replace(/^www\./, ""); } catch (_) {}
        if (kind === "email") {
          downloadVCard(buildEmailVCard(value, host), vCardFilename(host, value.split("@")[0] || "email"));
        } else if (kind === "phone") {
          downloadVCard(buildPhoneVCard(value, btn.dataset.e164 || toE164(value), host), vCardFilename(host, "phone"));
        }
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

    // Export the current page's contacts as CSV / vCard.
    let pageHost = "page";
    try { pageHost = new URL(tab.url).hostname.replace(/^www\./, ""); } catch (_) {}
    contentEl.querySelectorAll("[data-export]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!(await gateExport())) return;
        const contacts = normalizeScanContacts(window._lastScanResults || data, pageHost);
        if (contacts.length === 0) { showToast("Nothing to export"); return; }
        const base = `sula-contacts-${safeName(pageHost)}-${todayStamp()}`;
        if (btn.dataset.export === "csv") {
          downloadFile(`${base}.csv`, "text/csv", contactsToCsv(contacts));
        } else {
          downloadFile(`${base}.vcf`, "text/vcard", contactsToVCard(contacts));
        }
        showToast(`Exported ${contacts.length} contact${contacts.length > 1 ? "s" : ""}`);
      });
    });

    // Send to CRM / webhook -- one click pushes this page's contacts as JSON to
    // a saved endpoint. First use (no URL saved) reveals an inline input row.
    const webhookBtn = contentEl.querySelector("[data-send-webhook]");
    if (webhookBtn) {
      const row = document.getElementById("webhook-row");
      const input = document.getElementById("webhook-input");
      const saveBtn = document.getElementById("webhook-save");
      const cancelBtn = document.getElementById("webhook-cancel");

      const collectContacts = () => normalizeScanContacts(window._lastScanResults || data, pageHost);

      const doSend = async (url) => {
        const contacts = collectContacts();
        if (contacts.length === 0) { showToast("Nothing to send"); return; }
        showToast("Sending to CRM…");
        const r = await sendToWebhook(url, contacts, pageHost);
        if (r.ok) showToast(`Sent ${contacts.length} contact${contacts.length > 1 ? "s" : ""} to CRM`);
        else showToast(r.error || "Send failed");
      };

      webhookBtn.addEventListener("click", async () => {
        if (!(await gateExport())) return;
        if (collectContacts().length === 0) { showToast("Nothing to send"); return; }
        const saved = await getWebhookUrl();
        if (isValidWebhookUrl(saved)) {
          doSend(saved);
        } else {
          // No URL yet -- reveal the inline capture row (prompt() is blocked in MV3).
          if (row) { row.hidden = false; if (input) { input.value = saved || ""; input.focus(); } }
        }
      });

      if (saveBtn) {
        const saveAndSend = async () => {
          const url = (input && input.value || "").trim();
          if (!isValidWebhookUrl(url)) { showToast("Enter a valid http(s) URL"); return; }
          await setWebhookUrl(url);
          if (row) row.hidden = true;
          doSend(url);
        };
        saveBtn.addEventListener("click", saveAndSend);
        if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") saveAndSend(); });
      }
      if (cancelBtn) cancelBtn.addEventListener("click", () => { if (row) row.hidden = true; });
    }

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
  showToast("Copied to clipboard");
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
