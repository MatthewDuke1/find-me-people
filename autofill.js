// Sula — Autofill engine (Simplify-style).
//
// Detects the fillable fields on a page, maps each to your saved profile, and
// fills them framework-safely (React/Vue controlled inputs need the native
// value setter + a dispatched input event, or the framework ignores the fill).
// Built for job applications AND consumer-advocacy complaint/refund forms.
//
// The BRAIN — classifyField + buildFillPlan — is pure and fully tested. The DOM
// parts (scan, fill, orchestrate) are browser-only. window.SulaAutofill.
//
// Intentional non-goals (security / correctness):
//   • file inputs (resume upload) are never touched — browsers block
//     programmatic file-setting, and faking it is unsafe.
//   • password fields are skipped.
//   • fields are HIGHLIGHTED after fill so the user reviews before submitting;
//     autofill assists, it never auto-submits.

(() => {
  "use strict";

  // Canonical field keys the classifier emits; each maps to a profile field
  // (fullName is derived from first+last when a dedicated value is absent).
  const PROFILE_KEYS = [
    "firstName", "lastName", "email", "phone",
    "linkedin", "github", "website",
    "addressLine1", "city", "state", "zip", "country",
    "currentCompany", "currentTitle", "yearsExperience", "location",
  ];

  // autocomplete attribute -> key (the most reliable signal when present).
  const AUTOCOMPLETE_MAP = {
    "given-name": "firstName", "family-name": "lastName", "name": "fullName",
    "email": "email", "tel": "phone", "tel-national": "phone", "url": "website",
    "street-address": "addressLine1", "address-line1": "addressLine1",
    "address-level2": "city", "address-level1": "state",
    "postal-code": "zip", "country": "country", "country-name": "country",
    "organization": "currentCompany", "organization-title": "currentTitle",
  };

  // Keyword rules over the combined label/name/id/placeholder/aria text.
  // Order matters: more specific patterns first.
  const KEYWORD_RULES = [
    [/\b(first.?name|given.?name|fname|forename)\b/i, "firstName"],
    [/\b(last.?name|family.?name|surname|lname)\b/i, "lastName"],
    [/\b(full.?name|your name|legal name)\b/i, "fullName"],
    [/linked.?in/i, "linkedin"],
    [/git.?hub/i, "github"],
    [/\b(portfolio|personal (site|website)|website|your url)\b/i, "website"],
    [/\b(e-?mail)\b/i, "email"],
    [/\b(phone|mobile|cell|telephone|\btel\b)\b/i, "phone"],
    [/\b(street|address ?line ?1|address$|mailing address)\b/i, "addressLine1"],
    [/\b(city|town)\b/i, "city"],
    [/\b(state|province|region)\b/i, "state"],
    [/\b(zip|postal ?code|postcode)\b/i, "zip"],
    [/\bcountry\b/i, "country"],
    [/\b(current )?(company|employer)\b/i, "currentCompany"],
    [/\b(job ?title|current title|position|current role)\b/i, "currentTitle"],
    [/\b(years? (of )?experience|yoe)\b/i, "yearsExperience"],
    [/\b(location|where.*(located|based))\b/i, "location"],
    [/\bname\b/i, "fullName"], // generic "name" last, so first/last win
  ];

  // Pure: classify a single field from its metadata. Returns a key or null.
  function classifyField(meta) {
    const m = meta || {};
    const ac = String(m.autocomplete || "").toLowerCase().trim();
    if (ac && AUTOCOMPLETE_MAP[ac]) return AUTOCOMPLETE_MAP[ac];

    const type = String(m.type || "").toLowerCase();
    if (type === "email") return "email";
    if (type === "tel") return "phone";
    if (type === "url") return "website";

    const hay = [m.label, m.name, m.id, m.placeholder, m.ariaLabel]
      .filter(Boolean).join(" ").toLowerCase();
    if (!hay) return null;
    for (const [re, key] of KEYWORD_RULES) if (re.test(hay)) return key;
    return null;
  }

  // Pure: map classified fields -> fill values from the profile.
  // `fields` = [{ idx, key }]. Returns [{ idx, key, value }] (only fillable).
  function buildFillPlan(fields, profile) {
    const p = profile || {};
    const fullName = p.fullName || [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
    const resolve = (key) => (key === "fullName" ? fullName : p[key]);
    const out = [];
    for (const f of fields || []) {
      const value = resolve(f.key);
      if (value != null && String(value).trim() !== "") out.push({ idx: f.idx, key: f.key, value: String(value) });
    }
    return out;
  }

  // --- DOM layer (browser-only) --------------------------------------------

  function labelTextFor(el) {
    // <label for>, wrapping <label>, aria-labelledby, aria-label, placeholder.
    try {
      if (el.labels && el.labels.length) return Array.from(el.labels).map((l) => l.textContent).join(" ");
    } catch (_) {}
    const ll = el.closest("label");
    if (ll) return ll.textContent || "";
    const alb = el.getAttribute && el.getAttribute("aria-labelledby");
    if (alb) {
      const ref = document.getElementById(alb);
      if (ref) return ref.textContent || "";
    }
    return "";
  }

  function fieldMeta(el) {
    return {
      autocomplete: el.getAttribute("autocomplete") || "",
      type: (el.getAttribute("type") || el.tagName).toLowerCase(),
      name: el.getAttribute("name") || "",
      id: el.id || "",
      placeholder: el.getAttribute("placeholder") || "",
      ariaLabel: el.getAttribute("aria-label") || "",
      label: labelTextFor(el),
    };
  }

  function scanFields() {
    if (typeof document === "undefined") return [];
    const out = [];
    document.querySelectorAll("input, textarea, select").forEach((el) => {
      const t = (el.getAttribute("type") || "").toLowerCase();
      if (t === "hidden" || t === "password" || t === "file" || t === "submit" || t === "button" || t === "checkbox" || t === "radio") return;
      if (el.disabled || el.readOnly) return;
      const meta = fieldMeta(el);
      const key = classifyField(meta);
      if (key) out.push({ el, key, meta });
    });
    return out;
  }

  // Framework-safe value set: use the prototype's native setter so React/Vue's
  // value tracking sees the change, then dispatch input + change.
  function fillValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (el instanceof HTMLSelectElement) {
      // Match an option by value, then by visible text.
      let matched = Array.from(el.options).find((o) => o.value.toLowerCase() === value.toLowerCase());
      if (!matched) matched = Array.from(el.options).find((o) => (o.textContent || "").trim().toLowerCase() === value.toLowerCase());
      if (matched) { el.value = matched.value; el.dispatchEvent(new Event("change", { bubbles: true })); return true; }
      return false;
    }
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function highlight(el) {
    try {
      const prev = el.style.boxShadow;
      el.style.transition = "box-shadow .2s";
      el.style.boxShadow = "0 0 0 2px #60a5fa";
      setTimeout(() => { el.style.boxShadow = prev; }, 1400);
    } catch (_) {}
  }

  // Orchestrate: scan -> plan -> fill. Returns a summary for the popup.
  function autofill(profile) {
    const fields = scanFields();
    const plan = buildFillPlan(fields.map((f, i) => ({ idx: i, key: f.key })), profile);
    let filled = 0;
    for (const p of plan) {
      const f = fields[p.idx];
      if (f && fillValue(f.el, p.value)) { highlight(f.el); filled++; }
    }
    return { detected: fields.length, filled, keys: fields.map((f) => f.key) };
  }

  // Preview without filling — what would we recognize on this page?
  function preview() {
    return scanFields().map((f) => f.key);
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _s, send) => {
      if (msg && msg.action === "sula:autofill") { try { send(autofill(msg.profile)); } catch (_) { send({ detected: 0, filled: 0 }); } return true; }
      if (msg && msg.action === "sula:autofillPreview") { try { send({ keys: preview() }); } catch (_) { send({ keys: [] }); } return true; }
      return false;
    });
  }

  const api = { PROFILE_KEYS, AUTOCOMPLETE_MAP, classifyField, buildFillPlan, scanFields, fillValue, autofill, preview };
  if (typeof window !== "undefined") window.SulaAutofill = api;
})();
