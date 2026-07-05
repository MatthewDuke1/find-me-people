# Sula

A browser extension that bypasses chatbots and surfaces the real customer service emails and phone numbers companies hide behind support widgets. It detects chatbot vendors (Intercom, Zendesk, Drift, Crisp, HubSpot, Tidio, LiveChat, Tawk, Freshchat, Olark) and reads the same public knowledge base the chatbot was trained on -- no chat-UI dance, no account, 100% local.

> **Cross-browser:** a single Manifest V3 codebase that installs in both Chrome and Firefox (Firefox 121+).

## The Problem

Customer service is disappearing.

- **Companies are cutting support staff.** Between 2023-2026, major companies eliminated tens of thousands of customer service positions. Telecoms, airlines, banks, and retailers have all reduced human support headcount while increasing automation.
- **Contact info is deliberately hidden.** Many companies bury their phone numbers and emails behind chatbot walls, help articles, and multi-step "contact us" funnels designed to deflect you before you ever reach a person.
- **Chatbots are the new gatekeepers.** You're now expected to explain your problem to a bot, navigate a decision tree, and prove the bot can't help you -- all before getting the option to speak with someone.
- **The "self-service" trap.** FAQ pages and knowledge bases are positioned as the first (and only) support channel. The actual email or phone number is either absent from the page or requires 4+ clicks to find.
- **Time is the real cost.** The average person spends 10-15 minutes trying to find a company's real support contact. But that's just the search. Add hold times (up 60% over 20 years), chatbot loops, follow-up calls, and re-explaining your issue -- and a single support interaction now consumes 30-45 minutes of your life.

### The math: 45+ hours/year lost to the "annoyance economy"

The numbers are staggering -- and getting worse every year:

