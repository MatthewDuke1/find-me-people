// Sula — order-fact extractor (pure, DOM-free).
//
// The one genuinely new piece of detection the passive ledger needs. Given a
// page's url + title + a text sample, pull out the facts that make a purchase
// recognisable later: merchant, amount, currency, order reference, date.
//
// Pure so it unit-tests without a browser, matching checkout-signals.js and
// refund-moment-detector.js. The DOM/location wrapper lives in content.js.
//
// Two rules run through everything here:
//
//   1. ANCHOR TO THE LABEL, NEVER THE LARGEST NUMBER. An order page shows a
//      subtotal, tax, shipping, a discount and a total, plus a price for every
//      line item. Picking the biggest is wrong about as often as it is right.
//      No recognised total label means no amount, and an entry with a missing
//      amount is strictly better than one with a confident wrong amount.
//
//   2. NEVER INVENT A FIELD TO COMPLETE A RECORD. Every value carries where it
//      came from in `provenance`. A ledger that guesses loses the user's trust
//      in the entries that are right.
//
// window.SulaLedgerExtract

(() => {
  "use strict";

  // ── currency ──────────────────────────────────────────────────────────
  const CURRENCY_SYMBOLS = { "$": "USD", "£": "GBP", "€": "EUR", "¥": "JPY", "₹": "INR", "₩": "KRW" };
  const CURRENCY_CODES = ["USD", "GBP", "EUR", "JPY", "INR", "CAD", "AUD", "NZD", "CHF", "SEK", "NOK", "DKK", "PLN", "KRW"];

  // ── total labels ──────────────────────────────────────────────────────
  // Ordered: the more specific the label, the more it is trusted. "Order total"
  // beats a bare "Total", which beats "Amount". Anything not on this list does
  // not produce an amount at all.
  const TOTAL_LABELS = [
    { re: /\b(order|grand)\s+total\b/i, weight: 3 },
    { re: /\btotal\s+(charged|paid|billed)\b/i, weight: 3 },
    { re: /\byou\s+(paid|were\s+charged)\b/i, weight: 3 },
    { re: /\bamount\s+(charged|paid|due)\b/i, weight: 2 },
    { re: /\btotal\b/i, weight: 1 },
  ];

  // Labels that must NEVER be read as the total, even when adjacent.
  const NOT_TOTAL = /\b(sub-?total|tax|vat|gst|shipping|delivery|discount|savings?|credit|tip|estimated)\b/i;

  // ── amount parsing ────────────────────────────────────────────────────
  // Handles 1,234.56 and the European 1.234,56. The discriminator is which
  // separator appears last: in "1.234,56" the comma is the decimal point.
  function parseAmount(raw) {
    if (typeof raw !== "string") return null;
    // Check the sign BEFORE stripping. A summary line reading "-$5.00" is a
    // discount or a refund; stripping first turns it into a $5 purchase.
    if (/^\s*[-−(]/.test(raw)) return null;
    const cleaned = raw.replace(/[^\d.,]/g, "");
    if (!cleaned || !/\d/.test(cleaned)) return null;
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    let normalized;
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
    const n = Number(normalized);
    if (!isFinite(n) || n <= 0) return null;
    // A total above this is a concatenation bug, not a purchase. Refusing beats
    // storing a nonsense figure the user will never be able to explain.
    if (n > 1000000) return null;
    return Math.round(n * 100) / 100;
  }

  function detectCurrency(fragment) {
    const f = String(fragment || "");
    for (const sym of Object.keys(CURRENCY_SYMBOLS)) {
      if (f.indexOf(sym) !== -1) return CURRENCY_SYMBOLS[sym];
    }
    const code = f.match(new RegExp("\\b(" + CURRENCY_CODES.join("|") + ")\\b"));
    return code ? code[1].toUpperCase() : null;
  }

  // Find the best-labelled money figure in the text.
  function extractAmount(text) {
    const t = String(text || "");
    let best = null;
    for (const label of TOTAL_LABELS) {
      const m = label.re.exec(t);
      if (!m) continue;
      // Look only just after the label. A figure further away than this
      // usually belongs to a different row of the summary table.
      const win = t.slice(m.index, m.index + 120);
      if (NOT_TOTAL.test(win.slice(0, m[0].length + 4))) continue;
      const money = win.match(/([$£€¥₹₩]|\b(?:USD|GBP|EUR|CAD|AUD)\b)?\s?(\d[\d.,]*\d|\d)/);
      if (!money) continue;
      const value = parseAmount(money[2]);
      if (value === null) continue;
      if (!best || label.weight > best.weight) {
        best = {
          value,
          currency: detectCurrency(win) || null,
          raw: (money[0] || "").trim(),
          weight: label.weight,
          label: m[0],
        };
      }
    }
    return best;
  }

  // ── order reference ───────────────────────────────────────────────────
  // Deliberately narrow. A loose pattern matches phone numbers, SKUs, tracking
  // numbers and dates — and a wrong order ref is worse than none, because dedup
  // keys off it and a bad key silently splits one purchase into two entries.
  const ORDER_REF_PATTERNS = [
    /\border\s*(?:#|no\.?|number)\s*:?\s*([A-Z0-9][A-Z0-9-]{4,23})\b/i,
    /\bconfirmation\s*(?:#|no\.?|number)\s*:?\s*([A-Z0-9][A-Z0-9-]{4,23})\b/i,
    /\breference\s*(?:#|no\.?)\s*:?\s*([A-Z0-9][A-Z0-9-]{4,23})\b/i,
    /\binvoice\s*(?:#|no\.?)\s*:?\s*([A-Z0-9][A-Z0-9-]{4,23})\b/i,
  ];

  function extractOrderRef(text) {
    const t = String(text || "");
    for (const re of ORDER_REF_PATTERNS) {
      const m = re.exec(t);
      if (!m) continue;
      const ref = m[1].toUpperCase();
      // All-digit refs under 6 chars are indistinguishable from quantities,
      // years and street numbers.
      if (/^\d+$/.test(ref) && ref.length < 6) continue;
      return ref;
    }
    return null;
  }

  // ── merchant ──────────────────────────────────────────────────────────
  // The top-level document's host is the most reliable signal: Stripe, PayPal
  // and Shopify render checkouts on their own hosts or inside iframes, and the
  // page title is frequently the processor's rather than the shop's.
  const PROCESSOR_HOSTS = /(^|\.)(stripe|paypal|adyen|braintreegateway|squareup)\.(com|net)$/i;

  function hostToDomain(host) {
    const h = String(host || "").toLowerCase().replace(/^www\./, "");
    return h || null;
  }

  function extractMerchant(input) {
    const { topDomain = "", siteName = "", title = "" } = input || {};
    const domain = hostToDomain(topDomain);
    const onProcessor = domain ? PROCESSOR_HOSTS.test(domain) : false;
    // og:site_name is the site's own declaration and beats a title, which is
    // usually "Checkout | Acme" or worse.
    let name = String(siteName || "").trim();
    if (!name && title) {
      name = String(title).split(/[|–—·:]/)[0].trim();
    }
    if (name.length > 60) name = name.slice(0, 60).trim();
    return { name: name || null, domain: onProcessor ? null : domain, onProcessor };
  }

  // ── dates ─────────────────────────────────────────────────────────────
  const DATE_PATTERNS = [
    /\b(\d{4})-(\d{2})-(\d{2})\b/,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i,
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
  ];
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  function extractDate(text) {
    const t = String(text || "");
    for (let i = 0; i < DATE_PATTERNS.length; i++) {
      const m = DATE_PATTERNS[i].exec(t);
      if (!m) continue;
      let ms = null;
      if (i === 0) ms = Date.UTC(+m[1], +m[2] - 1, +m[3], 12);
      else if (i === 1) ms = Date.UTC(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2], 12);
      else ms = Date.UTC(+m[3], +m[1] - 1, +m[2], 12);
      if (!isFinite(ms)) continue;
      const year = new Date(ms).getUTCFullYear();
      if (year < 2000 || year > 2100) continue;
      return ms;
    }
    return null;
  }

  // ── payment-instrument refusal ────────────────────────────────────────
  // Active refusal, not absence of looking. If anything card-shaped appears in
  // the captured text the whole capture is dropped rather than scrubbed: a
  // partial scrub that misses one format is worse than no capture at all.
  const PAN_SHAPED = /\b(?:\d[ -]?){13,19}\b/;
  const CVV_LABEL = /\b(cvv|cvc|security code|card number|card no)\b/i;

  function looksLikePaymentData(text) {
    const t = String(text || "");
    return PAN_SHAPED.test(t.replace(/\s+/g, " ")) || CVV_LABEL.test(t);
  }

  function withoutRenewalDates(text) {
    const t = String(text || "");
    const m = NEXT_DATE_LABEL.exec(t);
    if (!m) return t;
    return t.slice(0, m.index) + " " + t.slice(m.index + m[0].length + 48);
  }

  // ── the extractor ─────────────────────────────────────────────────────
  function extractOrderFacts(input) {
    const { url = "", title = "", bodyText = "", topDomain = "", siteName = "" } = input || {};

    if (looksLikePaymentData(bodyText)) {
      return { refused: "payment-data-present", provenance: {} };
    }

    const merchant = extractMerchant({ topDomain, siteName, title });
    const amount = extractAmount(bodyText);
    const orderRef = extractOrderRef(bodyText);
    // The purchase date must not be the NEXT billing date. A confirmation page
    // reading "Next billing date: October 12" would otherwise record the
    // purchase as happening in the future, and the refund form would prefill
    // that. So the date sitting right after a renewal label is cut out before
    // looking for the purchase date.
    const occurredAt = extractDate(withoutRenewalDates(bodyText));

    const provenance = {};
    if (amount) provenance.amount = "label:" + amount.label.toLowerCase();
    if (orderRef) provenance.orderRef = "labelled-reference";
    if (occurredAt) provenance.occurredAt = "page-date";
    if (merchant.domain) provenance.merchant = "top-level-domain";
    else if (merchant.name) provenance.merchant = "site-name";

    // Confidence is about how identifiable this purchase will be LATER, which
    // is what dedup depends on — not how much text we managed to read.
    let confidence = 0;
    if (merchant.domain) confidence += 0.4;
    if (amount) confidence += 0.3;
    if (orderRef) confidence += 0.2;
    if (occurredAt) confidence += 0.1;

    return {
      refused: null,
      merchant,
      amount: amount ? { value: amount.value, currency: amount.currency, raw: amount.raw } : null,
      orderRef,
      occurredAt,
      sourceUrl: String(url || ""),
      provenance,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  // ── renewal terms ─────────────────────────────────────────────────────
  // Renewal alerts need a DATE. Until this existed, capture stored the matched
  // renewal phrase with `nextDate: null`, every alert filter required a number,
  // and so no alert could ever fire. This recovers the two things a page can
  // actually tell us:
  //
  //   1. An explicit next date  -- "Next billing date: October 12, 2026".
  //      The strongest signal; the merchant is telling us outright.
  //   2. A cadence              -- "renews monthly", "$99 billed annually".
  //      The store rolls this forward from the purchase date at read time.
  //
  // Same rule as the rest of this file: never guess. A page reading "$9.99/month
  // or $99/year" with no renewal wording names two cadences and commits to
  // neither, so it yields no cadence rather than a coin flip.
  const NEXT_DATE_LABEL = /\b(next (billing|payment|charge|bill|renewal)( date)?|(auto-?)?renews? on|will (auto-?)?renew on|renewal date|next billed on|billed next on|(plan|subscription|membership) renews)\b/i;
  // Billing-term words only. "subscription", "membership" and "charged" were
  // tried and dropped: a ONE-TIME order page reading "You were charged $40.
  // Save 10% with a monthly subscription!" would become a monthly subscription,
  // and a Pro user would get a renewal alert for something they never signed
  // up for. Upsells like that are common on confirmation pages. A missed
  // cadence costs one alert; a false one costs trust in every alert.
  const RENEWAL_CONTEXT = /\b(auto-?renew\w*|renews?|renewal|recurring|billed)\b/gi;
  const CADENCES = [
    { cadence: "annual", re: /\b(annual(ly)?|yearly|per year|a year|each year|every (12|twelve) months)\b|\/\s?(yr|year)\b/i },
    { cadence: "quarterly", re: /\b(quarterly|per quarter|every (3|three) months)\b/i },
    { cadence: "monthly", re: /\b(monthly|per month|a month|each month|every month)\b|\/\s?mo(nth)?\b/i },
    { cadence: "weekly", re: /\b(weekly|per week|a week|each week|every week)\b|\/\s?wk\b/i },
  ];

  function cadencesIn(text) {
    const t = String(text || "");
    return CADENCES.filter((c) => c.re.test(t)).map((c) => c.cadence);
  }

  // An explicit date may only be trusted if it is plausibly the NEXT charge:
  // not already past, and not further out than a yearly plan could bill.
  const MAX_AHEAD_MS = 400 * 24 * 60 * 60 * 1000;
  const PAST_TOLERANCE_MS = 24 * 60 * 60 * 1000;

  function extractRenewal(text, opts) {
    const t = String(text || "");
    const now = opts && typeof opts.now === "number" ? opts.now : Date.now();

    // 1. Explicit next date, read only from just after its label.
    let nextDate = null;
    const label = NEXT_DATE_LABEL.exec(t);
    if (label) {
      const after = t.slice(label.index + label[0].length, label.index + label[0].length + 48);
      const d = extractDate(after);
      if (d !== null && d >= now - PAST_TOLERANCE_MS && d <= now + MAX_AHEAD_MS) nextDate = d;
    }

    // 2. Cadence, read only from windows around renewal wording. A lone
    //    "/month" in a product grid is a price, not a billing term.
    let cadence = null;
    const found = new Set();
    let m;
    RENEWAL_CONTEXT.lastIndex = 0;
    while ((m = RENEWAL_CONTEXT.exec(t)) !== null) {
      const win = t.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40);
      cadencesIn(win).forEach((c) => found.add(c));
      if (found.size > 1) break;
    }
    if (found.size === 1) cadence = [...found][0];

    if (nextDate === null && cadence === null) return null;
    return {
      cadence,
      nextDate,
      phrase: label ? label[0] : (cadence ? "renews " + cadence : ""),
    };
  }

  // ── capture composition ───────────────────────────────────────────────
  // What content.js hands to SulaLedger.capture(), built here rather than
  // inline so the end-to-end test exercises the SAME composition the extension
  // runs. Every ledger bug found so far hid in the gap between a unit-tested
  // piece and the untested code that wired it up; this closes that gap for
  // capture.
  function captureInput(page, opts) {
    const o = opts || {};
    const now = typeof o.now === "number" ? o.now : Date.now();
    const facts = extractOrderFacts(page);
    if (facts.refused) return { facts, opts: null };

    const renewal = extractRenewal(page && page.bodyText, { now });
    // A purchase with real renewal terms IS a subscription, whichever page it
    // was seen on. A free-trial checkout reading "then $9.99/month" is the
    // moment a subscription is born.
    const isSub = o.moment === "subscription" || !!renewal;
    return {
      facts,
      opts: {
        moment: o.moment,
        kind: isSub ? "subscription" : "purchase",
        renewal,
        now,
      },
    };
  }

  const api = {
    parseAmount,
    detectCurrency,
    extractAmount,
    extractOrderRef,
    extractMerchant,
    extractDate,
    looksLikePaymentData,
    extractOrderFacts,
    extractRenewal,
    captureInput,
  };
  if (typeof window !== "undefined") window.SulaLedgerExtract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
