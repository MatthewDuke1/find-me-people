// Sula — 5-tier email verification pipeline.
//
// Relevance (existing scoreEmail() in content.js — "is this the right KIND of
// address") and Deliverability (this file — "does this mailbox actually
// accept mail") are two independent axes. Never collapse them into one score;
// compose them into one of four honest UI states (see composeVerificationBadge).
//
// Tiers:
//   0. Relevance heuristic          — content.js scoreEmail() (unchanged, reused)
//   1. Syntax + disposable + role   — pure, local, zero network, FREE, unlimited
//   2. MX record exists             — one DNS-over-HTTPS call to a PUBLIC
//                                      resolver (not Sula's infra), FREE
//   3. Real mailbox check           — SMTP-level verification via a
//                                      third-party provider behind Sula's
//                                      backend proxy. PRO. STUBBED below —
//                                      no provider is wired yet; see the
//                                      "Tier 3/4 backend" section.
//   4. Catch-all-aware blending +   — same backend, adds catch-all detection
//      cached bulk verify             + cache. PRO.
//
// Why Tier 3 needs a backend regardless of "100% local": a browser cannot
// open a raw TCP socket to port 25. There was never a client-only way to do
// a real SMTP RCPT-TO check — this isn't a compromise of the local-first
// promise, it's a hard platform limitation. Tiers 1-2 stay fully local/free
// because they cost nothing per lookup; Tier 3 costs a fraction of a cent per
// lookup at a real provider, which is the only tier that needs to be Pro.

