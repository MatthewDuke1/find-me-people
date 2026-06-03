// Find Me People - Content Script
// Scans every page for customer service contact information

(function () {
  "use strict";

  const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const INTL_PHONE_REGEX = /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{0,4}/g;

  // Keywords that indicate customer service / support context
  const SUPPORT_KEYWORDS = [
    "support", "customer service", "customer support", "help desk",
    "helpdesk", "contact us", "contact", "get in touch", "reach us",
    "call us", "email us", "write to us", "speak to", "talk to",
    "assistance", "service desk", "care team", "customer care",
    "billing support", "technical support", "tech support",
  ];

  // Keywords that indicate the email/phone is likely support-related
  const SUPPORT_EMAIL_HINTS = [
    "support", "help", "care", "service", "contact", "info",
    "assist", "billing", "sales", "hello", "team", "feedback",
    "cs@", "customerservice", "customer.service",
  ];

  // Selectors likely to contain contact info
  const CONTACT_SELECTORS = [
    'footer', '[class*="footer"]', '[id*="footer"]',
    '[class*="contact"]', '[id*="contact"]',
    '[class*="support"]', '[id*="support"]',
    '[class*="help"]', '[id*="help"]',
    'a[href^="mailto:"]', 'a[href^="tel:"]',
    '[class*="customer"]', '[id*="customer"]',
    '[aria-label*="contact"]', '[aria-label*="support"]',
  ];

  // URL patterns that indicate a page is likely to carry contact info.
  // Boundary-aware: matches "contact" / "contacts" only when adjacent to
  // a path separator (-, _, /, or end-of-string). The previous /\/contact/i
  // pattern required a literal "/contact" prefix and missed real contact
  // pages like /media-contacts and /direct-contact-information that show
  // up on government and large-org sites (dhs.gov, irs.gov, etc.).
  //
  // Examples that match:
  //   /contact, /contact-us, /contacts, /contacts/, /contact_us
  //   /media-contacts, /press-contacts, /staff-contacts
  //   /direct-contact-information, /general-contact-info
  //   /press, /press-room (often carries media-facing contacts)
  //
  // Examples that do NOT match (avoid false positives):
  //   /contactless-payment, /non-contactable-resources
  const CONTACT_PAGE_PATTERNS = [
    /[-_\/]contacts?(?:[-_\/]|$)/i,
    /[-_\/]press(?:[-_\/]|$)/i,
    /\/support/i, /\/help/i, /\/about/i,
    /\/customer-service/i, /\/get-in-touch/i, /\/reach-us/i,
  ];

  // Day name regex parts
  const DAY_NAMES = "(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
  const DAY_FULL = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const DAY_SHORT = ["sun","mon","tue","wed","thu","fri","sat"];

  // Hours patterns - match "Mon-Fri 9am-5pm", "Monday: 9:00 - 17:00", "9am - 5pm", etc.
  const TIME = "(?:1[0-2]|[1-9])(?::[0-5]\\d)?\\s*(?:am|pm|AM|PM)|(?:[01]?\\d|2[0-3]):[0-5]\\d";
  const HOURS_LINE_REGEX = new RegExp(
    "(" + DAY_NAMES + "(?:\\s*[-–to]+\\s*" + DAY_NAMES + ")?)" +
    "[:\\s]+(" + TIME + ")\\s*[-–to]+\\s*(" + TIME + ")",
    "gi"
  );
  // Just a time range like "9am - 5pm" (not anchored to day)
  const TIME_RANGE_REGEX = new RegExp(
    "(" + TIME + ")\\s*[-–]+\\s*(" + TIME + ")",
    "gi"
  );

  // Keywords that indicate hours context
  const HOURS_KEYWORDS = [
    "hours of operation", "business hours", "opening hours", "open hours",
    "store hours", "office hours", "hours", "open", "we're open",
    "operating hours", "working hours",
  ];

  function scanPage() {
    const results = { emails: [], phones: [], links: [], context: [], hours: [] };
    const seen = new Set();
    const hoursSeen = new Set();

    // 0. Seed the dedup set with the user's own logged-in identity (email /
    //    phone surfaced by account dropdowns, profile menus, signed-in
    //    avatars, account-switcher UIs). The user cannot "contact themselves"
    //    -- surfacing their own gmail/outlook address on a Google search
    //    results page (or any logged-in app) is a false-positive that erodes
    //    trust in the rest of the results. By pre-seeding `seen`, every
    //    downstream push site (mailto:, text scan, body innerText, iframes,
    //    fallback fetch, page globals, chatbot configs) naturally skips the
    //    personal identifier without any additional code at each call site.
    seedPersonalIdentity(seen);

    // 1. Scan mailto: and tel: links (highest confidence)
    document.querySelectorAll('a[href^="mailto:"]').forEach((el) => {
      const email = el.href.replace("mailto:", "").split("?")[0].toLowerCase();
      if (!seen.has(email) && email.includes("@")) {
        seen.add(email);
        const context = getContext(el);
        const score = scoreEmail(email, context);
        results.emails.push({ value: email, context, score, source: "mailto" });
      }
    });

    document.querySelectorAll('a[href^="tel:"]').forEach((el) => {
      const phone = el.href.replace("tel:", "").replace(/\s/g, "");
      const key = phoneKey(phone);
      if (!seen.has(key) && phone.length >= 10) {
        seen.add(key);
        const context = getContext(el);
        results.phones.push({ value: formatPhone(phone), context, score: 90, source: "tel" });
      }
    });

    // 2. Scan contact-likely sections
    //
    // innerText (not textContent) so block-level boundaries -- paragraphs,
    // divs, <br>, list items -- produce whitespace in the joined string.
    // textContent ignores layout and concatenates adjacent block elements
    // with no separator, which caused emails to merge with the preceding
    // line's content: <span>...TX 77546</span><br></p><div>...email...</div>
    // would join as "...TX 77546email..." and the email regex would
    // happily match "77546email@host" as one address. innerText respects
    // the layout so the join becomes "...TX 77546\nemail...".
    //
    // The cost is a forced layout per matched container. CONTACT_SELECTORS
    // is short and only matches a handful of elements per page, so the
    // perf hit is bounded.
    CONTACT_SELECTORS.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          const text = el.innerText || el.textContent || "";
          extractFromText(text, el, results, seen);
        });
      } catch (e) {}
    });

    // 3. Scan the full page body for remaining matches. Loose-body scope:
    // require a per-phone contact-proximity anchor so we don't dump every
    // snippet phone on a Google search results page (or any directory /
    // listing / social feed) into the side panel. Emails are unaffected --
    // their @ symbol makes them distinct enough that the noise pattern
    // doesn't appear in practice.
    const bodyText = document.body ? document.body.innerText : "";
    extractFromText(bodyText, document.body, results, seen, { requireProximityAnchor: true });

    // 3b. Scan same-origin iframes. Sites that embed contact widgets,
    // support chat panels, or "contact us" forms via iframe on their own
    // subdomain hide the contact info inside an iframe document our normal
    // body scan can't see. Cross-origin iframes are blocked by the browser
    // security model and are skipped silently. Same-origin (including same
    // sub-origin) is readable per the same-origin policy.
    scanSameOriginIframes(results, seen);

    // 4. Look for contact page links
    document.querySelectorAll("a").forEach((a) => {
      const href = a.href || "";
      const text = (a.textContent || "").toLowerCase();
      if (
        CONTACT_PAGE_PATTERNS.some((p) => p.test(href)) ||
        SUPPORT_KEYWORDS.some((kw) => text.includes(kw))
      ) {
        if (href && !seen.has(href) && href.startsWith("http")) {
          seen.add(href);
          results.links.push({
            url: href,
            text: a.textContent.trim().substring(0, 60),
          });
        }
      }
    });

    // 4b. Scan page-context globals. Many React/Next/Vue sites hydrate the
    // page from a JSON blob hanging off `window.__NEXT_DATA__` or similar;
    // when the visible DOM is sparse but the state blob has the contact,
    // pulling from globals reveals what the DOM scan can't. Same technique
    // Wappalyzer uses for tech fingerprinting.
    scanPageGlobals(results, seen);

    // 4c. Detect chatbot widgets and read their config globals. When a
    // company hides its real support email behind an Intercom / Zendesk /
    // Drift / Crisp / HubSpot / Tidio / LiveChat / Tawk / Freshchat / Olark
    // widget, the widget's SDK still stashes config on `window` -- account
    // ID, sometimes a support email, often enough to reconstruct the
    // vendor's contact / help-center URL. Pulling from those globals turns
    // a chatbot into a discoverable contact channel without us ever
    // interacting with the chat UI.
    scanChatbotVendors(results, seen);

    // 4d. Scan curated page-level metadata for contacts.
    scanPageMeta(results, seen);

    // 4e. Press-release / media-contact extraction.
    scanPressContacts(results, seen);

    // 4f. App Store / Play Store developer contacts.
    scanAppStorePages(results, seen);

    // 4g. Footer-specialized pass.
    scanFooterSpecialized(results, seen);

    // 4h. Site-specific override library.
    applySiteOverrides(results, seen);

    // 5. Scan for hours of operation
    extractHours(results, hoursSeen);

    // Sort by relevance score
    results.emails.sort((a, b) => b.score - a.score);
    results.phones.sort((a, b) => b.score - a.score);

    // Dedupe links
    const linksSeen = new Set();
    results.links = results.links.filter((l) => {
      const key = new URL(l.url).pathname;
      if (linksSeen.has(key)) return false;
      linksSeen.add(key);
      return true;
    });

    // 6. Background-fetch every same-origin contact-page link we found in
    // step 4. Government and large-org sites surface multiple specialized
    // contact pages (dhs.gov has /contact AND /media-contacts AND
    // /direct-contact-information, each with its own contact info). The
    // user shouldn't have to click each one -- we fetch all of them,
    // parse, and merge. Bounded to 5 fetches per scan, per-URL
    // sessionStorage gate, same-origin only, credentials: 'same-origin'
    // (so cookie-gated content like Cloudflare's cf_clearance pages is
    // reachable -- same cookies the user already sends when they click
    // the link manually).
    const discoveredContactUrls = (results.links || [])
      .map((l) => l && l.url)
      .filter((u) => {
        if (!u || typeof u !== "string") return false;
        try {
          const parsed = new URL(u);
          return parsed.origin === window.location.origin
              && CONTACT_PAGE_PATTERNS.some((p) => p.test(parsed.pathname));
        } catch (_) {
          return false;
        }
      });
    if (discoveredContactUrls.length) {
      fetchDiscoveredContactPages(discoveredContactUrls, results, seen);
    }

    // 6b. Sitemap.xml mining. Many large sites surface their canonical
    // contact / press / support URLs in /sitemap.xml that the homepage
    // links section never touches. Fetch the sitemap (once per origin
    // per session), filter the URL list to contact-page patterns, and
    // queue them through the same discovered-page fetch path.
    fetchSitemapContactUrls(results, seen);

    // 7. Fallback: if the in-DOM scan AND the discovered-page fetch came
    // up totally empty, fire a fire-and-forget background fetch of a
    // hardcoded list of common contact paths (/contact, /about, /support)
    // and merge any matches. Bounded to once per origin per session.
    if (results.emails.length + results.phones.length === 0) {
      fetchAndScanFallbackPages(results, seen);
    }

    // 7. If the page is a Zendesk-powered help center (or carries the
    // Zendesk Web Widget snippet with a discoverable subdomain), query
    // the public Help Center search API for contact-related articles.
    // The bot the user sees in the widget is just RAG over these
    // articles -- we read them directly, no chat-UI dance required.
    const zendeskSub = detectZendeskSubdomain();
    if (zendeskSub) {
      fetchZendeskHelpCenter(zendeskSub, results, seen);
    }

    return results;
  }

  function extractHours(results, hoursSeen) {
    // 1. Try schema.org JSON-LD structured data first (highest confidence)
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        items.forEach((item) => {
          collectSchemaHours(item, results, hoursSeen);
        });
      } catch (e) {}
    });

    // 2. Try microdata (itemprop="openingHours")
    document.querySelectorAll('[itemprop="openingHours"]').forEach((el) => {
      const content = el.getAttribute("content") || el.textContent.trim();
      if (content && !hoursSeen.has(content)) {
        hoursSeen.add(content);
        const parsed = parseSchemaOpeningHours(content);
        if (parsed) {
          results.hours.push({
            display: parsed.display,
            days: parsed.days,
            score: 95,
            source: "microdata",
          });
        }
      }
    });

    // 3. Scan body text for hours patterns
    const candidates = new Set();

    // Look in elements whose class/id mentions hours
    document.querySelectorAll(
      '[class*="hour"], [id*="hour"], [class*="schedule"], [id*="schedule"], ' +
      '[class*="open"], [id*="open"], footer, [class*="footer"]'
    ).forEach((el) => {
      const text = (el.textContent || "").substring(0, 500);
      if (text) candidates.add(text);
    });

    // Also scan elements containing hours keywords
    const allText = document.body ? document.body.innerText : "";
    HOURS_KEYWORDS.forEach((kw) => {
      const idx = allText.toLowerCase().indexOf(kw);
      if (idx !== -1) {
        const snippet = allText.substring(idx, idx + 300);
        candidates.add(snippet);
      }
    });

    candidates.forEach((text) => {
      const matches = parseHoursFromText(text);
      matches.forEach((m) => {
        const key = m.display.toLowerCase();
        if (!hoursSeen.has(key)) {
          hoursSeen.add(key);
          results.hours.push(m);
        }
      });
    });

    // Sort by score
    results.hours.sort((a, b) => b.score - a.score);
    // Cap at 7 entries (one per day)
    results.hours = results.hours.slice(0, 7);
  }

  function collectSchemaHours(item, results, hoursSeen) {
    if (!item || typeof item !== "object") return;

    if (item.openingHours) {
      const hours = Array.isArray(item.openingHours) ? item.openingHours : [item.openingHours];
      hours.forEach((h) => {
        if (typeof h === "string" && !hoursSeen.has(h)) {
          hoursSeen.add(h);
          const parsed = parseSchemaOpeningHours(h);
          if (parsed) {
            results.hours.push({
              display: parsed.display,
              days: parsed.days,
              score: 100,
              source: "json-ld",
            });
          }
        }
      });
    }

    if (item.openingHoursSpecification) {
      const specs = Array.isArray(item.openingHoursSpecification)
        ? item.openingHoursSpecification
        : [item.openingHoursSpecification];
      specs.forEach((spec) => {
        const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];
        const dayNames = days.filter(Boolean).map(simplifyDayName);
        const opens = formatTime(spec.opens);
        const closes = formatTime(spec.closes);
        if (dayNames.length && opens && closes) {
          const dayLabel = dayNames.length > 1 ? dayNames[0] + "-" + dayNames[dayNames.length - 1] : dayNames[0];
          const display = dayLabel + ": " + opens + " - " + closes;
          if (!hoursSeen.has(display)) {
            hoursSeen.add(display);
            results.hours.push({
              display,
              days: dayNames,
              opens,
              closes,
              score: 100,
              source: "json-ld",
            });
          }
        }
      });
    }

    // Recurse into nested schema objects
    Object.values(item).forEach((v) => {
      if (v && typeof v === "object") collectSchemaHours(v, results, hoursSeen);
    });
  }

  function simplifyDayName(d) {
    if (!d) return "";
    const s = String(d).toLowerCase().replace(/.*\//, "");
    return s.charAt(0).toUpperCase() + s.slice(1, 3);
  }

  function formatTime(t) {
    if (!t) return "";
    // Convert "09:00" to "9am", etc.
    const m = String(t).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return String(t);
    let h = parseInt(m[1], 10);
    const min = m[2];
    const ampm = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return min === "00" ? h + ampm : h + ":" + min + ampm;
  }

  function parseSchemaOpeningHours(str) {
    // Schema format: "Mo,Tu,We,Th,Fr 09:00-17:00" or "Mo-Fr 09:00-17:00"
    const m = str.match(/([A-Za-z,\-]+)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
    if (!m) return null;
    const dayPart = m[1];
    const opens = formatTime(m[2]);
    const closes = formatTime(m[3]);
    return {
      display: dayPart + ": " + opens + " - " + closes,
      days: dayPart.split(/[,-]/),
      opens,
      closes,
    };
  }

  function parseHoursFromText(text) {
    const found = [];
    HOURS_LINE_REGEX.lastIndex = 0;
    let match;
    let count = 0;
    while ((match = HOURS_LINE_REGEX.exec(text)) !== null && count < 10) {
      count++;
      const day = match[1].trim();
      const open = match[2].trim();
      const close = match[3].trim();
      const display = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase() + ": " + open + " - " + close;
      found.push({
        display,
        opens: open,
        closes: close,
        days: [day],
        score: 80,
        source: "text",
      });
    }
    return found;
  }

  // Read common state-holding window globals from the page world. Content
  // scripts run in an isolated world, so we inject a tiny <script> that
  // serializes the targets into JSON and parks them on a hidden DOM bridge
  // element we can read back. Capped at 500 KB to avoid the rare site that
  // hydrates with a multi-MB state blob.
  function scanPageGlobals(results, seen) {
    if (!document.body) return;

    let bridge;
    let json = "";
    try {
      bridge = document.createElement("div");
      bridge.id = "fmp-globals-bridge";
      bridge.style.display = "none";
      document.body.appendChild(bridge);

      const script = document.createElement("script");
      // Single self-executing IIFE: read each target, JSON-stringify with a
      // replacer that skips functions / DOM nodes, stash on bridge.
      script.textContent = "(function(){try{var T=['__NEXT_DATA__','__INITIAL_STATE__','__PRELOADED_STATE__','__NUXT__','__APOLLO_STATE__','__REACT_QUERY_STATE__','__remixContext','__sveltekit','appConfig','siteConfig','pageProps'];var o={};for(var i=0;i<T.length;i++){try{var v=window[T[i]];if(v!=null)o[T[i]]=v;}catch(e){}}try{if(window.Shopify)o.Shopify=window.Shopify;}catch(e){}var seen=new WeakSet();var rep=function(k,v){if(v&&typeof v==='object'){if(seen.has(v))return undefined;seen.add(v);}if(typeof v==='function')return undefined;if(v&&v.nodeType)return undefined;return v;};var s='';try{s=JSON.stringify(o,rep);}catch(e){}if(s&&s.length>500000)s=s.substring(0,500000);var el=document.getElementById('fmp-globals-bridge');if(el)el.setAttribute('data-globals',s||'');}catch(e){}})();";
      document.documentElement.appendChild(script);
      // The <script> executes synchronously on append; remove immediately so
      // we don't leave it in the DOM for site code to trip over.
      if (script.parentNode) script.parentNode.removeChild(script);

      json = bridge.getAttribute("data-globals") || "";
    } catch (_) {
      // Strict-CSP sites (script-src 'none' / 'self' without 'unsafe-inline')
      // block the injection. Fall through silently -- the DOM scan still ran.
    } finally {
      if (bridge && bridge.parentNode) bridge.parentNode.removeChild(bridge);
    }

    if (!json) return;

    // Run the same regexes the DOM-text scan uses, against the JSON string.
    const emailMatches = json.match(EMAIL_REGEX) || [];
    emailMatches.forEach((email) => {
      email = trimDigitPrefixBleed(email.toLowerCase());
      if (seen.has(email)) return;
      // Filter out obvious noise that shows up in __NEXT_DATA__ blobs
      if (
        email.endsWith(".png") || email.endsWith(".jpg") || email.endsWith(".svg") ||
        email.includes("sentry") || email.includes("webpack") ||
        email.includes("example.com") || email.includes("@2x") ||
        email.includes("noreply") || email.includes("no-reply")
      ) return;
      seen.add(email);
      const context = "from page state";
      results.emails.push({
        value: email,
        context,
        score: scoreEmail(email, context),
        source: "globals",
      });
    });

    const phoneMatches = [
      ...(json.match(PHONE_REGEX) || []),
      ...(json.match(INTL_PHONE_REGEX) || []),
    ];
    phoneMatches.forEach((phone) => {
      const cleaned = phone.replace(/[^\d+]/g, "");
      if (cleaned.length < 10 || cleaned.length > 15) return;
      const key = phoneKey(cleaned);
      if (seen.has(key)) return;
      // JSON often has long runs of digits (IDs, timestamps) that pattern-match
      // phone shapes by accident. Require the original substring to contain at
      // least one non-digit separator OR a leading + to weed those out.
      if (!/[+\-.\s()]/.test(phone)) return;
      seen.add(key);
      const context = "from page state";
      results.phones.push({
        value: formatPhone(phone),
        context,
        score: scorePhone(context),
        source: "globals",
      });
    });
  }

  // Detect chatbot vendors and read their config globals.
  //
  // Every major chat widget loads a JS SDK that stashes its config on
  // `window` before the widget iframe renders. The widget itself sits in a
  // cross-origin iframe we can't read, but its config (account ID, support
  // email, sometimes a fallback phone, help-center URL) lives in the host
  // page's JS context -- same place __NEXT_DATA__ lives. Same page-world
  // bridge pattern scanPageGlobals uses: inject a tiny <script>, serialize
  // the targets onto a hidden DOM bridge, read back, clean up.
  //
  // For each detected vendor we extract:
  //   1. Any email/phone directly exposed in the config (rare but very
  //      high-confidence -- chatbot config emails are almost always the
  //      real support address).
  //   2. The vendor account identifier (app_id / subdomain / website_id /
  //      portal_id / license / token) which we use to reconstruct the
  //      vendor's standard help-center URL. That URL gets pushed into
  //      results.links so the side panel surfaces it under "Support pages"
  //      -- one click away from the real contact form.
  //
  // No interaction with the chat UI itself. We don't type into it, we
  // don't open it, we don't bypass the vendor's flow. This is passive
  // scanning, exactly the same risk profile as scanPageGlobals.
  function scanChatbotVendors(results, seen) {
    if (!document.body) return;

    let bridge;
    let json = "";
    try {
      bridge = document.createElement("div");
      bridge.id = "fmp-chatbot-bridge";
      bridge.style.display = "none";
      document.body.appendChild(bridge);

      const script = document.createElement("script");
      // Single self-executing IIFE: probe each vendor's window globals and
      // any related script[src] / iframe[src] markers, serialize the bits
      // we want, stash on bridge. Kept inline for the same CSP-tolerance
      // reason as the scanPageGlobals injection -- one script element only.
      script.textContent =
        "(function(){try{var d={};" +
        // Intercom: intercomSettings.app_id, email_support_address.
        "try{var ic=window.intercomSettings;if(ic||window.Intercom){d.intercom={app_id:(ic&&ic.app_id)||null,email:(ic&&(ic.email_support_address||ic.support_email))||null};}}catch(e){}" +
        // Zendesk: detected via globals; subdomain pulled from snippet src.
        "try{if(window.zESettings||window.zE||window.zEACLoaded){var sub=null;var ss=document.querySelectorAll('script[src*=\"zdassets\"],script[src*=\"zendesk\"]');for(var i=0;i<ss.length;i++){var u=ss[i].src||'';var m=u.match(/static\\.zdassets\\.com\\/ekr\\/[^?]+\\?key=([a-z0-9-]+)/);if(m){sub=m[1];break;}var m2=u.match(/\\/\\/([a-z0-9-]+)\\.zendesk\\.com/);if(m2){sub=m2[1];break;}}d.zendesk={subdomain:sub};}}catch(e){}" +
        // Drift: drift / driftt globals. embedId is the widget account.
        "try{var dr=window.drift||window.driftt;if(dr){var eid=null;try{eid=(dr.api&&dr.api.embedId)||(dr.api&&dr.api.params&&dr.api.params.embedId)||null;}catch(e){}d.drift={embed_id:eid};}}catch(e){}" +
        // Crisp: CRISP_WEBSITE_ID is the workspace UUID.
        "try{if(window.CRISP_WEBSITE_ID||window.$crisp){d.crisp={website_id:window.CRISP_WEBSITE_ID||null};}}catch(e){}" +
        // HubSpot: portal id from hbspt or first _hsq queue item.
        "try{if(window._hsq||window.hbspt||window.HubSpotConversations){var pid=null;try{if(window.hbspt&&window.hbspt.portal&&window.hbspt.portal.id)pid=window.hbspt.portal.id;}catch(e){}if(!pid&&window._hsq&&window._hsq.length){for(var j=0;j<window._hsq.length;j++){var it=window._hsq[j];if(it&&it[1]&&it[1].portalId){pid=it[1].portalId;break;}}}d.hubspot={portal_id:pid};}}catch(e){}" +
        // Tidio: project key only exposed via tidioIdentify in some integrations.
        "try{if(window.tidioChatApi||window.tidioIdentify){d.tidio={detected:true};}}catch(e){}" +
        // LiveChat: license number.
        "try{var lc=window.__lc;if(lc||window.LC_API){d.livechat={license:(lc&&lc.license)||null};}}catch(e){}" +
        // Tawk.to: property id surfaced via script src embed/<propertyId>/<widgetId>.
        "try{if(window.Tawk_API||window.Tawk_LoadStart){var tprop=null;var tss=document.querySelectorAll('script[src*=\"tawk.to\"]');for(var k=0;k<tss.length;k++){var tu=tss[k].src||'';var tm=tu.match(/embed\\.tawk\\.to\\/([a-f0-9]+)\\/[a-z0-9]+/i);if(tm){tprop=tm[1];break;}}d.tawk={property_id:tprop};}}catch(e){}" +
        // Freshchat: token + host.
        "try{var fs=window.fcSettings;if(fs||window.fcWidget){d.freshchat={token:(fs&&fs.token)||null,host:(fs&&fs.host)||null};}}catch(e){}" +
        // Olark: siteId in olark.configuration.
        "try{if(window.olark){var sid=null;try{sid=(window.olark.configuration&&window.olark.configuration.siteId)||null;}catch(e){}d.olark={site_id:sid};}}catch(e){}" +
        // Serialize with the same WeakSet-cycle-guard pattern as scanPageGlobals.
        "var sn=new WeakSet();var rp=function(k,v){if(v&&typeof v==='object'){if(sn.has(v))return undefined;sn.add(v);}if(typeof v==='function')return undefined;if(v&&v.nodeType)return undefined;return v;};var s='';try{s=JSON.stringify(d,rp);}catch(e){}if(s&&s.length>50000)s=s.substring(0,50000);var el=document.getElementById('fmp-chatbot-bridge');if(el)el.setAttribute('data-chatbot',s||'');}catch(e){}})();";
      document.documentElement.appendChild(script);
      if (script.parentNode) script.parentNode.removeChild(script);

      json = bridge.getAttribute("data-chatbot") || "";
    } catch (_) {
      // Strict-CSP sites block the injection. Skip silently; the rest of
      // the scan pipeline already covers the DOM-visible surface.
    } finally {
      if (bridge && bridge.parentNode) bridge.parentNode.removeChild(bridge);
    }

    if (!json) return;
    let data;
    try { data = JSON.parse(json); } catch (_) { return; }

    // Reconstruct the standard help-center URL for each vendor when we
    // have enough identifier to do so. These point at the vendor's public
    // contact-form / knowledge-base entry; the user lands one click away
    // from the real support channel, no chat-UI dance required.
    const helpUrlForVendor = {
      intercom:  (info) => info.app_id ? `https://intercom.help/${info.app_id}/` : null,
      zendesk:   (info) => info.subdomain ? `https://${info.subdomain}.zendesk.com/hc` : null,
      drift:     (info) => info.embed_id ? `https://app.drift.com/${info.embed_id}` : null,
      crisp:     (info) => info.website_id ? `https://app.crisp.chat/website/${info.website_id}/` : null,
      hubspot:   (info) => info.portal_id ? `https://app.hubspot.com/contacts/${info.portal_id}/` : "https://help.hubspot.com/",
      tidio:     ()     => "https://www.tidio.com/contact/",
      livechat:  (info) => info.license ? `https://my.livechatinc.com/agent/chats/${info.license}` : null,
      tawk:      (info) => info.property_id ? `https://dashboard.tawk.to/login` : null,
      freshchat: (info) => info.host ? `https://${info.host}/` : null,
      olark:     (info) => info.site_id ? `https://www.olark.com/site/${info.site_id}/contact` : null,
    };

    const labelForVendor = {
      intercom: "Intercom help center",
      zendesk: "Zendesk help center",
      drift: "Drift contact",
      crisp: "Crisp help center",
      hubspot: "HubSpot help",
      tidio: "Tidio contact",
      livechat: "LiveChat",
      tawk: "Tawk.to contact",
      freshchat: "Freshchat host",
      olark: "Olark contact",
    };

    Object.keys(data).forEach((vendor) => {
      const info = data[vendor] || {};

      // Direct email exposed in the chatbot config. Rare but very high
      // confidence -- the SDK only gets this value when the admin
      // explicitly set it as the fallback support address.
      if (info.email && typeof info.email === "string" && info.email.includes("@")) {
        const email = trimDigitPrefixBleed(info.email.toLowerCase());
        if (!seen.has(email)) {
          seen.add(email);
          const context = `${vendor} chatbot config`;
          results.emails.push({
            value: email,
            context,
            // +15 over the base score: chatbot-config emails are explicitly
            // set by site admins as the contact address, so they outrank
            // generic free-text matches.
            score: Math.min(100, scoreEmail(email, context) + 15),
            source: `chatbot:${vendor}`,
          });
        }
      }

      // Direct phone (uncommon in widget configs, but check anyway).
      if (info.phone && typeof info.phone === "string") {
        const phoneRaw = info.phone.replace(/\s/g, "");
        const key = phoneKey(phoneRaw);
        if (key && key.length >= 10 && !seen.has(key)) {
          seen.add(key);
          const context = `${vendor} chatbot config`;
          results.phones.push({
            value: formatPhone(phoneRaw),
            context,
            score: 95,
            source: `chatbot:${vendor}`,
          });
        }
      }

      // Help-center URL: push into results.links so the side panel's
      // "Support pages" section surfaces it alongside /contact and /support.
      const builder = helpUrlForVendor[vendor];
      const url = builder ? builder(info) : null;
      if (url && !seen.has(url)) {
        seen.add(url);
        results.links.push({
          url,
          text: labelForVendor[vendor] || vendor,
          source: `chatbot:${vendor}`,
        });
      }
    });
  }

  // Scan curated page-level metadata for contacts. Every signal in here is
  // explicitly declared by the page author -- Open Graph, IndieWeb
  // rel=me, Facebook business contact properties, traditional <meta>
  // hints. Any contact we find via this path is high-confidence because
  // it was put there deliberately, not extracted from prose.
  //
  // Sources checked:
  //   - <meta property="og:email">                         (Open Graph)
  //   - <meta property="business:contact_data:email">      (Facebook)
  //   - <meta property="business:contact_data:phone_number"> (Facebook)
  //   - <meta name="contact"> / <meta name="reply-to">     (legacy)
  //   - <meta name="author" content="mailto:...">           (uncommon)
  //   - <link rel="me" href="mailto:..." / "tel:...">      (IndieWeb)
  //   - <link rel="author" href="mailto:...">              (HTML spec)
  function scanPageMeta(results, seen) {
    const META_EMAIL_KEYS = new Set([
      "og:email", "business:contact_data:email",
      "contact", "reply-to", "email",
    ]);
    const META_PHONE_KEYS = new Set([
      "business:contact_data:phone_number", "business:contact_data:phone",
      "phone", "telephone",
    ]);
    const META_MAYBE_EMAIL_KEYS = new Set(["author"]); // content may be "Name <a@b.com>" or "mailto:..."

    const pushEmail = (raw) => {
      if (!raw || typeof raw !== "string") return;
      // strip mailto: prefix and any "?subject=..." tail
      let val = raw.replace(/^\s*mailto:/i, "").split("?")[0].trim().toLowerCase();
      const m = val.match(EMAIL_REGEX);
      if (!m) return;
      const email = trimDigitPrefixBleed(m[0]);
      if (seen.has(email)) return;
      seen.add(email);
      const ctx = "page meta";
      results.emails.push({
        value: email,
        context: ctx,
        // +15 over scoreEmail floor: author-declared meta is the
        // strongest non-mailto signal we have.
        score: Math.min(100, scoreEmail(email, ctx) + 15),
        source: "meta",
      });
    };

    const pushPhone = (raw) => {
      if (!raw || typeof raw !== "string") return;
      const val = raw.replace(/^\s*tel:/i, "").trim();
      const cleaned = val.replace(/[^\d+]/g, "");
      if (cleaned.length < 10 || cleaned.length > 15) return;
      const key = phoneKey(cleaned);
      if (seen.has(key)) return;
      seen.add(key);
      const ctx = "page meta";
      results.phones.push({
        value: formatPhone(val),
        context: ctx,
        score: 98,
        source: "meta",
      });
    };

    try {
      document.querySelectorAll("meta[name], meta[property]").forEach((el) => {
        const key = (el.getAttribute("property") || el.getAttribute("name") || "").toLowerCase();
        const content = el.getAttribute("content") || "";
        if (!key || !content) return;
        if (META_EMAIL_KEYS.has(key)) pushEmail(content);
        else if (META_PHONE_KEYS.has(key)) pushPhone(content);
        else if (META_MAYBE_EMAIL_KEYS.has(key) && /@/.test(content)) pushEmail(content);
      });
    } catch (_) {}

    try {
      document.querySelectorAll('link[rel="me"], link[rel="author"]').forEach((el) => {
        const href = el.getAttribute("href") || "";
        if (/^mailto:/i.test(href)) pushEmail(href);
        else if (/^tel:/i.test(href)) pushPhone(href);
      });
    } catch (_) {}
  }

  // Detect press-release / media-contact blocks and extract contacts
  // from them with elevated confidence.
  //
  // Press releases follow a remarkably consistent convention across PR
  // wire services and corporate newsrooms: a block near the bottom of
  // the page labeled with one of a small set of headings ("Media
  // Contact:", "Press Contact:", "For more information:", "For media
  // inquiries:") followed by a name, then an email and / or phone. We
  // anchor on the heading text and extract within a +/-300 char window.
  //
  // Trigger conditions (any of the below):
  //   1. URL path matches a press / newsroom pattern (/press, /news/,
  //      /newsroom/, /media/, /press-release).
  //   2. The page body contains one of the press-anchor phrases.
  //
  // Contacts found via this path get +20 over the base scoreEmail and
  // a flat 95 phone score -- press contacts are specifically declared
  // contact channels, much higher confidence than generic prose.
  function scanPressContacts(results, seen) {
    if (!document.body) return;

    const PRESS_URL_PATTERNS = [
      /\/press(?:[-_\/]|$)/i,
      /\/newsroom/i,
      /\/media(?:[-_\/]|$)/i,
      /\/news\//i,
      /\/announcements?/i,
      /\/press-release/i,
    ];

    const PRESS_ANCHOR_PHRASES = [
      "media contact", "press contact", "media contacts", "press contacts",
      "media inquiries", "press inquiries",
      "for more information", "for further information",
      "for media inquiries", "for press inquiries",
      "press relations", "media relations",
      "for media", "media kit",
    ];

    const path = (window.location.pathname || "").toLowerCase();
    const urlSignal = PRESS_URL_PATTERNS.some((p) => p.test(path));

    // Lower-cased body text once, then search anchor positions inside it.
    let text;
    try {
      text = (document.body.innerText || document.body.textContent || "").toLowerCase();
    } catch (_) { return; }
    if (!text) return;

    const anchorPositions = [];
    PRESS_ANCHOR_PHRASES.forEach((phrase) => {
      let idx = 0;
      // findAll occurrences -- a long page may have several blocks
      while ((idx = text.indexOf(phrase, idx)) >= 0) {
        anchorPositions.push(idx);
        idx += phrase.length;
        if (anchorPositions.length >= 8) break; // sanity bound
      }
    });

    if (!urlSignal && !anchorPositions.length) return;

    // Collect candidate windows. URL-signal pages get the whole body;
    // anchor-signal pages get +/-300 chars around each anchor.
    const windows = [];
    if (urlSignal && !anchorPositions.length) {
      // URL-only: scan the whole body, but limit to the bottom half --
      // press contacts live near the bottom by convention, and limiting
      // the window keeps us from re-extracting body-prose contacts the
      // main scan already covered.
      const start = Math.floor(text.length * 0.5);
      windows.push(text.substring(start));
    } else {
      anchorPositions.forEach((idx) => {
        const start = Math.max(0, idx - 100);
        const end = Math.min(text.length, idx + 300);
        windows.push(text.substring(start, end));
      });
    }

    // Extract emails and phones from each window.
    windows.forEach((win) => {
      const emails = win.match(EMAIL_REGEX) || [];
      emails.forEach((raw) => {
        const email = trimDigitPrefixBleed(raw.toLowerCase());
        if (seen.has(email)) return;
        if (
          email.endsWith(".png") || email.endsWith(".jpg") || email.endsWith(".svg") ||
          email.includes("sentry") || email.includes("webpack") ||
          email.includes("example.com") || email.includes("noreply") ||
          email.includes("no-reply")
        ) return;
        seen.add(email);
        const ctx = "press / media contact";
        results.emails.push({
          value: email,
          context: ctx,
          score: Math.min(100, scoreEmail(email, ctx) + 20),
          source: "press",
        });
      });

      const phones = [
        ...(win.match(PHONE_REGEX) || []),
        ...(win.match(INTL_PHONE_REGEX) || []),
      ];
      phones.forEach((phone) => {
        const cleaned = phone.replace(/[^\d+]/g, "");
        if (cleaned.length < 10 || cleaned.length > 15) return;
        const key = phoneKey(cleaned);
        if (seen.has(key)) return;
        // Digit-run guard -- press-release date or article ID could
        // pattern-match as phone, require a separator or leading +.
        if (!/[+\-.\s()]/.test(phone)) return;
        seen.add(key);
        const ctx = "press / media contact";
        results.phones.push({
          value: formatPhone(phone),
          context: ctx,
          score: 95,
          source: "press",
        });
      });
    });
  }

  // Detect Apple App Store / Google Play app-listing pages and pull the
  // developer contact info both stores expose by policy.
  //
  // Apple App Store (apps.apple.com):
  //   - "Developer Website" -> external link in the "Information" section
  //   - "App Support" -> external link (often goes to support page)
  //   - The page itself shows a developer name; their site (if extracted)
  //     becomes a known contact-page candidate even though we don't
  //     fetch it here.
  //
  // Google Play (play.google.com):
  //   - Developer contact section exposes email and website explicitly.
  //   - Schema.org markup: <meta itemprop="email"> on the developer
  //     entity gives us the email directly.
  //   - Privacy policy / terms / support URLs all appear as labeled links.
  //
  // We surface emails, phones, and support-page URLs found here. Score
  // is high (90 for emails, 95 for phones) because store policies
  // require developers to provide working contact info.
  function scanAppStorePages(results, seen) {
    const host = (window.location.hostname || "").toLowerCase();
    const isApple = host === "apps.apple.com" || host.endsWith(".apps.apple.com");
    const isPlay  = host === "play.google.com" || host.endsWith(".play.google.com");
    if (!isApple && !isPlay) return;

    const platform = isApple ? "apple" : "play";

    // ---- emails ----
    // Both stores expose at least one mailto: link in their developer
    // info section. Catch those plus schema.org email properties.
    try {
      document.querySelectorAll('a[href^="mailto:"]').forEach((el) => {
        const raw = (el.getAttribute("href") || "").replace("mailto:", "").split("?")[0].trim().toLowerCase();
        if (!raw || !raw.includes("@")) return;
        const email = trimDigitPrefixBleed(raw);
        if (seen.has(email)) return;
        seen.add(email);
        const ctx = `${platform === "apple" ? "Apple App Store" : "Google Play"} developer contact`;
        results.emails.push({
          value: email,
          context: ctx,
          score: 90,
          source: `appstore:${platform}`,
        });
      });
    } catch (_) {}

    // Schema.org developer email -- Google Play uses these on its app pages.
    try {
      document.querySelectorAll('[itemprop="email"]').forEach((el) => {
        const raw = ((el.getAttribute("content") || el.textContent || "")).trim().toLowerCase();
        if (!raw || !raw.includes("@")) return;
        const m = raw.match(EMAIL_REGEX);
        if (!m) return;
        const email = trimDigitPrefixBleed(m[0]);
        if (seen.has(email)) return;
        seen.add(email);
        const ctx = `${platform === "apple" ? "Apple App Store" : "Google Play"} developer contact`;
        results.emails.push({
          value: email,
          context: ctx,
          score: 90,
          source: `appstore:${platform}`,
        });
      });
    } catch (_) {}

    // ---- phones ----
    try {
      document.querySelectorAll('a[href^="tel:"]').forEach((el) => {
        const phone = (el.getAttribute("href") || "").replace("tel:", "").replace(/\s/g, "");
        if (!phone || phone.length < 10) return;
        const key = phoneKey(phone);
        if (seen.has(key)) return;
        seen.add(key);
        const ctx = `${platform === "apple" ? "Apple App Store" : "Google Play"} developer contact`;
        results.phones.push({
          value: formatPhone(phone),
          context: ctx,
          score: 95,
          source: `appstore:${platform}`,
        });
      });
    } catch (_) {}

    // ---- developer website + support links ----
    // Promote labeled "Developer Website" / "App Support" / "Privacy
    // Policy" links into results.links so the side panel's support
    // section surfaces them as next-step destinations the user can
    // click into.
    const supportLabels = [
      "developer website", "developer page", "developer info",
      "app support", "support", "support page",
      "privacy policy", "privacy", "terms",
      "website", "contact us", "contact",
    ];
    try {
      document.querySelectorAll("a[href]").forEach((a) => {
        const text = (a.textContent || "").trim().toLowerCase();
        if (!text) return;
        if (!supportLabels.some((lbl) => text.includes(lbl))) return;
        const href = a.href || "";
        if (!href.startsWith("http")) return;
        // Reject the store's own internal nav links -- only surface
        // external developer-owned destinations.
        try {
          const u = new URL(href);
          if (u.hostname === host) return;
        } catch (_) { return; }
        if (seen.has(href)) return;
        seen.add(href);
        results.links.push({
          url: href,
          text: a.textContent.trim().substring(0, 60),
          source: `appstore:${platform}`,
        });
      });
    } catch (_) {}
  }

  // Footer-specialized contact extraction. Three things this pass adds
  // beyond the generic CONTACT_SELECTORS body-text scan:
  //
  //   1. Wider footer detection. Cascades through <footer>,
  //      [role="contentinfo"], [class*="footer"], [id*="footer"] --
  //      catching cases the generic [class*="footer"] selector
  //      already does, plus the semantic HTML5 <footer> and the
  //      ARIA contentinfo landmark.
  //
  //   2. Labeled-field extraction. Looks for "Email:", "Tel:",
  //      "Phone:", "Fax:", "Toll Free:", "Sales:", "Support:" and
  //      similar label-prefixed values. The label becomes part of
  //      the context string so the side panel can show "(Toll Free)"
  //      or "(Sales)" next to the number.
  //
  //   3. Score boost. Anything found inside a footer gets +10 over
  //      the standard scorePhone / scoreEmail output. Footer contacts
  //      are conventionally the canonical contact surface for a
  //      business, not casually-mentioned numbers in body prose.
  function scanFooterSpecialized(results, seen) {
    const FOOTER_SELECTORS = [
      "footer", '[role="contentinfo"]',
      '[class*="footer" i]', '[id*="footer" i]',
      '[class*="site-info" i]', '[class*="copyright" i]',
    ];
    const footers = new Set();
    FOOTER_SELECTORS.forEach((sel) => {
      try {
        document.querySelectorAll(sel).forEach((el) => footers.add(el));
      } catch (_) {}
    });
    if (!footers.size) return;

    // Match label + value pairs. Captured label normalises to the
    // intent type ("toll free", "fax", "support", etc.). Captured value
    // is the email or phone literal.
    //
    // Pattern: <label>: <whitespace>* <value>
    // - Label: one of the recognized prefixes
    // - Separator: ":" or "-" or "—" or " is "
    // - Value: rest of line up to a newline or end-of-string-window
    const LABEL_PATTERN = /\b(toll[\s-]?free|toll[\s-]?free\s+phone|fax|tel|telephone|phone|email|e-mail|mailto|sales|support|customer\s+service|customer\s+care|main\s+(?:line|office|number)|reservations?|emergency|after\s+hours|press|media|info)\s*[:\-–—]\s*([^\n\r]{1,80})/gi;

    // Also try direct email/phone matches even without labels -- but
    // ONLY if the footer text mentions a contact keyword somewhere
    // (very weak proximity gate so we don't grab nav copyright phones).

    footers.forEach((el) => {
      let text;
      try {
        text = el.innerText || el.textContent || "";
      } catch (_) { return; }
      if (!text) return;

      // Pass A: labeled fields
      let m;
      LABEL_PATTERN.lastIndex = 0;
      while ((m = LABEL_PATTERN.exec(text)) !== null) {
        const label = (m[1] || "").trim().toLowerCase().replace(/\s+/g, " ");
        const value = (m[2] || "").trim();
        if (!value) continue;

        // Email-shaped value
        const emailMatch = value.match(EMAIL_REGEX);
        if (emailMatch) {
          const email = trimDigitPrefixBleed(emailMatch[0].toLowerCase());
          if (!seen.has(email) && !email.includes("example.com") && !email.includes("noreply") && !email.includes("no-reply")) {
            seen.add(email);
            const ctx = `footer (${label})`;
            results.emails.push({
              value: email,
              context: ctx,
              score: Math.min(100, scoreEmail(email, ctx) + 10),
              source: "footer",
            });
          }
          continue;
        }

        // Phone-shaped value
        const phoneMatch =
          value.match(PHONE_REGEX) ||
          value.match(INTL_PHONE_REGEX);
        if (phoneMatch) {
          const phone = phoneMatch[0];
          const cleaned = phone.replace(/[^\d+]/g, "");
          if (cleaned.length < 10 || cleaned.length > 15) continue;
          if (!/[+\-.\s()]/.test(phone)) continue;
          const key = phoneKey(cleaned);
          if (seen.has(key)) continue;
          seen.add(key);
          const ctx = `footer (${label})`;
          results.phones.push({
            value: formatPhone(phone),
            context: ctx,
            score: Math.min(100, scorePhone(ctx) + 10),
            source: "footer",
          });
        }
      }
    });
  }

  // ====================================================================
  // SITE-SPECIFIC OVERRIDE LIBRARY
  //
  // A curated registry of canonical support contacts for the painful-
  // to-scrape sites users come to Find Me People to escape -- airlines
  // that hide their phone number behind 4 chatbot prompts, telcos that
  // gate everything behind a login, banks whose contact page is a
  // half-megabyte JS app.
  //
  // Each entry maps a host (or a host pattern) to a set of
  // pre-verified contacts that the extension surfaces directly when
  // the user is on that host, without needing to scrape anything.
  //
  // How to add an entry:
  //   1. Find the company's canonical support contact info from an
  //      authoritative public source (their own contact page, their
  //      Wikipedia infobox, their SEC 10-K, etc.).
  //   2. Stamp the entry with `lastVerified: "YYYY-MM-DD"` so anyone
  //      auditing the registry later can see when it was checked.
  //   3. The hostname KEY is the apex domain. The function does the
  //      "www." stripping and subdomain matching automatically.
  //
  // How an entry interacts with the live page scan:
  //   - Overrides are added to results AFTER the in-page scan paths
  //     run, but they go through the same canonical phoneKey /
  //     trimDigitPrefixBleed dedup helpers. So if the live page DID
  //     surface the same number, the override is silently skipped --
  //     no duplicates.
  //   - Score 85: high (above body-text scorePhone, below tel: link
  //     and meta-tag floors). Reflects "we trust this but it's not
  //     from the live page right now."
  //   - source: "site-override" so per-source debug can identify it.
  //
  // Stale-entry policy: if the user reports a number is wrong, prefer
  // removing the entry over editing it -- the next scan will fall
  // back to whatever the live page exposes. Better to surface
  // nothing than to surface a dead number.
  // ====================================================================
  const SITE_OVERRIDES = {
    // ---- Airlines ----
    "spirit.com": {
      label: "Spirit Airlines", category: "airline", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-855-728-3555", role: "Reservations / customer service" },
      ],
    },
    "united.com": {
      label: "United Airlines", category: "airline", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-864-8331", role: "Reservations" },
      ],
    },
    "delta.com": {
      label: "Delta Air Lines", category: "airline", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-221-1212", role: "Reservations" },
      ],
    },
    "aa.com": {
      label: "American Airlines", category: "airline", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-433-7300", role: "Reservations" },
      ],
    },
    "jetblue.com": {
      label: "JetBlue Airways", category: "airline", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-538-2583", role: "Reservations" },
      ],
    },
    "southwest.com": {
      label: "Southwest Airlines", category: "airline", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-435-9792", role: "Customer service" },
      ],
    },

    // ---- Telcos / ISPs ----
    "xfinity.com": {
      label: "Xfinity / Comcast", category: "telco", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-934-6489", role: "Customer service" },
      ],
    },
    "comcast.com": {
      label: "Comcast", category: "telco", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-934-6489", role: "Customer service" },
      ],
    },
    "att.com": {
      label: "AT&T", category: "telco", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-331-0500", role: "Customer service" },
      ],
    },
    "verizon.com": {
      label: "Verizon", category: "telco", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-922-0204", role: "Customer service" },
      ],
    },
    "t-mobile.com": {
      label: "T-Mobile", category: "telco", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-937-8997", role: "Customer service" },
      ],
    },

    // ---- Banks ----
    "wellsfargo.com": {
      label: "Wells Fargo", category: "bank", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-869-3557", role: "Customer service" },
      ],
    },
    "bankofamerica.com": {
      label: "Bank of America", category: "bank", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-432-1000", role: "Customer service" },
      ],
    },
    "chase.com": {
      label: "Chase", category: "bank", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-935-9935", role: "Customer service" },
      ],
    },
    "citi.com": {
      label: "Citi", category: "bank", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-374-9700", role: "Customer service" },
      ],
    },

    // ---- E-commerce / payments ----
    "amazon.com": {
      label: "Amazon", category: "ecommerce", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-888-280-4331", role: "Customer service" },
      ],
    },
    "ebay.com": {
      label: "eBay", category: "ecommerce", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-866-540-3229", role: "Customer service" },
      ],
    },
    "paypal.com": {
      label: "PayPal", category: "payments", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-888-221-1161", role: "Customer service" },
      ],
    },

    // ---- Streaming ----
    "netflix.com": {
      label: "Netflix", category: "streaming", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-866-579-7172", role: "Customer service" },
      ],
    },
    "hulu.com": {
      label: "Hulu", category: "streaming", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-888-265-6650", role: "Customer service" },
      ],
    },

    // ---- Insurance ----
    "geico.com": {
      label: "GEICO", category: "insurance", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-861-8380", role: "Customer service" },
      ],
    },
    "statefarm.com": {
      label: "State Farm", category: "insurance", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-782-8332", role: "Customer service" },
      ],
    },

    // ---- Government (often have phone but buried) ----
    "irs.gov": {
      label: "IRS", category: "government", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-829-1040", role: "Individual taxpayer line" },
      ],
    },
    "ssa.gov": {
      label: "Social Security Administration", category: "government", lastVerified: "2026-06-01",
      phones: [
        { value: "+1-800-772-1213", role: "Customer service" },
      ],
    },
  };

  // Look up the override entry that matches the current page's hostname.
  // Normalizes by stripping "www." and matching the registry key as a
  // suffix -- so any subdomain of an entry inherits the override (e.g.
  // help.spirit.com matches the spirit.com entry).
  function lookupSiteOverride(hostname) {
    if (!hostname) return null;
    const host = hostname.toLowerCase().replace(/^www\./, "");
    if (SITE_OVERRIDES[host]) return SITE_OVERRIDES[host];
    // Suffix match: walk up subdomain levels until we either find an
    // entry or run out of dots.
    let parts = host.split(".");
    while (parts.length > 1) {
      parts.shift();
      const candidate = parts.join(".");
      if (SITE_OVERRIDES[candidate]) return SITE_OVERRIDES[candidate];
    }
    return null;
  }

  function applySiteOverrides(results, seen) {
    let entry;
    try {
      entry = lookupSiteOverride(window.location.hostname);
    } catch (_) { return; }
    if (!entry) return;

    const ctxBase = `${entry.label} (site-known`;

    (entry.phones || []).forEach((p) => {
      if (!p || !p.value) return;
      const key = phoneKey(p.value);
      if (!key || key.length < 10 || seen.has(key)) return;
      seen.add(key);
      const ctx = `${ctxBase} ${p.role || "support"})`;
      results.phones.push({
        value: formatPhone(p.value),
        context: ctx,
        score: 85,
        source: "site-override",
      });
    });

    (entry.emails || []).forEach((e) => {
      if (!e || !e.value) return;
      const email = trimDigitPrefixBleed(String(e.value).toLowerCase());
      if (!email.includes("@") || seen.has(email)) return;
      seen.add(email);
      const ctx = `${ctxBase} ${e.role || "support"})`;
      results.emails.push({
        value: email,
        context: ctx,
        score: 85,
        source: "site-override",
      });
    });

    (entry.links || []).forEach((l) => {
      if (!l || !l.url) return;
      if (seen.has(l.url)) return;
      seen.add(l.url);
      results.links.push({
        url: l.url,
        text: l.text || `${entry.label} contact page`,
        source: "site-override",
      });
    });
  }

  // Walk every iframe on the page; for any that is same-origin (i.e. we can
  // access contentDocument without SecurityError), recurse the scanner's
  // text-extraction step into its body. Bounded to one level of recursion
  // to avoid pathological deeply-nested iframe trees from chat widgets.
  //
  // Dedup keys (phoneKey, trimDigitPrefixBleed) match the canonical helpers
  // the top-level scan uses, so a number/email surfaced in both the iframe
  // and the parent document collapses to one entry.
  function scanSameOriginIframes(results, seen, depth) {
    depth = depth || 0;
    if (depth > 1) return; // cap recursion
    const frames = document.querySelectorAll("iframe");
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      let doc = null;
      try {
        // Accessing contentDocument on a cross-origin iframe throws
        // SecurityError -- we catch it and continue. Same-origin returns
        // the inner Document we can scan.
        doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
      } catch (_) {
        doc = null;
      }
      if (!doc || !doc.body) continue;

      // Extract from the iframe's body innerText, plus any mailto/tel anchors
      // it carries -- those are higher-confidence than free text.
      try {
        doc.querySelectorAll('a[href^="mailto:"]').forEach((el) => {
          const raw = (el.getAttribute("href") || "").replace("mailto:", "").split("?")[0].toLowerCase();
          if (!raw || !raw.includes("@")) return;
          const email = trimDigitPrefixBleed(raw);
          if (seen.has(email)) return;
          seen.add(email);
          const context = "iframe: " + (frame.title || frame.name || frame.src || "(embedded)");
          results.emails.push({
            value: email,
            context,
            score: scoreEmail(email, context),
            source: "iframe-mailto",
          });
        });
        doc.querySelectorAll('a[href^="tel:"]').forEach((el) => {
          const phone = (el.getAttribute("href") || "").replace("tel:", "").replace(/\s/g, "");
          if (!phone || phone.length < 10) return;
          const key = phoneKey(phone);
          if (seen.has(key)) return;
          seen.add(key);
          const context = "iframe: " + (frame.title || frame.name || frame.src || "(embedded)");
          results.phones.push({
            value: formatPhone(phone),
            context,
            score: 90,
            source: "iframe-tel",
          });
        });

        const text = (doc.body && doc.body.innerText) || "";
        if (text) {
          extractFromText(text, doc.body, results, seen, { requireProximityAnchor: true });
        }
      } catch (_) {
        // SecurityError mid-walk (happens when an iframe re-navigates to a
        // cross-origin URL between our access check and the read). Skip.
      }
    }
  }

  // Last-resort fallback: when scanning the current page yields zero
  // contacts, GET a small list of common same-origin contact-page URLs
  // (/contact, /about, /support, etc.), parse the responses, and merge any
  // emails/phones into the existing results. Fire-and-forget by design --
  // the popup's view may not pick up results from the first scan if the
  // fetch hasn't returned yet; the user can hit Rescan or reopen the popup
  // and the badge update will reflect new finds.
  //
  // Safety guards:
  //   - sessionStorage flag: one attempt per origin per session
  //   - credentials: 'same-origin' so we behave exactly like the user
  //     clicking the link from this same site -- the user's existing
  //     session cookies tag along. We deliberately did NOT use 'omit'
  //     because Cloudflare-protected sites (a sizable fraction of the
  //     public web) gate even public pages behind a cf_clearance cookie
  //     the user already has from their normal browsing; without it our
  //     fetch gets a bot-challenge body back instead of the real page.
  //     Since the fetch is same-origin by design, the cookies sent are
  //     ones the user already has on this site -- no third-party
  //     identification, no cross-site tracking.
  //   - same-origin only; redirects to a different origin are rejected
  //   - response size capped at 1 MB to bound parse latency
  //   - max 3 candidate paths tried; stops at first one with results
  //
  // Dedup keys (phoneKey, trimDigitPrefixBleed) are the same helpers the
  // synchronous scan paths use, so a number/email surfaced first by the
  // DOM scan and again by the fallback fetch collapses to one entry.
  // Fetch /sitemap.xml (and /sitemap_index.xml as a fallback), extract
  // every URL that matches CONTACT_PAGE_PATTERNS, and pipe them through
  // the same discovered-page fetch path. Many large sites (gov,
  // enterprise, news orgs) surface canonical contact / press /
  // newsroom pages in their sitemap that the homepage links section
  // never touches.
  //
  // Bounding:
  //   - Once per origin per browsing session (sessionStorage gate)
  //   - 2 MB body cap on the sitemap response
  //   - Up to 5 contact-pattern URLs queued (existing 5-URL cap inside
  //     fetchDiscoveredContactPages still applies)
  //   - Same-origin only -- cross-origin sitemap redirects are dropped
  //   - credentials: 'same-origin' (same Cloudflare-friendly default
  //     the rest of our background fetches use)
  async function fetchSitemapContactUrls(results, seen) {
    const origin = window.location.origin;
    if (!/^https?:/.test(window.location.protocol)) return;

    try {
      const CACHE_KEY = "__fmp_sitemap_attempted";
      if (sessionStorage.getItem(CACHE_KEY)) return;
      sessionStorage.setItem(CACHE_KEY, "1");
    } catch (_) {
      return;
    }

    const candidates = [origin + "/sitemap.xml", origin + "/sitemap_index.xml"];
    let xml = null;
    for (const url of candidates) {
      try {
        const resp = await fetch(url, {
          credentials: "same-origin",
          redirect: "follow",
          cache: "no-cache",
        });
        if (!resp.ok) continue;
        try {
          if (new URL(resp.url).origin !== origin) continue;
        } catch (_) { continue; }
        const text = await resp.text();
        if (!text || text.length > 2 * 1024 * 1024) continue;
        // Sanity check: real sitemap XML carries the sitemaps.org
        // namespace. Bot-challenge HTML bodies won't.
        if (!/<urlset|<sitemapindex/i.test(text)) continue;
        xml = text;
        break;
      } catch (_) { /* try the next candidate */ }
    }
    if (!xml) return;

    // Extract <loc>URL</loc> entries -- works for both <urlset> and
    // <sitemapindex> (we won't recurse into sub-sitemaps in this pass;
    // the top-level sitemap.xml usually exposes the contact pages
    // directly, and a single recursion bound keeps the fetch budget
    // tight).
    const locs = [];
    const re = /<loc[^>]*>\s*([^<]+?)\s*<\/loc>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const u = m[1].trim();
      if (!u || locs.length >= 200) break; // sanity cap
      locs.push(u);
    }

    const contactUrls = [];
    for (const u of locs) {
      if (contactUrls.length >= 5) break;
      try {
        const parsed = new URL(u);
        if (parsed.origin !== origin) continue;
        if (!CONTACT_PAGE_PATTERNS.some((p) => p.test(parsed.pathname))) continue;
        if (seen.has(u)) continue;
        contactUrls.push(u);
      } catch (_) { /* skip malformed */ }
    }

    if (contactUrls.length) {
      // Push to results.links so they surface in the Support pages
      // section regardless of whether the fetch finds new contacts.
      contactUrls.forEach((u) => {
        if (!seen.has(u)) {
          seen.add(u);
          results.links.push({
            url: u,
            text: "From sitemap.xml",
            source: "sitemap",
          });
        }
      });
      // Pipe through the existing discovered-page fetcher.
      await fetchDiscoveredContactPages(contactUrls, results, seen);
    }
  }

  // Background-fetch a list of discovered same-origin contact-page URLs
  // (collected during the main scan via CONTACT_PAGE_PATTERNS) and merge
  // any emails / phones found into results. Distinct from
  // fetchAndScanFallbackPages:
  //
  //   - That function fires only when the in-page scan returned zero
  //     contacts, tries a hardcoded list of common paths, and stops at
  //     the first hit.
  //
  //   - This function fires when the in-page scan DID find contact-page
  //     links, fetches each (up to a 5-URL budget), and merges every
  //     hit. This is what surfaces /media-contacts AND
  //     /direct-contact-information on dhs.gov instead of only the first.
  //
  // Bounding:
  //   - Max 5 fetches per scan
  //   - Same-origin only; cross-origin redirects discarded
  //   - Per-URL sessionStorage gate ("__fmp_fetched_<url>") so re-scans
  //     and page navigations don't re-fetch
  //   - 1 MB body cap per response
  //   - credentials: 'same-origin' -- the user's existing cookies for
  //     this site come along, so Cloudflare-style cookie-gated content
  //     (cf_clearance, etc.) is reachable. Since the fetch is same-
  //     origin by design, the cookies sent are ones the user already
  //     has on this site -- equivalent to them clicking the link
  //     themselves. No third-party identification, no cross-site
  //     tracking.
  //
  // Found contacts use the canonical phoneKey / trimDigitPrefixBleed
  // helpers, so duplicates against the in-page scan collapse to one entry.
  async function fetchDiscoveredContactPages(urls, results, seen) {
    if (!Array.isArray(urls) || !urls.length) return;
    if (!/^https?:/.test(window.location.protocol)) return;
    const origin = window.location.origin;

    // Filter to same-origin URLs that haven't been fetched this session
    // and reserve their sessionStorage flags up-front (race-tolerant).
    const targets = [];
    const seenInBatch = new Set();
    for (const url of urls) {
      if (targets.length >= 5) break;
      if (seenInBatch.has(url)) continue;
      seenInBatch.add(url);
      try {
        if (new URL(url).origin !== origin) continue;
      } catch (_) { continue; }
      const cacheKey = "__fmp_fetched_" + url;
      try {
        if (sessionStorage.getItem(cacheKey)) continue;
        sessionStorage.setItem(cacheKey, "1");
      } catch (_) { continue; }
      targets.push(url);
    }
    if (!targets.length) return;

    let added = 0;
    for (const url of targets) {
      try {
        const resp = await fetch(url, {
          credentials: "same-origin",
          redirect: "follow",
          cache: "no-cache",
        });
        if (!resp.ok) continue;
        try {
          if (new URL(resp.url).origin !== origin) continue;
        } catch (_) { continue; }

        const text = await resp.text();
        if (!text || text.length > 1024 * 1024) continue;

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/html");
        if (!doc || !doc.body) continue;

        const ctx = "from " + (new URL(url).pathname || url);

        // mailto: / tel: anchors -- highest confidence on a contact page.
        doc.querySelectorAll('a[href^="mailto:"]').forEach((el) => {
          const raw = (el.getAttribute("href") || "").replace("mailto:", "").split("?")[0].toLowerCase();
          if (!raw || !raw.includes("@")) return;
          const email = trimDigitPrefixBleed(raw);
          if (seen.has(email)) return;
          seen.add(email);
          results.emails.push({
            value: email,
            context: ctx,
            score: Math.min(100, scoreEmail(email, ctx) + 10),
            source: "discovered-page",
          });
          added++;
        });
        doc.querySelectorAll('a[href^="tel:"]').forEach((el) => {
          const phone = (el.getAttribute("href") || "").replace("tel:", "").replace(/\s/g, "");
          if (!phone || phone.length < 10) return;
          const key = phoneKey(phone);
          if (seen.has(key)) return;
          seen.add(key);
          results.phones.push({
            value: formatPhone(phone),
            context: ctx,
            score: 95,
            source: "discovered-page",
          });
          added++;
        });

        // Body text -- with proximity-anchor required for phones, same
        // bar as the live-page loose-body scan.
        const body = (doc.body && doc.body.innerText) || "";
        if (body) {
          const before = results.emails.length + results.phones.length;
          extractFromText(body, doc.body, results, seen, { requireProximityAnchor: true });
          added += (results.emails.length + results.phones.length) - before;
        }
      } catch (_) {
        // Network error, parse error, CORS block -- silent skip.
      }
    }

    if (added > 0) {
      results.emails.sort((a, b) => b.score - a.score);
      results.phones.sort((a, b) => b.score - a.score);
      const total = results.emails.length + results.phones.length;
      try {
        chrome.runtime.sendMessage({ action: "updateBadge", count: total }).catch(() => {});
      } catch (_) {}
    }
  }

  async function fetchAndScanFallbackPages(results, seen) {
    if (results.emails.length + results.phones.length > 0) return;
    const origin = window.location.origin;
    if (!/^https?:/.test(window.location.protocol)) return;

    // Once-per-session-per-origin gate
    try {
      const CACHE_KEY = "__fmp_fallback_attempted";
      if (sessionStorage.getItem(CACHE_KEY)) return;
      sessionStorage.setItem(CACHE_KEY, "1");
    } catch (_) {
      // sessionStorage blocked (some privacy modes); bail rather than risk
      // unbounded re-fetching on every rescan tick.
      return;
    }

    const currentPath = (window.location.pathname || "/").replace(/\/$/, "") || "/";
    const candidatePaths = [
      "/contact", "/contact-us", "/about", "/about-us",
      "/support", "/help", "/customer-service",
    ];
    const targets = candidatePaths.filter((p) => p !== currentPath).slice(0, 3);

    for (const path of targets) {
      try {
        const url = origin + path;
        const resp = await fetch(url, {
          credentials: "same-origin",
          redirect: "follow",
          cache: "no-cache",
        });
        if (!resp.ok) continue;
        // Reject responses that redirected away from the origin
        try {
          if (new URL(resp.url).origin !== origin) continue;
        } catch (_) { continue; }

        const text = await resp.text();
        if (!text || text.length > 1024 * 1024) continue;

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/html");
        if (!doc || !doc.body) continue;

        // mailto: / tel: anchors in the fetched HTML get a +10 boost over
        // body-text matches -- explicit links on a contact page are high
        // confidence signal.
        doc.querySelectorAll('a[href^="mailto:"]').forEach((el) => {
          const raw = (el.getAttribute("href") || "").replace("mailto:", "").split("?")[0].toLowerCase();
          if (!raw || !raw.includes("@")) return;
          const email = trimDigitPrefixBleed(raw);
          if (seen.has(email)) return;
          seen.add(email);
          const ctx = `from ${path}`;
          results.emails.push({
            value: email,
            context: ctx,
            score: Math.min(100, scoreEmail(email, ctx) + 10),
            source: "fetch",
          });
        });
        doc.querySelectorAll('a[href^="tel:"]').forEach((el) => {
          const phone = (el.getAttribute("href") || "").replace("tel:", "").replace(/\s/g, "");
          if (!phone || phone.length < 10) return;
          const key = phoneKey(phone);
          if (seen.has(key)) return;
          seen.add(key);
          const ctx = `from ${path}`;
          results.phones.push({
            value: formatPhone(phone),
            context: ctx,
            score: 90,
            source: "fetch",
          });
        });

        // Body-text scan over the fetched page. Loose-body scope on a
        // fetched /contact or /about response: keep the proximity anchor
        // requirement on so we don't pull a press-release date or a board
        // member's personal cell out as a "found contact." mailto: / tel:
        // anchors above already covered the high-confidence cases.
        const body = (doc.body && doc.body.innerText) || "";
        if (body) extractFromText(body, doc.body, results, seen, { requireProximityAnchor: true });

        // Re-sort after merging fresh results
        results.emails.sort((a, b) => b.score - a.score);
        results.phones.sort((a, b) => b.score - a.score);

        // Push an updated badge count so the toolbar reflects the new finds
        const total = results.emails.length + results.phones.length;
        try {
          chrome.runtime.sendMessage({ action: "updateBadge", count: total }).catch(() => {});
        } catch (_) {}

        if (total > 0) return; // stop fetching once we have something
      } catch (_) {
        // Network error, parse error, blocked by CORS, etc. -- silent skip
      }
    }
  }

  // Strip a leading run of 5+ digits-then-letter from an email's local part.
  // That shape is almost always cross-element DOM bleed where text from a
  // sibling node (zip code, postal code, phone digits, order ID) got glued
  // to the start of the real local part because the join produced no
  // whitespace -- typically when innerText is unavailable or when two
  // inline elements sit immediately adjacent. Real local parts that start
  // with 5+ digits before a letter are vanishingly rare; the bleed cases
  // are common (US 5-digit zips, 6-digit postal codes, account numbers).
  //
  // Conservative threshold: 5 digits minimum. "123support@x.com" stays as
  // is; "77546thesanctuarygymtx@outlook.com" becomes
  // "thesanctuarygymtx@outlook.com".
  function trimDigitPrefixBleed(email) {
    return email.replace(/^\d{5,}(?=[a-z])/, "");
  }

  // Anchor keywords that signal a phone number is a real contact number
  // rather than a stray digit run. We require at least one of these in the
  // +/-100 character window around a phone match when scanning loose body
  // text (Google search results pages, business directories, social feeds,
  // anywhere a phone might appear without contact context). Without this,
  // every snippet phone on a Google search page lands in results because
  // the page-level scorePhone() check sees plenty of words page-wide but
  // tells us nothing about the phone's actual surroundings.
  //
  // Each entry below is a lowercase substring that, if present in the
  // surrounding text, is enough to anchor the phone.
  const PHONE_PROXIMITY_ANCHORS = [
    "contact", "support", "customer service", "customer care",
    "help line", "help desk", "service desk", "care team",
    "call us", "call:", "call our", "phone:", "phone us",
    "tel:", "tel.", "telephone:", "ph:", "ph.", "ph ",
    "reach us", "reach out", "talk to", "speak to", "speak with",
    "toll free", "toll-free", "tollfree", "hotline",
    "billing", "tech support", "technical support",
    "main office", "main number", "main line", "front desk",
    "sales line", "sales:", "info:", "info ",
    "fax", "after hours", "emergency", "concierge",
  ];

  // Pull a +/-N character window around a literal match within text. Used
  // by extractFromText's loose-body mode to inspect the phone's neighborhood
  // for a contact-context anchor.
  function surroundingTextFor(text, match, windowChars) {
    const w = windowChars || 100;
    const idx = text.indexOf(match);
    if (idx < 0) return "";
    return text.substring(
      Math.max(0, idx - w),
      Math.min(text.length, idx + match.length + w)
    ).toLowerCase();
  }

  function hasPhoneProximityAnchor(surrounding) {
    if (!surrounding) return false;
    return PHONE_PROXIMITY_ANCHORS.some((k) => surrounding.includes(k));
  }

  // opts.requireProximityAnchor: when true, drop phone matches whose +/-100
  // character window contains no contact-context keyword. Used by the
  // loose-body scan to keep Google search results / directory pages /
  // social feeds from dumping every snippet phone into the results.
  // The narrow CONTACT_SELECTORS scans don't set this flag because they
  // already proved contact-context at the container level.

  // Identify the Zendesk subdomain for the current page, or null if the
  // page isn't a Zendesk help center / doesn't carry a Web Widget that
  // tells us which Zendesk account it belongs to.
  //
  // Three signals checked in order:
  //   1. Current host matches "{sub}.zendesk.com" -- the user is already
  //      on a Zendesk help center (e.g. support.zendesk.com).
  //   2. A <script> on the page points at static.zdassets.com with a
  //      ?key= query param -- the Zendesk Web Widget snippet, used on
  //      marketing pages that load the embedded chat. The key IS the
  //      account subdomain.
  //   3. A <script> on the page points at "{sub}.zendesk.com/..." --
  //      Help Center alias pages and embedded resources.
  //
  // Returns the subdomain string or null. Cheap (just DOM queries +
  // regex), so safe to call on every page.
  function detectZendeskSubdomain() {
    try {
      const hostMatch = window.location.hostname.match(/^([a-z0-9-]+)\.zendesk\.com$/i);
      if (hostMatch) return hostMatch[1].toLowerCase();
    } catch (_) {}
    const scripts = document.querySelectorAll('script[src*="zdassets"], script[src*="zendesk.com"]');
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].src || "";
      const keyMatch = src.match(/static\.zdassets\.com\/ekr\/[^?]+\?key=([a-z0-9-]+)/i);
      if (keyMatch) return keyMatch[1].toLowerCase();
      const subMatch = src.match(/\/\/([a-z0-9-]+)\.zendesk\.com\//i);
      if (subMatch) return subMatch[1].toLowerCase();
    }
    return null;
  }

  // Query the public Zendesk Help Center search API for contact-related
  // articles, extract emails/phones from the article bodies, and merge
  // them into results in place.
  //
  // The bot the user sees in the Zendesk Web Widget is a thin RAG layer
  // over these very articles. Reading them directly returns the same
  // contact info the bot would surface if the user managed to navigate
  // its escalation flow -- without any chat-UI interaction.
  //
  // Behavior:
  //   - Fire-and-forget: scanPage stays synchronous, the fetch resolves
  //     out-of-band and mutates results. badge gets re-pushed via
  //     updateBadge after merge.
  //   - Once per subdomain per session (sessionStorage flag) -- a typical
  //     site only needs one query, and rescans shouldn't repeat it.
  //   - credentials: "omit" -- no cookies. From Zendesk's view we look
  //     like any unauthenticated visitor hitting their public search.
  //   - Bounded: per_page=10, body capped at 1 MB before parse, results
  //     loop bails after 25 articles.
  //   - Articles get a score floor of 95 -- they come from the company's
  //     own knowledge base, which is the highest-confidence source we
  //     have short of a mailto: link.
  async function fetchZendeskHelpCenter(subdomain, results, seen) {
    if (!subdomain || typeof subdomain !== "string") return;

    // Once-per-session-per-subdomain gate
    try {
      const CACHE_KEY = "__fmp_zendesk_searched_" + subdomain;
      if (sessionStorage.getItem(CACHE_KEY)) return;
      sessionStorage.setItem(CACHE_KEY, "1");
    } catch (_) {
      return;
    }

    const url = "https://" + subdomain + ".zendesk.com/api/v2/help_center/articles/search.json?per_page=10&query=contact";
    let json;
    try {
      const resp = await fetch(url, {
        credentials: "omit",
        redirect: "follow",
        cache: "no-cache",
      });
      if (!resp.ok) return;
      const text = await resp.text();
      if (!text || text.length > 1024 * 1024) return;
      try { json = JSON.parse(text); } catch (_) { return; }
    } catch (_) {
      return;
    }

    if (!json || !Array.isArray(json.results)) return;

    let added = 0;
    const articles = json.results.slice(0, 25);
    for (const article of articles) {
      if (!article || typeof article.body !== "string") continue;

      // The body is HTML. Strip tags before running our text regexes so
      // attribute values (href="mailto:..." etc.) and tag boundaries
      // don't pollute the match. innerText-style extraction via a
      // throwaway DOMParser doc would be more thorough; a tag-strip
      // suffices here because Zendesk article bodies are simple.
      const stripped = article.body
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/\s+/g, " ");

      const articleUrl = article.html_url || article.url || "";
      const articleTitle = (article.title || "").substring(0, 80);
      const context = "Zendesk KB: " + articleTitle;

      // Emails
      const emailMatches = stripped.match(EMAIL_REGEX) || [];
      emailMatches.forEach((email) => {
        email = trimDigitPrefixBleed(email.toLowerCase());
        if (seen.has(email)) return;
        if (
          email.endsWith(".png") || email.endsWith(".jpg") || email.endsWith(".svg") ||
          email.includes("sentry") || email.includes("webpack") ||
          email.includes("example.com") || email.includes("noreply") ||
          email.includes("no-reply")
        ) return;
        seen.add(email);
        results.emails.push({
          value: email,
          context,
          // 95 floor: the company curated this content as their public
          // support documentation; trust accordingly.
          score: Math.max(95, scoreEmail(email, context)),
          source: "zendesk-kb:" + subdomain,
        });
        added++;
      });

      // Phones
      const phoneMatches = [
        ...(stripped.match(PHONE_REGEX) || []),
        ...(stripped.match(INTL_PHONE_REGEX) || []),
      ];
      phoneMatches.forEach((phone) => {
        const cleaned = phone.replace(/[^\d+]/g, "");
        if (cleaned.length < 10 || cleaned.length > 15) return;
        const key = phoneKey(cleaned);
        if (seen.has(key)) return;
        // Same digit-run heuristic the globals scan uses -- the article
        // body may quote Zendesk article IDs (long bare digit runs).
        // Require a separator or leading +.
        if (!/[+\-.\s()]/.test(phone)) return;
        seen.add(key);
        results.phones.push({
          value: formatPhone(phone),
          context,
          score: 95,
          source: "zendesk-kb:" + subdomain,
        });
        added++;
      });

      // Push the article itself as a support link so the user can read it.
      if (articleUrl && !seen.has(articleUrl)) {
        seen.add(articleUrl);
        results.links.push({
          url: articleUrl,
          text: articleTitle || "Zendesk help article",
          source: "zendesk-kb:" + subdomain,
        });
      }
    }

    if (added > 0) {
      // Re-sort after merging fresh results.
      results.emails.sort((a, b) => b.score - a.score);
      results.phones.sort((a, b) => b.score - a.score);
      // Push an updated badge so the toolbar reflects the new finds.
      const total = results.emails.length + results.phones.length;
      try {
        chrome.runtime.sendMessage({ action: "updateBadge", count: total }).catch(() => {});
      } catch (_) {}
    }
  }

  function extractFromText(text, parentEl, results, seen, opts) {
    opts = opts || {};
    // Emails
    const emailMatches = text.match(EMAIL_REGEX) || [];
    emailMatches.forEach((email) => {
      email = trimDigitPrefixBleed(email.toLowerCase());
      if (
        !seen.has(email) &&
        !email.endsWith(".png") &&
        !email.endsWith(".jpg") &&
        !email.endsWith(".svg") &&
        !email.includes("sentry") &&
        !email.includes("webpack") &&
        !email.includes("example.com")
      ) {
        seen.add(email);
        const context = parentEl ? getContext(parentEl) : "";
        const score = scoreEmail(email, context);
        results.emails.push({ value: email, context, score, source: "text" });
      }
    });

    // Phones
    const phoneMatches = [
      ...(text.match(PHONE_REGEX) || []),
      ...(text.match(INTL_PHONE_REGEX) || []),
    ];
    phoneMatches.forEach((phone) => {
      const cleaned = phone.replace(/[^\d+]/g, "");
      const key = phoneKey(cleaned);
      if (!seen.has(key) && cleaned.length >= 10 && cleaned.length <= 15) {
        if (opts.requireProximityAnchor) {
          const surrounding = surroundingTextFor(text, phone, 100);
          if (!hasPhoneProximityAnchor(surrounding)) return;
        }
        seen.add(key);
        const context = parentEl ? getContext(parentEl) : "";
        const score = scorePhone(context);
        results.phones.push({
          value: formatPhone(phone),
          context,
          score,
          source: "text",
        });
      }
    });
  }

  // Identify the user's own logged-in identity (email / phone) from the
  // page's signed-in account UI, and add it to the dedup `seen` set so it
  // never gets surfaced as a "contact." Surfacing the user's own avatar
  // email on a Google search page (or any logged-in app) is a false
  // positive: the user cannot contact themselves.
  //
  // Two passes:
  //
  //   A. ARIA-LABEL / TITLE PATTERN MATCH
  //      Web apps almost universally label the signed-in-user avatar /
  //      account dropdown with text like "Google Account: <Name>
  //      (<email>)" or "Signed in as <email>." If an element's
  //      aria-label or title contains one of those patterns AND also
  //      contains an email, we treat that email as personal.
  //
  //   B. ACCOUNT-DROPDOWN STRUCTURAL SELECTORS
  //      Some apps render the email as visible text inside an element
  //      with class/id/data-testid markers like "account-menu",
  //      "user-menu", "avatar", "profile-menu". We pull any email and
  //      phone out of those elements' innerText and treat them as
  //      personal.
  //
  // The patterns are tight enough that legitimate support emails on a
  // contact page (e.g. "Contact our account team at...") don't get
  // dropped: those won't appear inside an aria-label that literally
  // starts "<vendor> Account:" and won't be inside an element whose
  // class is "user-menu" or similar.
  function seedPersonalIdentity(seen) {
    const ACCOUNT_LABEL_PATTERNS = [
      /\b(?:google|microsoft|apple|outlook|yahoo|aol|icloud|github|gitlab|linkedin|atlassian|slack|notion|adobe|spotify|dropbox|figma|amazon|twitter|facebook|instagram)\s+account[:\s]/i,
      /\bsigned\s+in\s+as\b/i,
      /\bswitch\s+(?:to\s+(?:another\s+)?)?account\b/i,
      /\bmanage\s+your\s+(?:google\s+)?account\b/i,
      /\byour\s+\w+\s+account\b/i,
      /\byou(?:'re|\s+are)\s+signed\s+in\b/i,
    ];

    const ACCOUNT_STRUCTURAL_SELECTORS = [
      '[class*="account-menu"]',  '[id*="account-menu"]',
      '[class*="user-menu"]',     '[id*="user-menu"]',
      '[class*="profile-menu"]',  '[id*="profile-menu"]',
      '[class*="account-info"]',  '[class*="user-info"]',
      '[class*="avatar"]',
      '[data-testid*="user-menu"]',  '[data-testid*="account-menu"]',
      '[data-testid*="profile-menu"]',
      '[aria-label*="account menu" i]', '[aria-label*="profile menu" i]',
      '[aria-label*="user menu" i]',
    ];

    const seedFromText = (text) => {
      if (!text) return;
      (text.match(EMAIL_REGEX) || []).forEach((e) => seen.add(e.toLowerCase()));
      const phones = [
        ...(text.match(PHONE_REGEX) || []),
        ...(text.match(INTL_PHONE_REGEX) || []),
      ];
      phones.forEach((p) => {
        const cleaned = p.replace(/[^\d+]/g, "");
        if (cleaned.length >= 10 && cleaned.length <= 15) {
          seen.add(phoneKey(cleaned));
        }
      });
    };

    // Pass A: aria-label / title text matching one of the account patterns.
    try {
      document.querySelectorAll("[aria-label], [title]").forEach((el) => {
        const label = (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "");
        if (!label || !/@/.test(label)) return;
        if (!ACCOUNT_LABEL_PATTERNS.some((p) => p.test(label))) return;
        seedFromText(label);
      });
    } catch (_) {}

    // Pass B: structural selectors. Read the element's innerText (respects
    // layout, so screen-reader-only divs that visually-hidden but still
    // rendered are picked up) and seed any contacts found inside.
    ACCOUNT_STRUCTURAL_SELECTORS.forEach((sel) => {
      try {
        document.querySelectorAll(sel).forEach((el) => {
          const text = (el.innerText || el.textContent || "");
          if (!text || !/@|\d{3}/.test(text)) return;
          seedFromText(text);
        });
      } catch (_) {}
    });
  }

  function getContext(el) {
    if (!el) return "";
    // Walk up to find meaningful context
    let node = el;
    for (let i = 0; i < 3; i++) {
      if (node.parentElement) node = node.parentElement;
    }
    const text = (node.textContent || "").substring(0, 200).replace(/\s+/g, " ").trim();
    return text;
  }

  // Public-mailbox host suffixes. An email at one of these domains is
  // someone's personal address -- legitimately useful when it's literally
  // the business owner's contact, but on a corporate site it's almost
  // certainly bleed (a footer "Built by Jane <jane@gmail.com>", a press
  // article quote, a customer review). Used by the domain-fit signal in
  // scoreEmail.
  const PUBLIC_MAILBOX_HOSTS = new Set([
    "gmail.com", "googlemail.com",
    "outlook.com", "hotmail.com", "live.com", "msn.com",
    "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com",
    "aol.com", "icloud.com", "me.com", "mac.com",
    "protonmail.com", "proton.me",
    "zoho.com", "yandex.com", "yandex.ru",
    "gmx.com", "gmx.de", "mail.com",
    "qq.com", "163.com", "126.com",
  ]);

  // Compare the email's host suffix against the site we're currently on.
  // Returns: +20 (matches site host), 0 (public mailbox host on a site),
  // -10 (mismatched corporate host -- e.g. consultant@otherco.com on
  // acme.com, or competitor leakage), -25 (public mailbox host).
  //
  // Special case: if window.location.hostname IS a public-mailbox host
  // (rare -- user is on mail.google.com directly), suppress the public-
  // mailbox penalty since we have no signal to evaluate against.
  function domainFitScore(email) {
    if (!email || !email.includes("@")) return 0;
    let pageHost;
    try {
      pageHost = (window.location.hostname || "").toLowerCase().replace(/^www\./, "");
    } catch (_) { return 0; }
    if (!pageHost) return 0;

    const emailHost = email.split("@")[1].toLowerCase();
    if (!emailHost) return 0;

    // Strip leading "support." / "help." / "contact." style subdomains
    // from BOTH the page host and the email host so an email at
    // contact@acme.com still matches when the user is on support.acme.com.
    const stripPrefix = (h) => h.replace(/^(?:support|help|contact|info|service|customer|care|press|media)\./, "");
    const ph = stripPrefix(pageHost);
    const eh = stripPrefix(emailHost);

    // Exact match or one is a suffix of the other (handles co.uk + www
    // edge cases naturally).
    if (ph === eh || ph.endsWith("." + eh) || eh.endsWith("." + ph)) return 20;

    // Email at a public mailbox host on a non-mailbox-host page is bleed.
    if (PUBLIC_MAILBOX_HOSTS.has(emailHost) && !PUBLIC_MAILBOX_HOSTS.has(pageHost)) {
      return -25;
    }

    // Corporate mismatch -- email at one company's domain on another
    // company's site. Could be legitimate (partner contact, consultant)
    // but usually noise.
    return -10;
  }

  function scoreEmail(email, context) {
    let score = 50;
    const combined = (email + " " + context).toLowerCase();

    // Boost for support-related email prefixes
    if (SUPPORT_EMAIL_HINTS.some((h) => email.includes(h))) score += 30;

    // Boost for support context
    if (SUPPORT_KEYWORDS.some((kw) => combined.includes(kw))) score += 20;

    // Penalty for likely non-support emails
    if (email.includes("noreply") || email.includes("no-reply")) score -= 40;
    if (email.includes("marketing") || email.includes("newsletter")) score -= 20;
    if (email.includes("privacy") || email.includes("legal")) score -= 10;
    if (email.includes("jobs") || email.includes("careers") || email.includes("hr@")) score -= 30;

    // Boost if found in footer or contact section
    if (context.toLowerCase().includes("footer")) score += 10;

    // Domain-fit: does the email's host match the page we're on?
    score += domainFitScore(email);

    return Math.max(0, Math.min(100, score));
  }

  function scorePhone(context) {
    let score = 50;
    const lower = context.toLowerCase();
    if (SUPPORT_KEYWORDS.some((kw) => lower.includes(kw))) score += 30;
    if (lower.includes("toll") || lower.includes("free")) score += 10;
    if (lower.includes("fax")) score -= 30;
    return Math.max(0, Math.min(100, score));
  }

  // Canonical key for phone dedup. Strips separators and the US country
  // code "1" so the same number reaching us as "tel:1(281)816-5935" (with
  // leading 1 from the href) and as visible text "(281) 816-5935" (without)
  // collapses to one entry in the results. Prior bug: the tel: handler
  // stored the raw "1(281)816-5935" string in the seen set; the text-scan
  // handler stored the digits-only "2818165935" -- different keys for the
  // same number, so dedup missed and both got pushed.
  function phoneKey(s) {
    const digits = String(s).replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return digits;
  }

  function formatPhone(phone) {
    // Normalize whatever the input format (raw 10/11-digit string from tel:
    // links, or a free-text match like "1-800-555-1212" or "123.456.7890")
    // into a consistent US display format: (NNN) NNN-NNNN. International or
    // shorter numbers fall through to a light whitespace cleanup so we
    // don't mangle them.
    const raw = String(phone).trim();
    const digits = raw.replace(/\D/g, "");

    // Plain US 10-digit
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    // US 11-digit with leading country code 1 -- drop the 1 for display since
    // domestic readers parse "(800) 555-1212" faster than "+1 (800) 555-1212".
    // The E.164 conversion in popup.js / content.js (toE164) re-adds it for
    // VOIP deep links, so call/dialer routing is unaffected.
    if (digits.length === 11 && digits.startsWith("1")) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    // Anything else (international, partial 7-digit local, vanity numbers
    // with letters that got stripped to fewer than 10 digits): preserve
    // whatever the page had, just collapse whitespace.
    return raw.replace(/\s+/g, " ");
  }

  // Run scan and store results
  const results = scanPage();

  // Listen for popup requests
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "getContacts") {
      sendResponse(results);
    }
    return true;
  });

  // Also store in session for badge updates
  const totalFound =
    results.emails.length + results.phones.length;
  chrome.runtime.sendMessage({
    action: "updateBadge",
    count: totalFound,
  }).catch(() => {});

  // Auto-rescan on DOM changes. SPA pages (Spirit, modern support sites)
  // hydrate after document_idle and lazy-load contact info; the initial scan
  // misses it. Debouncing on 1s of mutation idle keeps scanPage runs to at
  // most once per second of page activity, which is plenty for catching
  // newly-rendered footers, expanded chat panels, and fetched contact pages.
  // Mutating the existing results object in place keeps the onMessage
  // listener pointing at fresh data without re-registering.
  if (document.body && typeof MutationObserver !== "undefined") {
    const RESCAN_DEBOUNCE_MS = 1000;
    let rescanTimer = null;

    const rescanAndUpdate = () => {
      const fresh = scanPage();
      results.emails = fresh.emails;
      results.phones = fresh.phones;
      results.links = fresh.links;
      results.context = fresh.context;
      results.hours = fresh.hours;

      const total = results.emails.length + results.phones.length;
      chrome.runtime.sendMessage({
        action: "updateBadge",
        count: total,
      }).catch(() => {});

      ensureSidePanel(results);
    };

    const observer = new MutationObserver(() => {
      if (rescanTimer) clearTimeout(rescanTimer);
      rescanTimer = setTimeout(rescanAndUpdate, RESCAN_DEBOUNCE_MS);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ===================================================================
  // SHARED ACTIONS: Compose templates and VOIP deep links
  // Mirrors the popup's tables so the side panel can hand off contacts
  // to the user's chosen mail client or dialer with the same UX. Kept
  // in sync manually with popup.js -- if you add a service or template,
  // update both files.
  // ===================================================================

  const VOIP_SERVICES = [
    { id: "tel",      name: "Phone",        buildUrl: (e164) => `tel:${e164}` },
    { id: "whatsapp", name: "WhatsApp",     buildUrl: (e164) => `https://wa.me/${e164.replace(/^\+/, "")}` },
    { id: "gvoice",   name: "Google Voice", buildUrl: (e164) => `https://voice.google.com/u/0/calls?a=nc,${encodeURIComponent(e164)}` },
    { id: "facetime", name: "FaceTime",     buildUrl: (e164) => `facetime-audio:${e164}` },
    { id: "teams",    name: "Teams",        buildUrl: (e164) => `https://teams.microsoft.com/l/call/0/0?users=4:${encodeURIComponent(e164)}` },
  ];

  const EMAIL_TEMPLATES = [
    { id: "blank",     label: "Blank",     subject: "",                     body: "" },
    { id: "refund",    label: "Refund",    subject: "Refund Request",       body: ["Hello,", "", "I'd like to request a refund for [order number / purchase date].", "", "Reason: [briefly describe]", "", "Please let me know what additional information you need to process this. I appreciate your help.", "", "Thank you,", "[Your name]"].join("\n") },
    { id: "complaint", label: "Complaint", subject: "Customer Complaint",   body: ["Hello,", "", "I'm writing to share a concern about a recent experience with [product/service].", "", "What happened:", "[describe the issue]", "", "What I'd like to see resolved:", "[desired outcome]", "", "I appreciate your time and look forward to your response.", "", "Best regards,", "[Your name]"].join("\n") },
    { id: "cancel",    label: "Cancel",    subject: "Cancellation Request", body: ["Hello,", "", "I'd like to cancel my [account / subscription / service].", "", "Account details: [email or account number]", "Effective date: [date or \"as soon as possible\"]", "", "Please confirm the cancellation and let me know if anything further is needed on my end.", "", "Thank you,", "[Your name]"].join("\n") },
    { id: "billing",   label: "Billing",   subject: "Billing Question",     body: ["Hello,", "", "I have a question about a charge on my account:", "", "- Date: [date]", "- Amount: [amount]", "- Description: [what was charged]", "", "[Your question or concern]", "", "Could you please look into this and get back to me?", "", "Thank you,", "[Your name]"].join("\n") },
    { id: "support",   label: "Support",   subject: "Support Request",      body: ["Hello,", "", "I'm having an issue I'd appreciate help with.", "", "What's happening:", "[describe]", "", "What I've already tried:", "[any troubleshooting]", "", "Any guidance would be appreciated.", "", "Thanks,", "[Your name]"].join("\n") },
  ];

  // Default (mailto:) was dropped -- relied on the OS having a configured
  // mail handler, which most users don't. Two-option universe: Gmail
  // (default selection) + Outlook.
  const EMAIL_CLIENTS = [
    { id: "gmail",   name: "Gmail",   buildUrl: ({ to, subject, body }) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` },
    { id: "outlook", name: "Outlook", buildUrl: ({ to, subject, body }) => `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` },
  ];

  const SP_CLIENT_KEY = "fmp_side_panel_email_client";

  function toE164(phone) {
    let s = String(phone).replace(/[^\d+]/g, "");
    if (s.startsWith("+")) return s;
    if (s.length === 10) return "+1" + s;
    if (s.length === 11 && s.startsWith("1")) return "+" + s;
    return "+" + s;
  }

  // Content-script open-URL: anchor click works for both protocol URIs
  // (mailto:, tel:, facetime-audio:) and HTTPS, since the click is a real
  // user gesture and the page context isn't subject to the MV3 popup
  // window's popup-blocker quirks. Attached to documentElement to avoid
  // host-page body listeners.
  function spOpenUrl(url) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.documentElement.appendChild(a);
    a.click();
    document.documentElement.removeChild(a);
  }

  async function spGetClient() {
    // Normalize legacy "default" (and any unknown value) to "gmail" so users
    // who set a preference under the old 3-option picker still land on a
    // working chip.
    if (!chrome.storage || !chrome.storage.local) return "gmail";
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([SP_CLIENT_KEY], (r) => {
          const stored = r[SP_CLIENT_KEY];
          resolve(stored === "gmail" || stored === "outlook" ? stored : "gmail");
        });
      } catch (_) {
        resolve("gmail");
      }
    });
  }

  function spSetClient(id) {
    if (!chrome.storage || !chrome.storage.local) return;
    try {
      chrome.storage.local.set({ [SP_CLIENT_KEY]: id });
    } catch (_) {}
  }

  // ===================================================================
  // SIDE PANEL OVERLAY
  // Injects a small green tab on the right edge of every page that
  // expands into a panel listing the same ranked contacts the popup
  // shows. Lets users surface contacts without clicking the toolbar.
  // Lives in a shadow DOM so the host page's CSS can't touch it.
  // Master toggle (default on) is stored in chrome.storage.local and
  // surfaced in the popup. Per-domain dismissal ("Hide on this site")
  // is stored under a hostname-keyed entry with a 7-day TTL.
  // ===================================================================

  const SP_HOST_ID = "fmp-side-panel-host";
  const SP_MASTER_KEY = "fmp_side_panel_enabled";
  const SP_DISMISS_PREFIX = "fmp_side_panel_dismissed_";
  const SP_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  // ===================================================================
  // SIDE PANEL FEATURE PARITY WITH POPUP
  // The following constants and helpers bring the side panel up to
  // surface-level parity with the toolbar popup. Five capabilities the
  // popup had that the side panel was missing -- now added:
  //
  //   1. "Rate Find Me People" link in the footer (browser-aware:
  //      Firefox -> AMO, Chrome / Edge / Brave / Arc -> Web Store).
  //   2. "Rescan" button in the footer for manual SPA-hydration cases
  //      where the auto-rescan MutationObserver hasn't fired yet.
  //   3. Support-pages section that renders results.links (the same
  //      /contact, /support, /help URLs the popup shows when the visible
  //      page lacks direct contact info).
  //   4. Hours-of-operation banner + weekly schedule. Same Open Now /
  //      Closed Now logic as popup.js renderHoursBanner -- parses
  //      today's hours, compares to current local time, picks a green /
  //      red / gray treatment, lists deduped weekly rows below.
  //   5. "History" view tab. A second view inside the panel that shows
  //      every previously-copied contact (across popup + side panel,
  //      via shared chrome.storage.local fmp_history key). Searchable,
  //      click-to-recopy, with a Clear button.
  //
  // The data-sp-copy-type / data-sp-copy-score attrs added to email and
  // phone rows let copy events know what type the value is so history
  // records can render the correct badge -- same attribute names as
  // the popup-side feat/contact-history PR uses, so a future merge of
  // that branch's content.js changes will resolve cleanly.
  // ===================================================================

  // Browser-aware "rate us" link target (kept in sync with popup.js)
  function spIsFirefox() { return navigator.userAgent.includes("Firefox"); }
  const SP_REVIEW_URLS = {
    chrome:  "https://chromewebstore.google.com/detail/find-me-people/ngfklhkcicocfchdmepiajdmboialikf/reviews",
    firefox: "https://addons.mozilla.org/addon/find-me-people/",
  };
  function spGetReviewUrl() { return spIsFirefox() ? SP_REVIEW_URLS.firefox : SP_REVIEW_URLS.chrome; }

  // Contact history -- shared key with popup-side history. Both surfaces
  // read and write to the same chrome.storage.local.fmp_history array,
  // so anything copied from either surface shows up in both histories.
  const SP_HISTORY_KEY = "fmp_history";
  const SP_HISTORY_MAX = 50;
  let spHistoryFilter = ""; // current History-view search text
  let spActiveView = "now"; // "now" or "history"

  function spGetHistoryFromStorage() {
    return new Promise((resolve) => {
      if (!chrome.storage || !chrome.storage.local) return resolve([]);
      try {
        chrome.storage.local.get([SP_HISTORY_KEY], (r) => {
          resolve(Array.isArray(r[SP_HISTORY_KEY]) ? r[SP_HISTORY_KEY] : []);
        });
      } catch (_) { resolve([]); }
    });
  }
  function spAddToHistory(entry) {
    if (!entry || !entry.value) return;
    if (!chrome.storage || !chrome.storage.local) return;
    spGetHistoryFromStorage().then((hist) => {
      const filtered = hist.filter((e) => e.value !== entry.value);
      filtered.unshift({ ...entry, timestamp: Date.now() });
      if (filtered.length > SP_HISTORY_MAX) filtered.length = SP_HISTORY_MAX;
      try { chrome.storage.local.set({ [SP_HISTORY_KEY]: filtered }); } catch (_) {}
    });
  }
  function spClearHistory() {
    return new Promise((resolve) => {
      if (!chrome.storage || !chrome.storage.local) return resolve();
      try { chrome.storage.local.set({ [SP_HISTORY_KEY]: [] }, resolve); }
      catch (_) { resolve(); }
    });
  }
  function spTimeAgo(ts) {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    if (s < 86400 * 7) return Math.floor(s / 86400) + "d ago";
    return Math.floor(s / (86400 * 7)) + "w ago";
  }

  // Hours rendering -- mirrors popup.js renderHoursBanner. The day-name
  // arrays here are constants to compare today's day against the parsed
  // hours-of-operation entries; if a match is found we figure out
  // open/closed by comparing current local minutes against the parsed
  // opens / closes minute counts.
  const SP_DAY_FULL_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const SP_DAY_SHORT_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function spParseTimeToMinutes(t) {
    if (!t) return null;
    const s = String(t).trim().toLowerCase();
    const m = s.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const ampm = m[3];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return h * 60 + min;
  }

  // Render a small "use email instead" tip under the hours banner when the
  // business is closed and we have at least one email to surface. Phone
  // calls during closed hours go to voicemail or hold queues; email is
  // the higher-yield channel off-hours. If we have no email but do have a
  // phone, no tip (the user already sees the phone in the next section).
  function spRenderHoursAdvice(openNow, results) {
    if (openNow !== false) return ""; // only render when explicitly closed
    if (!results) return "";
    const hasEmail = (results.emails || []).length > 0;
    const hasPhone = (results.phones || []).length > 0;
    if (hasEmail && hasPhone) {
      return `<div class="hours-advice">&#9993; Closed now &mdash; email is your best bet off-hours.</div>`;
    }
    if (hasEmail) {
      return `<div class="hours-advice">&#9993; Closed now &mdash; reach out by email.</div>`;
    }
    return "";
  }

  function spRenderHoursBanner(hours, results) {
    if (!hours || hours.length === 0) {
      return `
        <div class="hours-banner unknown">
          <div class="hb-pulse"></div>
          <div class="hb-text">
            <div class="hb-label">Hours not posted</div>
            <div class="hb-detail">No business hours detected</div>
          </div>
        </div>`;
    }
    const now = new Date();
    const todayIdx = now.getDay();
    const todayName = SP_DAY_FULL_NAMES[todayIdx].toLowerCase();
    const todayShort = SP_DAY_SHORT_NAMES[todayIdx].toLowerCase();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    let openNow = false;
    let todayHours = null;
    hours.forEach((h) => {
      const display = (h.display || "").toLowerCase();
      const days = (h.days || []).map((d) => String(d).toLowerCase());
      const matchesToday =
        display.includes(todayName) || display.includes(todayShort) ||
        days.some((d) => d.includes(todayShort) || d.includes(todayName));
      if (matchesToday && !todayHours) {
        todayHours = h.display;
        if (h.opens && h.closes) {
          const openMin = spParseTimeToMinutes(h.opens);
          const closeMin = spParseTimeToMinutes(h.closes);
          if (openMin !== null && closeMin !== null) {
            if (currentMinutes >= openMin && currentMinutes < closeMin) openNow = true;
          }
        }
      }
    });
    if (!todayHours) todayHours = hours[0].display;
    const bannerClass = openNow ? "open" : todayHours ? "closed" : "unknown";
    const label = openNow ? "Open Now" : "Closed Now";
    const detail = todayHours ? `Today: ${todayHours}` : "Hours not detected for today";

    let html = `
      <div class="hours-banner ${bannerClass}">
        <div class="hb-pulse"></div>
        <div class="hb-text">
          <div class="hb-label">${label}</div>
          <div class="hb-detail">${spEscape(detail)}</div>
        </div>
      </div>`;
    html += spRenderHoursAdvice(openNow, results);
    if (hours.length > 1) {
      const dseen = new Set();
      const rows = [];
      hours.forEach((h) => {
        if (!dseen.has(h.display)) {
          dseen.add(h.display);
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
          <span class="hr-day">${spEscape(day)}</span>
          <span>${spEscape(time)}</span>
        </div>`;
      });
      html += "</div>";
    }
    return html;
  }

  function spRenderSupportLinks(links) {
    if (!links || links.length === 0) return "";
    let html = `<div class="section"><div class="section-title">Support Pages</div>`;
    links.slice(0, 5).forEach((l) => {
      let pathname = "";
      try { pathname = new URL(l.url).pathname; } catch (_) {}
      html += `<a class="link-item" href="${spEscape(l.url)}" target="_blank" rel="noopener noreferrer">
        <span class="li-text">${spEscape(l.text || "Contact Page")}</span>
        <span class="li-path">${spEscape(pathname)}</span>
      </a>`;
    });
    html += "</div>";
    return html;
  }

  function spRenderHistoryView(history, filter) {
    const q = (filter || "").trim().toLowerCase();
    const matched = q
      ? history.filter((e) => (e.value + " " + (e.hostname || "")).toLowerCase().includes(q))
      : history;
    let html = `<input class="history-search" type="search" data-sp-history-search placeholder="Search history (${history.length})" value="${spEscape(filter || "")}" />`;
    html += `<div class="history-list">`;
    if (matched.length === 0) {
      html += `<div class="history-empty">${history.length === 0 ? "Copy any contact to start your history." : "No matches."}</div>`;
    } else {
      matched.forEach((e) => {
        const v = spEscape(e.value);
        html += `
          <div class="history-item" data-sp-copy="${v}" data-sp-copy-type="${spEscape(e.type || "")}" data-sp-copy-score="${e.score || 0}">
            <div class="hi-row1">
              <span class="hi-value">${v}</span>
              <span class="hi-when">${spTimeAgo(e.timestamp)}</span>
            </div>
            <div class="hi-row2">
              <span class="hi-type">${spEscape(e.type || "")}</span>
              <span>${spEscape(e.hostname || "")}</span>
            </div>
          </div>`;
      });
    }
    html += `</div>`;
    if (history.length > 0) {
      html += `<div class="history-footer"><button class="text-btn" data-sp-action="clear-history">Clear history</button></div>`;
    }
    return html;
  }

  async function spGetMaster() {
    if (!chrome.storage || !chrome.storage.local) return true;
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([SP_MASTER_KEY], (r) => {
          resolve(r[SP_MASTER_KEY] !== false);
        });
      } catch (_) {
        resolve(true);
      }
    });
  }

  async function spIsDismissedForDomain() {
    if (!chrome.storage || !chrome.storage.local) return false;
    const key = SP_DISMISS_PREFIX + window.location.hostname;
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (r) => {
          const ts = r[key];
          resolve(!!ts && Date.now() - ts < SP_DISMISS_TTL_MS);
        });
      } catch (_) {
        resolve(false);
      }
    });
  }

  function spDismissForDomain() {
    if (!chrome.storage || !chrome.storage.local) return;
    const key = SP_DISMISS_PREFIX + window.location.hostname;
    try {
      chrome.storage.local.set({ [key]: Date.now() });
    } catch (_) {}
  }

  function spEscape(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function spBuildBody(currentResults, currentClient, history) {
    const total = currentResults.emails.length + currentResults.phones.length;
    const totalSuffix = total === 1 ? "" : "s";
    const tabsHtml = `
      <div class="view-tabs">
        <button class="view-tab${spActiveView === "now" ? " active" : ""}" data-sp-view="now">On this page</button>
        <button class="view-tab${spActiveView === "history" ? " active" : ""}" data-sp-view="history">History</button>
      </div>`;

    let html = `
      <div class="tab" data-sp-action="expand" role="button" aria-label="Open Find Me People panel" title="Find Me People (${total} contact${totalSuffix})">
        <span class="tab-icon">&#128100;</span>
        ${total > 0 ? `<span class="tab-count">${total}</span>` : ""}
      </div>
      <div class="panel" role="dialog" aria-label="Find Me People contacts">
        <div class="header">
          <span class="title"><span class="logo">&#128100;</span> Find Me People</span>
          <button class="icon-btn" data-sp-action="collapse" aria-label="Collapse">&minus;</button>
        </div>
        ${tabsHtml}
    `;

    // ----- "History" view: searchable list of every previous copy -----
    if (spActiveView === "history") {
      html += `<div class="scroll history-scroll">${spRenderHistoryView(history || [], spHistoryFilter)}</div>`;
    } else {
      // ----- "On this page" view: hours banner + email + phone + support -----
      html += `<div class="status">${total > 0 ? `Found ${total} contact${totalSuffix} on this page` : "No contacts found"}</div>`;
      html += spRenderHoursBanner(currentResults.hours || [], currentResults);
      html += `<div class="scroll">`;

      if (currentResults.emails.length) {
        html += `<div class="section"><div class="section-title">Email</div>`;
        // Section-level client picker -- one preference for every template chip below
        html += `<div class="client-picker"><span class="picker-label">Templates open in</span>`;
        EMAIL_CLIENTS.forEach((c) => {
          const sel = c.id === currentClient ? " selected" : "";
          html += `<button class="chip sm${sel}" data-sp-set-client="${c.id}">${spEscape(c.name)}</button>`;
        });
        html += `</div>`;

        currentResults.emails.slice(0, 5).forEach((e, idx) => {
          const sc = e.score >= 70 ? "high" : e.score >= 40 ? "mid" : "low";
          const lbl = e.score >= 70 ? "Likely support" : e.score >= 40 ? "Possible" : "Low match";
          const escVal = spEscape(e.value);
          const rowId = `email-${idx}`;
          const tplChips = EMAIL_TEMPLATES.map(
            (t) => `<button class="chip" data-sp-template="${t.id}" data-sp-email="${escVal}">${spEscape(t.label)}</button>`
          ).join("");
          html += `
            <div class="row">
              <div class="row-main" data-sp-copy="${escVal}" data-sp-copy-type="email" data-sp-copy-score="${e.score}">
                <div class="val">${escVal}</div>
                <div class="meta">
                  <span>Click to copy</span>
                  <span class="score score-${sc}">${lbl}</span>
                </div>
              </div>
              <button class="row-toggle" data-sp-toggle="${rowId}">Compose <span class="caret">&#9662;</span></button>
              <div class="row-actions" data-sp-panel="${rowId}">
                <div class="chips">${tplChips}</div>
              </div>
            </div>
          `;
        });
        html += `</div>`;
      }

      if (currentResults.phones.length) {
        html += `<div class="section"><div class="section-title">Phone</div>`;
        currentResults.phones.slice(0, 5).forEach((p, idx) => {
          const sc = p.score >= 70 ? "high" : p.score >= 40 ? "mid" : "low";
          const lbl = p.score >= 70 ? "Likely support" : p.score >= 40 ? "Possible" : "Low match";
          const escVal = spEscape(p.value);
          const escE164 = spEscape(toE164(p.value));
          const rowId = `phone-${idx}`;
          const voipChips = VOIP_SERVICES.map(
            (s) => `<button class="chip" data-sp-voip="${s.id}" data-sp-phone="${escE164}">${spEscape(s.name)}</button>`
          ).join("");
          html += `
            <div class="row">
              <div class="row-main" data-sp-copy="${escVal}" data-sp-copy-type="phone" data-sp-copy-score="${p.score}">
                <div class="val">${escVal}</div>
                <div class="meta">
                  <span>Click to copy</span>
                  <span class="score score-${sc}">${lbl}</span>
                </div>
              </div>
              <button class="row-toggle" data-sp-toggle="${rowId}">Call <span class="caret">&#9662;</span></button>
              <div class="row-actions" data-sp-panel="${rowId}">
                <div class="chips">${voipChips}</div>
              </div>
            </div>
          `;
        });
        html += `</div>`;
      }

      // Support pages section -- same data the popup shows, same render
      // logic so when scan returns 0 emails/phones but does find /contact
      // or /support links, the user still has a discoverable next step.
      html += spRenderSupportLinks(currentResults.links || []);

      html += `</div>`; // end .scroll
    }

    // ----- Shared footer (both views): Rescan / Hide / Rate -----
    html += `
        <div class="footer">
          <button class="text-btn" data-sp-action="rescan" title="Re-run the scan now">&#8635; Rescan</button>
          <span class="footer-sep">&middot;</span>
          <button class="text-btn" data-sp-action="dismiss-site">Hide on this site</button>
          <span class="footer-sep">&middot;</span>
          <a class="text-btn rate" href="${spGetReviewUrl()}" target="_blank" rel="noopener" data-sp-action="rate" title="Rate Find Me People"><span class="star">&#9733;</span> Rate</a>
        </div>
      </div>
      <div class="copied-toast">Copied</div>
    `;
    return html;
  }

  const SP_CSS = `
    :host {
      all: initial;
      position: fixed;
      top: 30%;
      right: 0;
      z-index: 2147483640;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.4;
    }
    * { box-sizing: border-box; }
    .tab {
      width: 40px;
      height: 88px;
      background: linear-gradient(135deg, #2d8a2e, #4ade80);
      border-radius: 12px 0 0 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: -4px 0 14px rgba(0,0,0,0.25);
      position: relative;
      transition: transform 0.15s;
      color: #ffffff;
    }
    .tab:hover { transform: translateX(-3px); }
    .tab-icon { font-size: 22px; line-height: 1; }
    .tab-count {
      position: absolute;
      top: 4px;
      right: 4px;
      background: #ffffff;
      color: #2d8a2e;
      font-size: 10px;
      font-weight: 700;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .panel {
      display: none;
      flex-direction: column;
      width: 340px;
      max-height: 70vh;
      background: #0a0a0a;
      color: #fafafa;
      border-radius: 12px 0 0 12px;
      box-shadow: -8px 0 28px rgba(0,0,0,0.45);
      overflow: hidden;
      border: 1px solid #1e1e1e;
      border-right: none;
    }
    :host(.expanded) .tab { display: none; }
    :host(.expanded) .panel { display: flex; }
    .header {
      padding: 12px 14px;
      border-bottom: 1px solid #1e1e1e;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .title {
      font-size: 14px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .logo {
      width: 22px;
      height: 22px;
      background: linear-gradient(135deg, #2d8a2e, #4ade80);
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      color: #ffffff;
    }
    .icon-btn {
      background: none;
      border: none;
      color: #71717a;
      cursor: pointer;
      font-size: 18px;
      padding: 2px 8px;
      font-family: inherit;
      line-height: 1;
    }
    .icon-btn:hover { color: #fafafa; }
    .status {
      padding: 8px 14px;
      font-size: 11px;
      color: #a1a1aa;
      flex-shrink: 0;
    }
    .scroll {
      flex: 1;
      overflow-y: auto;
      padding-bottom: 4px;
    }
    .scroll::-webkit-scrollbar { width: 4px; }
    .scroll::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; }
    .section { padding: 4px 14px; }
    .section-title {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #52525b;
      margin-bottom: 6px;
    }
    .row {
      background: #111113;
      border: 1px solid #1e1e1e;
      border-radius: 8px;
      padding: 8px 10px;
      margin-bottom: 5px;
      transition: border-color 0.15s;
    }
    .row:hover { border-color: #4ade80; }
    .row-main { cursor: pointer; }
    .row-toggle {
      background: none;
      border: none;
      color: #71717a;
      font-size: 10px;
      cursor: pointer;
      padding: 5px 0 0;
      font-family: inherit;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      transition: color 0.15s;
    }
    .row-toggle:hover { color: #4ade80; }
    .row-toggle .caret { display: inline-block; transition: transform 0.2s; }
    .row-toggle.open .caret { transform: rotate(180deg); }
    .row-actions { margin-top: 6px; display: none; }
    .row-actions.open { display: block; }
    .client-picker {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      padding: 0 0 8px;
    }
    .picker-label {
      font-size: 9px;
      color: #52525b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-right: 4px;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip {
      background: #18181b;
      border: 1px solid #27272a;
      color: #d4d4d8;
      font-size: 10.5px;
      padding: 3px 8px;
      border-radius: 12px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .chip:hover { border-color: #4ade80; color: #4ade80; }
    .chip.selected {
      background: rgba(74,222,128,0.15);
      border-color: #4ade80;
      color: #4ade80;
    }
    .chip.sm { font-size: 10px; padding: 2px 7px; }
    .val {
      font-size: 12.5px;
      font-weight: 600;
      color: #fafafa;
      word-break: break-all;
    }
    .meta {
      font-size: 10px;
      color: #52525b;
      margin-top: 2px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .score {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 8px;
    }
    .score-high { background: rgba(74,222,128,0.15); color: #4ade80; }
    .score-mid { background: rgba(251,191,36,0.15); color: #fbbf24; }
    .score-low { background: rgba(161,161,170,0.15); color: #a1a1aa; }
    .footer {
      padding: 9px 14px 11px;
      border-top: 1px solid #1e1e1e;
      text-align: center;
      flex-shrink: 0;
      font-size: 11px;
      color: #71717a;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .text-btn {
      background: none;
      border: none;
      color: #71717a;
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
      padding: 0;
      text-decoration: underline;
      text-decoration-color: #27272a;
    }
    .text-btn:hover { color: #4ade80; text-decoration-color: #4ade80; }
    .footer-sep { color: #27272a; }
    .copied-toast {
      position: absolute;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      background: #4ade80;
      color: #0a0a0a;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 8px;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    .copied-toast.show { opacity: 1; }

    /* ----- View tabs ("On this page" / "History") ----- */
    .view-tabs {
      display: flex;
      border-bottom: 1px solid #1e1e1e;
      padding: 0 14px;
      flex-shrink: 0;
    }
    .view-tab {
      background: none; border: none; color: #71717a;
      font-size: 11px; font-weight: 600; padding: 8px 10px;
      cursor: pointer; font-family: inherit;
      border-bottom: 2px solid transparent; margin-bottom: -1px;
      transition: color 0.15s, border-color 0.15s;
    }
    .view-tab:hover { color: #fafafa; }
    .view-tab.active { color: #4ade80; border-bottom-color: #4ade80; }

    /* ----- Hours banner + weekly list ----- */
    .hours-banner {
      margin: 8px 14px 6px; padding: 9px 12px;
      background: linear-gradient(135deg, rgba(74,222,128,0.08), rgba(74,222,128,0.02));
      border: 1px solid rgba(74,222,128,0.2); border-radius: 8px;
      display: flex; align-items: center; gap: 9px;
      flex-shrink: 0;
    }
    .hours-banner.closed {
      background: linear-gradient(135deg, rgba(248,113,113,0.08), rgba(248,113,113,0.02));
      border-color: rgba(248,113,113,0.2);
    }
    .hours-banner.unknown {
      background: rgba(161,161,170,0.06);
      border-color: rgba(161,161,170,0.2);
    }
    .hours-advice {
      margin: 8px 14px 0; padding: 8px 12px;
      font-size: 12.5px; color: #fde68a;
      background: rgba(252,211,77,0.07);
      border: 1px solid rgba(252,211,77,0.18);
      border-radius: 6px;
      display: flex; align-items: center; gap: 8px;
    }
    .hb-pulse {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      background: #4ade80; box-shadow: 0 0 0 0 rgba(74,222,128,0.7);
      animation: hb-pulse 2s infinite;
    }
    .hours-banner.closed .hb-pulse { background: #f87171; box-shadow: 0 0 0 0 rgba(248,113,113,0.7); }
    .hours-banner.unknown .hb-pulse { background: #71717a; animation: none; box-shadow: none; }
    @keyframes hb-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(74,222,128,0.5); }
      70%  { box-shadow: 0 0 0 6px rgba(74,222,128,0); }
      100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
    }
    .hb-text { flex: 1; min-width: 0; }
    .hb-label { font-size: 12px; font-weight: 700; color: #fafafa; line-height: 1.2; }
    .hours-banner.closed .hb-label { color: #fca5a5; }
    .hours-banner.open   .hb-label { color: #86efac; }
    .hb-detail { font-size: 10.5px; color: #71717a; margin-top: 2px; }
    .hours-list {
      margin: 4px 14px 6px; padding: 8px 10px;
      background: #111113; border: 1px solid #1e1e1e; border-radius: 6px;
      flex-shrink: 0;
    }
    .hours-row {
      display: flex; justify-content: space-between;
      font-size: 11px; padding: 2px 0; color: #a1a1aa;
    }
    .hours-row.today { color: #fafafa; font-weight: 600; }
    .hours-row .hr-day { text-transform: capitalize; }

    /* ----- Support pages section (anchor list) ----- */
    .link-item {
      display: block; padding: 7px 10px; margin-bottom: 4px;
      background: #111113; border: 1px solid #1e1e1e; border-radius: 6px;
      text-decoration: none; color: #4ade80; font-size: 12px;
      transition: border-color 0.15s;
    }
    .link-item:hover { border-color: #4ade80; }
    .link-item .li-text { font-weight: 600; }
    .link-item .li-path {
      display: block; font-size: 10px; color: #52525b; margin-top: 2px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* ----- History view ----- */
    .history-scroll { padding: 0 0 4px; }
    .history-search {
      margin: 8px 14px 6px; padding: 6px 9px;
      background: #18181b; border: 1px solid #27272a; border-radius: 6px;
      color: #fafafa; font-size: 11px; font-family: inherit;
      width: calc(100% - 28px); outline: none;
    }
    .history-search:focus { border-color: #4ade80; }
    .history-list { padding: 0 14px 4px; }
    .history-item {
      background: #111113; border: 1px solid #1e1e1e; border-radius: 6px;
      padding: 6px 9px; margin-bottom: 4px; cursor: pointer;
      transition: border-color 0.15s;
    }
    .history-item:hover { border-color: #4ade80; }
    .hi-row1 { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
    .hi-value { font-size: 12px; font-weight: 600; color: #fafafa; word-break: break-all; }
    .hi-when { font-size: 9px; color: #71717a; white-space: nowrap; flex-shrink: 0; }
    .hi-row2 { font-size: 9.5px; color: #52525b; margin-top: 2px; display: flex; gap: 6px; }
    .hi-type {
      font-size: 8.5px; font-weight: 700; padding: 1px 5px; border-radius: 5px;
      background: #18181b; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .history-empty { padding: 28px 14px; text-align: center; color: #52525b; font-size: 12px; }
    .history-footer {
      padding: 6px 14px 10px; text-align: center;
      border-top: 1px solid #1e1e1e; flex-shrink: 0;
    }

    /* ----- Footer Rate link styling ----- */
    .text-btn.rate { display: inline-flex; align-items: center; gap: 3px; }
    .text-btn.rate .star { color: #fbbf24; }
  `;

  function spWireEvents(shadow, currentResults) {
    const host = shadow.host;

    shadow.querySelectorAll('[data-sp-action="expand"]').forEach((el) => {
      el.addEventListener("click", () => host.classList.add("expanded"));
    });

    shadow.querySelectorAll('[data-sp-action="collapse"]').forEach((el) => {
      el.addEventListener("click", () => host.classList.remove("expanded"));
    });

    shadow.querySelectorAll('[data-sp-action="dismiss-site"]').forEach((el) => {
      el.addEventListener("click", () => {
        spDismissForDomain();
        host.remove();
      });
    });

    shadow.querySelectorAll("[data-sp-copy]").forEach((el) => {
      el.addEventListener("click", () => {
        const value = el.getAttribute("data-sp-copy");
        if (!value) return;
        try { navigator.clipboard.writeText(value); } catch (_) {}
        const toast = shadow.querySelector(".copied-toast");
        if (toast) {
          toast.classList.add("show");
          setTimeout(() => toast.classList.remove("show"), 1200);
        }
        // Record into shared history (chrome.storage.local.fmp_history)
        // so the History tab picks it up. Same key + entry shape the
        // popup-side history uses.
        const type = el.getAttribute("data-sp-copy-type");
        const score = parseInt(el.getAttribute("data-sp-copy-score") || "0", 10) || 0;
        if (type === "email" || type === "phone") {
          const hostname = window.location.hostname.replace(/^www\./, "");
          spAddToHistory({ value, type, hostname, score });
        }
      });
    });

    // View tabs: switch between "On this page" and "History"
    shadow.querySelectorAll("[data-sp-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.getAttribute("data-sp-view");
        if (v !== spActiveView) {
          spActiveView = v;
          if (v === "now") spHistoryFilter = ""; // reset search when leaving history
          ensureSidePanel(results);
        }
      });
    });

    // Rescan: re-run scanPage() in place and re-render. The auto-rescan
    // MutationObserver covers most DOM-mutation cases; this button is
    // for the popup-parity manual override that some users will reach
    // for first when results look stale.
    shadow.querySelectorAll('[data-sp-action="rescan"]').forEach((el) => {
      el.addEventListener("click", () => {
        const fresh = scanPage();
        results.emails = fresh.emails;
        results.phones = fresh.phones;
        results.links = fresh.links;
        results.context = fresh.context;
        results.hours = fresh.hours;
        const total = results.emails.length + results.phones.length;
        try {
          chrome.runtime.sendMessage({ action: "updateBadge", count: total }).catch(() => {});
        } catch (_) {}
        ensureSidePanel(results);
      });
    });

    // History view: search input -> debounced re-render with filter applied
    shadow.querySelectorAll("[data-sp-history-search]").forEach((input) => {
      input.addEventListener("input", () => {
        spHistoryFilter = input.value || "";
        ensureSidePanel(results);
        // Restore focus + caret position after the re-render swaps the input
        const fresh = shadow.querySelector("[data-sp-history-search]");
        if (fresh) {
          fresh.focus();
          const v = fresh.value; fresh.value = ""; fresh.value = v;
        }
      });
    });

    // History view: clear-all button -> confirm + wipe + re-render
    shadow.querySelectorAll('[data-sp-action="clear-history"]').forEach((el) => {
      el.addEventListener("click", async () => {
        if (!confirm("Clear all history entries?")) return;
        await spClearHistory();
        spHistoryFilter = "";
        ensureSidePanel(results);
      });
    });

    // Rate link is an <a> with target="_blank"; let the browser handle
    // it. The data-sp-action attribute is only here for symmetry; no
    // explicit handler needed.

    // Per-row Compose/Call expand/collapse
    shadow.querySelectorAll("[data-sp-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-sp-toggle");
        const panel = shadow.querySelector(`[data-sp-panel="${id}"]`);
        if (panel) {
          panel.classList.toggle("open");
          btn.classList.toggle("open");
        }
      });
    });

    // Email client picker -> updates chrome.storage; re-render restores
    // the selected highlight on the next rescan tick. For an immediate
    // visual response, we also toggle the .selected class locally.
    shadow.querySelectorAll("[data-sp-set-client]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-sp-set-client");
        spSetClient(id);
        shadow.querySelectorAll("[data-sp-set-client]").forEach((b) => {
          b.classList.toggle("selected", b.getAttribute("data-sp-set-client") === id);
        });
      });
    });

    // Compose template chip -> open chosen client with subject/body
    shadow.querySelectorAll("[data-sp-template]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const tpl = EMAIL_TEMPLATES.find((t) => t.id === btn.getAttribute("data-sp-template"));
        const clientId = await spGetClient();
        const client = EMAIL_CLIENTS.find((c) => c.id === clientId) || EMAIL_CLIENTS[0];
        const to = btn.getAttribute("data-sp-email");
        if (tpl && to) spOpenUrl(client.buildUrl({ to, subject: tpl.subject, body: tpl.body }));
      });
    });

    // VOIP chip -> open the chosen app/site with the phone number passed in
    shadow.querySelectorAll("[data-sp-voip]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const svc = VOIP_SERVICES.find((s) => s.id === btn.getAttribute("data-sp-voip"));
        const phone = btn.getAttribute("data-sp-phone");
        if (svc && phone) spOpenUrl(svc.buildUrl(phone));
      });
    });
  }

  async function ensureSidePanel(currentResults) {
    if (!document.body) return;

    const total =
      (currentResults.emails || []).length +
      (currentResults.phones || []).length;

    if (total === 0) {
      const existing = document.getElementById(SP_HOST_ID);
      if (existing) existing.remove();
      return;
    }

    const [masterOn, dismissed, currentClient, history] = await Promise.all([
      spGetMaster(),
      spIsDismissedForDomain(),
      spGetClient(),
      spGetHistoryFromStorage(),
    ]);

    if (!masterOn || dismissed) {
      const existing = document.getElementById(SP_HOST_ID);
      if (existing) existing.remove();
      return;
    }

    // Capture state we want to survive a re-render: panel expand, any
    // per-row Compose/Call toggles the user has currently open, and the
    // scrollTop of the .scroll container so the auto-rescan rebuild does
    // not bounce a mid-scroll user back to the top.
    const prior = document.getElementById(SP_HOST_ID);
    const wasExpanded = prior ? prior.classList.contains("expanded") : false;
    const wasOpenRows = new Set();
    let priorScrollTop = 0;
    if (prior && prior.shadowRoot) {
      prior.shadowRoot.querySelectorAll(".row-toggle.open").forEach((t) => {
        const id = t.getAttribute("data-sp-toggle");
        if (id) wasOpenRows.add(id);
      });
      const priorScroll = prior.shadowRoot.querySelector(".scroll");
      if (priorScroll) priorScrollTop = priorScroll.scrollTop;
    }

    let host = prior;
    if (!host) {
      host = document.createElement("div");
      host.id = SP_HOST_ID;
      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = SP_CSS;
      shadow.appendChild(style);
      const container = document.createElement("div");
      container.innerHTML = spBuildBody(currentResults, currentClient, history);
      while (container.firstChild) shadow.appendChild(container.firstChild);
      document.documentElement.appendChild(host);
      spWireEvents(shadow, currentResults);
    } else {
      const shadow = host.shadowRoot;
      const style = shadow.querySelector("style");
      while (shadow.firstChild) shadow.removeChild(shadow.firstChild);
      if (style) shadow.appendChild(style);
      const container = document.createElement("div");
      container.innerHTML = spBuildBody(currentResults, currentClient, history);
      while (container.firstChild) shadow.appendChild(container.firstChild);
      if (wasExpanded) host.classList.add("expanded");
      // Restore previously-open Compose/Call panels
      wasOpenRows.forEach((id) => {
        const toggle = shadow.querySelector(`[data-sp-toggle="${id}"]`);
        const panel = shadow.querySelector(`[data-sp-panel="${id}"]`);
        if (toggle) toggle.classList.add("open");
        if (panel) panel.classList.add("open");
      });
      // Restore scroll position so an auto-rescan that fires while the
      // user is mid-scroll doesn't snap them back to the top. Setting
      // scrollTop after the new .scroll element is in the DOM works
      // because the layout pass has already measured scrollHeight.
      if (priorScrollTop > 0) {
        const freshScroll = shadow.querySelector(".scroll");
        if (freshScroll) freshScroll.scrollTop = priorScrollTop;
      }
      spWireEvents(shadow, currentResults);
    }
  }

  // Live-update if popup toggles the master setting on another tab, or if
  // the user changes the email-client preference from any other tab's side
  // panel -- both reads happen at ensureSidePanel rebuild time.
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && (SP_MASTER_KEY in changes || SP_CLIENT_KEY in changes || SP_HISTORY_KEY in changes)) {
        ensureSidePanel(results);
      }
    });
  }

  // Initial mount
  ensureSidePanel(results);
})();