- The ["annoyance economy" costs Americans $165 billion per year](https://groundworkcollaborative.org/work/taking-on-the-annoyance-economy/) in wasted time and money (Groundwork Collaborative, 2026)
- [74% of customers reported a problem in the last year](https://fortune.com/2026/02/19/americans-paying-over-165-billion-annually-vibes-based-taxes-annoyance-economy/) -- **double the rate since 1976** (Fortune)
- [Time spent on hold has increased 60%](https://fortune.com/2026/02/19/americans-paying-over-165-billion-annually-vibes-based-taxes-annoyance-economy/) over the last 20 years
- [86% of customers have to contact support multiple times](https://www.helpscout.com/75-customer-service-facts-quotes-statistics/) for the same issue (HelpScout)
- [More than 1 in 3 Americans](https://groundworkcollaborative.org/work/taking-on-the-annoyance-economy/) deal with service headaches **20+ times per year**
- Americans receive [130 million scam calls per day](https://groundworkcollaborative.org/work/taking-on-the-annoyance-economy/), making it even harder to identify real support lines
- Making cancellation difficult [boosts company revenue by up to 200%](https://groundworkcollaborative.org/work/taking-on-the-annoyance-economy/) -- companies are financially incentivized to hide from you

The average American now manages 10-15+ service relationships (phone, internet, insurance, bank, credit cards, streaming, utilities, healthcare, subscriptions). With 74% experiencing problems and 86% requiring repeat contacts, the typical person faces **60-80 customer service interactions per year** -- each one beginning with the same frustrating search for how to actually reach someone.

| | Without Sula | With Sula |
|---|---|---|
| Time finding contact info | 10-15 min | ~5 seconds |
| Average hold + chatbot time | 20-30 min | 20-30 min |
| Interactions/year | 60-80 | 60-80 |
| **Time lost searching/year** | **15-20 hours** | **~7 minutes** |
| **Total time lost to support/year** | **45-60+ hours** | **25-40 hours** |
| **Time saved** | -- | **~20+ hours/year** |

That's **more than two full workdays** you reclaim every year on search time alone. And because Sula surfaces hidden support pages and direct contact links that bypass chatbot funnels entirely, the total time saved grows even further -- cutting your annual support burden from 45-60 hours down significantly.

> The annoyance economy thrives because companies bet you'll give up before you find the right number. **Sula breaks that bet.**

The result: reaching a real human for help has become a skill, not a right.

**Sula** fixes this by scanning every website you visit and surfacing customer service contact information instantly -- before you even have to look for it.

## Changelog

### 1.6.0 -- 2026-06-03

Minor version bump for a strategically different product than what shipped as 1.5.2. The release that was originally drafted as 1.5.7 grew while it sat -- when the merge dust settled there were 20 PRs of feature work between 1.5.2 and now and the manifest description / privacy policy / product positioning had shifted from "find hidden contacts" to "bypass chatbots." That's a minor bump, not a patch.

No breaking changes -- same `activeTab` / `scripting` / `storage` / `<all_urls>` permissions, same `chrome.storage.local` schema, no user action required to update. The store listing description, screenshots, and category remain valid.

**Bypass chatbots specifically (the new product positioning):**

- **Chatbot vendor detection.** Detects 10 vendor widgets -- Intercom, Zendesk, Drift, Crisp, HubSpot, Tidio, LiveChat, Tawk, Freshchat, Olark -- by probing their config globals from a page-world script bridge. When a vendor is identified, we extract any directly-exposed contact email, reconstruct the vendor's standard help-center URL from the account identifier (`app_id` / subdomain / workspace ID), and surface that URL in the side panel's Support pages section. No interaction with the chat UI itself.
- **Zendesk Help Center search.** When the page carries a Zendesk Web Widget or is itself a Zendesk help center, the extension makes **one anonymous query** to that vendor's public help-center search API (`/api/v2/help_center/articles/search.json?query=contact`) to find the real support contact the bot was trained to deflect from. The bot is a thin RAG layer over these very articles; reading them directly returns the same answer without the chat-UI dance. `credentials: 'omit'`, once-per-subdomain-per-session, 1 MB cap, score floor 95.
- **Site-specific override library.** Curated registry of 24 canonical support contacts for the painful-to-scrape sites the product targets in its marketing: 6 airlines (Spirit, United, Delta, American, JetBlue, Southwest), 5 telcos (Xfinity, Comcast, AT&T, Verizon, T-Mobile), 4 banks (Wells Fargo, BofA, Chase, Citi), 3 e-commerce / payments (Amazon, eBay, PayPal), 2 streaming (Netflix, Hulu), 2 insurance (GEICO, State Farm), 2 government (IRS, SSA). Each entry stamped with `lastVerified: "YYYY-MM-DD"`. On-page finds still run and win via canonical `phoneKey` dedup -- so a stale override gets silently replaced by what the live page exposes.

**Broader contact discovery:**

- **Broader URL pattern matching.** `CONTACT_PAGE_PATTERNS` was too narrow -- `/\/contact/i` missed `/media-contacts` and `/direct-contact-information` (dhs.gov-style URLs). Replaced with a boundary-aware pattern (`/[-_\/]contacts?(?:[-_\/]|$)/i`) plus a new `/press` pattern for media pages.
- **Discovered-page background fetch.** The existing fallback fetch only fired when the in-page scan returned zero contacts. Most gov / large-org sites surface multiple specialized contact pages (`/contact` AND `/media-contacts` AND `/direct-contact-information`); only the first was being reached. New `fetchDiscoveredContactPages` fetches every same-origin contact-page link found during the scan (max 5 per scan, per-URL sessionStorage gate, 1 MB cap).
- **Sitemap.xml mining.** Many large sites surface canonical contact / press / newsroom pages in `/sitemap.xml` that the homepage's links section never touches. New `fetchSitemapContactUrls` fetches the sitemap (once per origin per session), extracts `<loc>` URLs matching contact-page patterns, and pipes them through the discovered-page fetch path.
- **`credentials: 'same-origin'` for background fetches.** Cloudflare-protected sites gate even public pages behind a `cf_clearance` cookie the user already has from normal browsing. With the previous `credentials: 'omit'` we got bot-challenge bodies back instead of real pages. Same-origin sends only cookies the user already has on this site -- equivalent to them clicking the link manually. No third-party identification, no cross-site tracking.
- **Page meta tag scan.** New `scanPageMeta` pulls contacts from author-declared metadata: `<meta property="og:email">`, `<meta property="business:contact_data:*">`, `<meta name="contact">`, `<link rel="me">`, `<link rel="author">`. Anything found here is high-confidence because the site author put it there deliberately.
- **Press-release / media-contact detection.** New `scanPressContacts` triggers on press / newsroom / media URLs OR on body text containing one of 15 anchor phrases ("Media Contact:", "For more information:", "press relations", etc.). Extracts within +/-300 char windows of each anchor with elevated confidence.
- **App Store / Play Store developer pages.** New `scanAppStorePages` activates on `apps.apple.com` and `play.google.com` listings. Extracts the developer email (`mailto:` anchors + `[itemprop="email"]` schema markup), phones, and labeled support / privacy / website links the stores require by policy.
- **Footer-specialized labeled-field extraction.** New `scanFooterSpecialized` walks `<footer>` / `[role="contentinfo"]` / `[class*="footer"]` and matches labeled patterns ("Toll Free:", "Fax:", "Sales:", "Customer Service - ..."). Footer-located contacts get a +10 score boost.
- **Smarter email patterns.** New `decodeObfuscatedText` preprocesses body text before `EMAIL_REGEX` so common scraper-defeating obfuscations resolve -- `jane (at) acme (dot) com`, `user [at] foo [dot] org`, `team＠host.tld` (fullwidth Unicode at), `user%40host.tld` (URL-encoded), `help&#64;host.tld` (HTML entity), `john_at_company_dot_net`. False-positive guard: bare "AT" / "DOT" replacement requires word chars on both sides so prose like "stop, at last" doesn't get mangled.

**Noise reduction (UX-critical fixes):**

- **Filter the user's own logged-in identity.** On any signed-in app (Google search, Gmail, GitHub, LinkedIn, Slack), the avatar's `aria-label` ("Google Account: Matt Duke (matt@gmail.com)") was getting parsed as a found contact. New `seedPersonalIdentity` runs as step 0 of `scanPage` and pre-seeds the dedup `seen` set with the user's own contacts.
- **Phone proximity anchor for loose-body scans.** Random snippet phones on Google search results, business directories, social feeds were being surfaced because the body `innerText` scan saw a 10-digit shape and pushed it. Phones from loose-body scans now require at least one of ~35 contact-context keywords (`contact`, `support`, `call us`, `toll free`, `tech support`, `main office`, etc.) within +/-100 chars.
- **Email domain-fit signal.** New `domainFitScore(email)` compares the email's host against the page we're currently on. +20 for matching site host (subdomain-aware), -25 for public-mailbox emails (gmail, outlook, yahoo, icloud) on a corporate site, -10 for mismatched corporate hosts. Folded into `scoreEmail` so the side panel naturally re-ranks results.

**Side panel UX:**

- **Vertical-only draggable tab.** The pull-tab was anchored at `top: 30%`. For workflows where that landed on top of a frequently-clicked region of a site (sticky nav, floating "back to top" buttons, sidebar headers), the tab sat in the user's way. Now: mousedown on the tab, drag up or down, release. Position persists across tabs and sessions via `chrome.storage.local.fmp_side_panel_tab_top`. 4 px threshold separates click-to-expand from drag-to-reposition; trailing click suppressed via a 50 ms grace flag.
- **Hours-aware contact recommendation.** When the business is closed and we have an email, a small amber tip appears under the hours banner: "Closed now -- email is your best bet off-hours." Phone calls during closed hours go to voicemail; email is the higher-yield channel.
- **Provenance label + tooltip per row.** Each email / phone row now shows a short visible source label between "Click to copy" and the score badge (e.g. `mailto link`, `site-known`, `chatbot intercom`, `press release`, `Zendesk KB`). Hover any row to see the full context string as a tooltip. Builds trust by making the reasoning visible -- a high-score result from a `mailto:` link reads very differently from a high-score result via free-text scan.

**Messaging:**

- **Manifest description rewritten** for the Web Store / AMO listing: "Bypass chatbots. Reads the chatbot's own knowledge base to surface real customer service contacts. 100% local, no account."
- **README intro updated** to name the 10 chatbot vendors detected and state the bypass mechanism.
- **`PRIVACY_POLICY.md` accuracy pass.** The previous policy said "the extension makes zero network requests." That stopped being true when the same-origin fallback fetch shipped earlier in the 1.5 line. The rewritten policy enumerates the **two** anonymous network-request paths the extension actually makes (same-origin contact-page fetches + Zendesk help-center search) with full constraints per path.

### 1.5.2 -- 2026-06-01

Scan-quality patch driven by two bugs an early Product Hunt user reported using https://www.thesanctuarygym.com/ as a control page. No new features; the side panel just produces cleaner results on sites that mix formatting variants or stack contact info across adjacent DOM blocks.

- **Phone deduplication: canonical key strips US country code.** Sites that emit both `tel:1(NNN)NNN-NNNN` (with leading `1`) and a visible `(NNN) NNN-NNNN` rendering were producing two phone entries for the same number. The `tel:` handler was storing the raw href string in the dedup set while the text scanner stored digits-only -- two different keys for the same number. A new `phoneKey()` helper normalizes to digits and drops the leading US `1`, so all three phone-push sites collapse the variants to one entry. Non-US numbers are unaffected: the strip-leading-1 rule only fires on 11-digit inputs, so `+44...` and other international country codes stay intact.
- **Email scan: stop cross-element DOM bleed.** On pages where a zip code or postal code sat in the block immediately preceding an email (`<span>...TX 77546</span><br></p></div><div>...email...</div>`), `el.textContent` was concatenating without whitespace and the regex was matching `77546email@host` as one address. Two-layer fix: contact-section scanning now uses `el.innerText` (which respects block boundaries) instead of `el.textContent`, and a `trimDigitPrefixBleed()` defense strips leading 5+ digit runs before a letter as backup for the residual inline-adjacent case. Conservative threshold leaves legitimate digit-prefixed locals like `123support@` untouched.

### 1.5.1 -- 2026-05-30

Side panel feature parity + a scroll-position bug fix. The pull-tab panel now offers the same surface the toolbar popup does, and stays put while you scroll it.

- **Side panel feature parity with the toolbar popup.** Five capabilities the popup had that the side panel was missing, now bundled together: a "Rate Sula" footer link (browser-aware: Firefox -> AMO, Chromium -> Chrome Web Store /reviews), a manual "Rescan" footer button (covers the rare cases the `MutationObserver` debounce misses), a top-of-panel hours banner that reads the page's structured/schema/microdata opening hours and labels Open / Closed / Unknown with a status dot, a Support pages section listing every contact-adjacent link the scan surfaced (Contact / Support / Help / FAQ etc.) so they survive across the Now / History view tabs, and a History tab inside the panel that mirrors the popup's history list with the same `chrome.storage.local.fmp_history` key and entry shape.
- **Bug fix: side panel no longer bounces to the top while you scroll.** The auto-rescan `MutationObserver` was rebuilding the panel's shadow DOM every ~1s on active pages (lazy images, sticky headers, infinite-scroll feeds all trigger it), throwing away the `.scroll` element along with its `scrollTop`. The re-render path now snapshots scroll position alongside the existing `wasExpanded` / `wasOpenRows` state and restores it after the rebuild, so mid-scroll users stay where they are.

### 1.4.0 -- 2026-05-10

New surface release. Most users never click the toolbar icon -- the side panel makes contacts discoverable inline on every page.

- **Side panel overlay.** A small green pull-tab on the right edge of every page where the scan found contacts; click it to expand a panel that lists the same ranked emails and phones the popup shows, with click-to-copy. Designed to match the discovery pattern users already know from Honey / Capital One Shopping / Rakuten.
- **Master toggle.** New "Side panel on pages" switch in the popup (default ON). Flipping it instantly hides panels on every open tab.
- **Per-domain dismiss.** "Hide on this site" button in the panel footer suppresses the panel on that hostname for 7 days.
- **CSS isolation via Shadow DOM.** Host-page styles can't bleed into the panel and vice versa.
- **New permission: `storage`.** Required to persist the two preferences above (master toggle + per-domain dismissal timestamp). Nothing else is stored; nothing leaves the browser.

### 1.3.3 -- 2026-04-30

Reliability patch. No new features; the popup just gets the right answer more often on dynamic pages.

- **Auto-rescan on DOM changes.** `content.js` now runs a `MutationObserver` over `document.body` and re-runs the page scan one second after the DOM settles. Catches contact info that lazy-loads after the initial `document_idle` scan -- the failure mode that produced "No contacts detected" on hydrating SPAs (Spirit, modern support pages, anything React/Next that streams). Debounced so live feeds don't burn CPU re-scanning every second.
- **Longer wait after re-injecting `content.js`.** When Chrome reloads extensions on profile sign-in/out, existing tabs lose the content script. The popup re-injects it, but the previous 500 ms wait was routinely too short for SPA hydration; bumped to 1500 ms.
- **Copy: "Rescan this page" -> "Rescan this site"** -- matches how users mentally model the action.

### 1.3.2 -- 2026-04-27

Major release. Cross-browser support and the new Compose / Call workflows.

- **Firefox support.** Single MV3 codebase now installs in both Chrome and Firefox 121+ -- paired `service_worker` + `background.scripts` fallback, plus `browser_specific_settings.gecko` (id, `strict_min_version`, `data_collection_permissions: none`) for AMO signing.
- **Compose templates for emails.** Each email card has a "Compose" toggle with chips for **Blank** (just open the chosen client with `To:` filled), Refund, Complaint, Cancel, Billing, and Support. Templates open in your preferred client -- Default mail app, Gmail web, or Outlook web -- and that choice persists in `localStorage`.
- **Call-via deep links for phone numbers.** Each phone card has a "Call" toggle that hands the number off to your dialer of choice -- system phone, WhatsApp, Google Voice, FaceTime, or Microsoft Teams. Numbers are auto-normalized to E.164 first.
- **Rate prompt.** A discrete `★ Rate Sula` link sits in the popup footer at all times, plus a one-time encouragement toast after you've copied 5 contacts. Browser-aware: Firefox users land on AMO, Chrome users on the Web Store.
- **Compose reliability fix.** HTTPS opens (Gmail web, Outlook web, WhatsApp web, Google Voice, Teams) now route through `chrome.tabs.create` instead of a programmatic anchor click, so the MV3 popup-blocker no longer silently suppresses the new tab. Protocol URIs (`mailto:`, `tel:`, `facetime-audio:`) still use anchor click so OS handlers register them.
- **Build scripts.** `build.sh` (bash) and `build.ps1` (PowerShell) produce store-ready zips for both stores from a single source tree.

> *Why 1.3.2 and not 1.2.0?* The Compose / Call additions warrant a minor bump from 1.1.x; .2 leaves patch-version headroom for two same-day fixes if anything needs to ship fast.

### 1.1.1 -- 2026-04-19

Compatibility fix release.

- **MV3 CSP fix.** Replaced inline `onclick` handlers with `addEventListener` so click-to-copy works correctly under Manifest V3's strict Content Security Policy. Without this, several click handlers silently failed in the popup.
- Refined extension description in `manifest.json` for the Chrome Web Store listing.

### 1.1.0 -- 2026-04-12

- **Business hours scanning.** The content script extracts business hours from three sources, in confidence order: Schema.org `openingHours` / `openingHoursSpecification` JSON-LD (highest), microdata `[itemprop="openingHours"]`, then keyword-anchored text patterns (`Mon-Fri 9am-5pm`, `Hours: 09:00 - 17:00`, etc.). The popup surfaces an **Open Now / Closed Now** banner with today's hours highlighted and a deduped weekly schedule below.

### 1.0.0 -- 2026-04-11

Initial release.

- **Auto-scans every page** for emails, phone numbers, and contact-page links.
- **Click to copy.** Tap any email or phone in the popup to copy it to the clipboard instantly.
- **Relevance scoring.** `support@`, `help@`, `care@` score green ("Likely support"); `noreply`, `careers`, `marketing`, `hr@` filter to the bottom. Phone numbers near "customer service" / "contact us" / "call us" get a boost; numbers near "fax" get a penalty.
- **Badge count** on the toolbar icon shows how many contacts were found on the current page at a glance.
- **Minimal permissions** -- `activeTab` and `scripting` only. Nothing leaves the browser; no servers, no analytics, no tracking.

## What It Does

The extension runs automatically on every page you visit. It:

1. **Scans for emails** -- finds all email addresses on the page, then ranks them by likelihood of being customer service (support@, help@, care@, contact@ score highest)
2. **Scans for phone numbers** -- extracts US and international phone numbers, prioritizing those near support-related keywords
3. **Finds contact page links** -- detects links to /contact, /support, /help, and other support pages you might not have noticed
4. **Scores and ranks results** -- each contact is scored by relevance (green = "Likely support", yellow = "Possible", gray = "Low match") so the best option is always at the top
5. **Shows a badge count** -- the extension icon shows how many contacts were found on the current page at a glance

## How It Works

```
 You visit any website
        |
        v
 Content script auto-scans:
   - mailto: and tel: links (highest confidence)
   - Footer and contact sections
   - Full page body text
   - Links to support/contact pages
        |
        v
 Results scored by relevance:
   - Email prefix (support@, help@, care@)
   - Nearby keywords ("customer service", "contact us")
   - Location on page (footer, contact section)
   - Negative signals (noreply@, careers@, marketing@)
        |
        v
 Click the extension icon
   - See ranked emails and phones
   - Click any result to copy to clipboard
   - Click support page links to navigate directly
```

## Install

### Chrome / Chromium (developer mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/MatthewDuke1/find-me-people.git
   ```
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `find-me-people` folder

### Firefox (temporary add-on via `about:debugging`)

1. Clone the repository as above
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on...**
4. Select the `manifest.json` file inside the `find-me-people` folder

> Temporary add-ons are removed when Firefox restarts. For a permanent install, the extension must be packaged and signed via [addons.mozilla.org](https://addons.mozilla.org). Requires Firefox **121 or newer** (MV3 service worker support).

### Building store-ready zips

Run the build script from the project root:

```bash
./build.sh
```

This produces:

- `dist/sula-chrome.zip`  -> upload to [Chrome Web Store developer console](https://chrome.google.com/webstore/devconsole)
- `dist/sula-firefox.zip` -> upload to [addons.mozilla.org/developers](https://addons.mozilla.org/developers/)

Both archives share the same unified manifest -- the split naming just keeps the per-store upload workflow explicit.

## Usage

- **Automatic scanning** -- the extension scans every page you visit. No button to click.
- **Badge count** -- the purple badge on the icon shows how many contacts were found.
- **Click the icon** -- opens the popup with ranked results.
- **Click any contact** -- copies it to your clipboard instantly.
- **Support page links** -- click to navigate directly to the company's contact page.
- **Rescan** -- hit the rescan button if the page loaded dynamically after the initial scan.

## Scoring System

| Score | Label | Meaning |
|-------|-------|---------|
| 70-100 | Likely support | Email prefix or nearby text strongly indicates customer service |
| 40-69 | Possible | Could be support, but context is ambiguous |
| 0-39 | Low match | Probably not customer service (marketing, careers, noreply, etc.) |

### What boosts a score
- Email contains: support, help, care, service, contact, info, billing, cs@
- Found near text: "customer service", "contact us", "call us", "help desk"
- Found via `mailto:` or `tel:` link (explicit contact intent)
- Located in a footer or contact section

### What lowers a score
- Email contains: noreply, no-reply, marketing, newsletter, careers, jobs, hr
- Phone found near "fax"

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Platform | Browser Extension (Manifest V3, Chrome + Firefox 121+) |
| Content Script | Vanilla JavaScript (scans every page) |
| Background | Service Worker (manages badge counts) |
| Popup | HTML + CSS + JS (no frameworks) |
| Permissions | `activeTab`, `scripting` only |

## Privacy

- **No data leaves your browser.** All scanning happens locally in the content script.
- **No external API calls.** No servers, no tracking, no analytics.
- **No browsing history access.** The extension only reads the current page's DOM.
- **Minimal permissions.** Only `activeTab` (current page) and `scripting` (to inject scanner on click).

## Project Structure

```
find-me-people/
├── manifest.json       # Unified MV3 manifest (Chrome + Firefox 121+)
├── content.js          # Injected into every page -- scans for contacts
├── background.js       # Service worker -- manages badge count
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic -- displays results, handles copy
├── build.sh            # Emits dist/{chrome,firefox}.zip for store uploads
├── icons/
│   ├── icon16.png      # Toolbar icon
│   ├── icon48.png      # Extensions page
│   └── icon128.png     # Chrome Web Store / AMO listing
└── README.md
```

## Why "Sula"?

Because when something goes wrong with a product or service, you don't want a chatbot. You don't want a knowledge base. You don't want to submit a ticket into a void. You want to talk to a person.

This extension is built on a simple belief: **access to human support should not require a scavenger hunt.**