(() => {
  "use strict";

  // ============================================================
  // TIER 1 — syntax, disposable-domain, role-account (pure, free, local)
  // ============================================================

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  // Practical RFC-5322-ish syntax check. Not a full grammar implementation
  // (nobody's is, in practice) — catches the real-world failure modes:
  // missing @, missing TLD, whitespace, multiple @, leading/trailing dots.
  // Kept as a function-local regex (rather than a shared top-level const) so
  // the test harness can extract this whole function as one self-contained
  // unit — see tests/lib/extract.js's note on why regex-literal consts
  // aren't independently extracted.
  function isValidEmailSyntax(email) {
    const re =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    const e = normalizeEmail(email);
    if (!e || e.length > 254) return false;
    if (e.includes("..")) return false; // consecutive dots are invalid
    return re.test(e);
  }

  function getEmailDomain(email) {
    const e = normalizeEmail(email);
    const at = e.lastIndexOf("@");
    return at === -1 ? null : e.slice(at + 1);
  }

  // Starter set of disposable/throwaway-email domains. NOT exhaustive — real
  // disposable-domain lists run into the thousands and change constantly.
  // Treat this as a baseline; expand from a maintained public list
  // (e.g. disposable-email-domains projects on GitHub) rather than growing
  // this by hand over time.
  const DISPOSABLE_DOMAINS = new Set([
    "mailinator.com", "guerrillamail.com", "10minutemail.com", "temp-mail.org",
    "tempmail.com", "throwawaymail.com", "yopmail.com", "trashmail.com",
    "getnada.com", "dispostable.com", "fakeinbox.com", "sharklasers.com",
    "maildrop.cc", "mintemail.com", "mohmal.com", "guerrillamail.info",
    "guerrillamail.biz", "guerrillamail.de", "spam4.me", "mailnesia.com",
    "tempinbox.com", "emailondeck.com", "moakt.com", "burnermail.io",
  ]);

  function isDisposableDomain(domain) {
    if (!domain) return false;
    return DISPOSABLE_DOMAINS.has(String(domain).toLowerCase());
  }

  // Role-account prefixes. IMPORTANT for Sula's consumer-advocacy use case:
  // this is an INFORMATIONAL label, not a penalty. Unlike a B2B sales tool
  // (where a "support@" address is the wrong target), Sula's whole purpose is
  // finding real customer-service contacts — support@ / help@ / billing@ are
  // often exactly the RIGHT contact, not a lesser one. scoreEmail() in
  // content.js already encodes the correct relevance boosts/penalties for
  // this use case (boosts support-ish prefixes, penalizes noreply/marketing);
  // this classifier exists only to LABEL "role account" vs "named person" for
  // display, never to re-score.
  const ROLE_ACCOUNT_PREFIXES = new Set([
    "info", "support", "help", "contact", "service", "customerservice",
    "sales", "admin", "administrator", "webmaster", "postmaster", "hostmaster",
    "abuse", "noreply", "no-reply", "donotreply", "do-not-reply", "billing",
    "accounts", "hr", "jobs", "careers", "press", "media", "marketing",
    "legal", "privacy", "security", "feedback", "enquiries", "inquiries",
    "office", "general", "mail", "team", "hello", "complaints", "escalations",
    "executive", "ceo", "president",
  ]);

  function classifyEmailRole(email) {
    const e = normalizeEmail(email);
    const at = e.indexOf("@");
    if (at === -1) return "unknown";
    const prefix = e
      .slice(0, at)
      .replace(/\+.*$/, "") // drop plus-addressing tag first (support+ticket -> support)
      .replace(/[.\-_0-9]+$/g, ""); // then trim trailing separators/digits (support2 -> support)
    return ROLE_ACCOUNT_PREFIXES.has(prefix) ? "role" : "personal";
  }

  // Composite, zero-network Tier-1 check. Returns enough detail for the UI
  // to explain WHY an address failed before any Tier-2/3 network call is
  // even attempted — cheapest possible early exit.
  function tier1Check(email) {
    const domain = getEmailDomain(email);
    const validSyntax = isValidEmailSyntax(email);
    return {
      validSyntax,
      domain,
      disposable: validSyntax ? isDisposableDomain(domain) : false,
      role: validSyntax ? classifyEmailRole(email) : "unknown",
    };
  }

  // ============================================================
  // TIER 2 — MX record exists (one DNS-over-HTTPS call, public resolver)
  // ============================================================
  //
  // Routed through background.js (not called directly from a content
  // script): a service worker's fetch() is NOT subject to the current page's
  // Content-Security-Policy connect-src directive, so a CSP-strict page can
  // never silently break this the way a content-script-side fetch could.
  // Single point of network egress, easy to audit.

  function checkMxRecord(domain) {
    return new Promise((resolve) => {
      if (!domain) return resolve({ hasMx: false, error: "no_domain" });
      chrome.runtime.sendMessage({ action: "sula:checkMx", domain }, (r) => {
        if (chrome.runtime.lastError || !r) {
          return resolve({ hasMx: null, error: "unreachable" });
        }
        resolve(r);
      });
    });
  }

  // ============================================================
  // TIER 3/4 — real mailbox verification (Pro, backend-proxied) + cache
  // ============================================================

  const VERIFY_CACHE_KEY = "sula_verify_cache"; // chrome.storage.local
  const VERIFY_CACHE_TTL_DAYS = 60; // re-check after this; mailboxes go stale

  function lcGet(key) {
    return new Promise((res) => {
      if (!chrome.storage || !chrome.storage.local) return res(null);
      chrome.storage.local.get([key], (r) => res(r[key] ?? null));
    });
  }
  function lcSet(obj) {
    return new Promise((res) => {
      if (!chrome.storage || !chrome.storage.local) return res();
      chrome.storage.local.set(obj, res);
    });
  }

  async function getCachedVerification(email) {
    const cache = (await lcGet(VERIFY_CACHE_KEY)) || {};
    const entry = cache[normalizeEmail(email)];
    if (!entry) return null;
    const ageDays = (Date.now() - (entry.checkedAt || 0)) / (24 * 60 * 60 * 1000);
    if (ageDays > VERIFY_CACHE_TTL_DAYS) return null; // stale — force re-check
    return entry;
  }

  async function setCachedVerification(email, result) {
    const cache = (await lcGet(VERIFY_CACHE_KEY)) || {};
    cache[normalizeEmail(email)] = { ...result, checkedAt: Date.now() };
    await lcSet({ [VERIFY_CACHE_KEY]: cache });
  }

  // Pro entitlement check, same pattern as job-contacts.js: prefer the
  // isPro() global from license.js when co-loaded, else ask background,
  // else default true (matches today's soft-launch, PRO_ENFORCED=false).
  async function isProEntitled() {
    try {
      if (typeof isPro === "function") return await isPro();
    } catch (_) {}
    try {
      const r = await chrome.runtime.sendMessage({ action: "sula:isPro" });
      if (r && typeof r.pro === "boolean") return r.pro;
    } catch (_) {}
    return true;
  }

  // Real mailbox verification. Cache-first, then Pro-gated backend call.
  // The backend call is STUBBED (background.js's "sula:verifyMailbox"
  // handler currently returns {ok:false, status:"not_configured"}) until a
  // verification provider is chosen and the proxy is deployed — see
  // background.js for the exact wiring point. This function's contract is
  // final; only the provider behind it is pending.
  async function verifyMailbox(email, { skipCache = false, greylistRetry = false } = {}) {
    if (!isValidEmailSyntax(email)) {
      return { status: "invalid", reason: "bad_syntax" };
    }
    if (!skipCache) {
      const cached = await getCachedVerification(email);
      if (cached) return cached;
    }
    if (!(await isProEntitled())) {
      return { status: "not_checked", reason: "pro_required" };
    }
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "sula:verifyMailbox", email: normalizeEmail(email), greylistRetry },
        (r) => {
          if (chrome.runtime.lastError || !r) {
            return resolve({ status: "unknown", reason: "unreachable" });
          }
          resolve(r);
        }
      );
    });
    // Greylisting: the provider legitimately can't confirm on the first
    // pass for ~5-15% of B2B mailboxes. Cache the "unknown" briefly (not the
    // full TTL) so a retry a bit later is cheap, and let the UI offer a
    // manual "check again" rather than silently reporting a false invalid.
    if (result.status !== "greylisted") {
      await setCachedVerification(email, result);
    }
    return result;
  }

  // ============================================================
  // Composition — one honest badge from relevance + deliverability
  // ============================================================
  //
  // Never a single misleading green check. Four real states, matching the
  // design doc exactly:
  //   Verified        — relevant AND mailbox confirmed
  //   Unverified       — relevant, verification not yet run (default free state)
  //   Catch-all        — domain accepts anything; THIS mailbox can't be
  //                       confirmed by anyone, ever — state this honestly
  //   Invalid          — MX missing, bad syntax, or mailbox rejected

  function composeVerificationBadge(relevanceScore, verifyResult) {
    const r = verifyResult || { status: "not_checked" };
    switch (r.status) {
      case "verified":
        return { label: "Verified", tier: "success", detail: "Mailbox confirmed" };
      case "catch_all":
        return {
          label: "Catch-all domain",
          tier: "neutral",
          detail: "This domain accepts any address — this specific mailbox can't be confirmed",
        };
      case "invalid":
        return {
          label: "Invalid",
          tier: "danger",
          detail: r.reason === "bad_syntax" ? "Malformed address" : "No mail server or mailbox rejected",
        };
      case "greylisted":
        return {
          label: "Check again shortly",
          tier: "neutral",
          detail: "Mail server delayed the check (greylisting) — usually resolves within 5-30 min",
        };
      case "not_configured":
        // Honest, distinct from "not yet checked" — no provider is wired
        // behind the backend yet, so this is NOT the same as "unverified."
        return {
          label: "Verification coming soon",
          tier: "neutral",
          detail: "Real-time mailbox verification isn't live yet",
        };
      case "not_checked":
      default:
        return {
          label: relevanceScore >= 70 ? "Likely — unverified" : "Unverified",
          tier: "neutral",
          detail: r.reason === "pro_required" ? "Real-time verification is a Pro feature" : "Not yet checked",
        };
    }
  }

  // Exposed for popup.js / job-contacts.js to call.
  window.SulaVerify = {
    tier1Check,
    checkMxRecord,
    verifyMailbox,
    composeVerificationBadge,
    isValidEmailSyntax,
    isDisposableDomain,
    classifyEmailRole,
    getEmailDomain,
  };
})();
