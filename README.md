# Find Me People

A browser extension that instantly finds customer service emails and phone numbers on any website. Because companies are making it harder to reach a human -- we make it easier.

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

| | Without Find Me People | With Find Me People |
|---|---|---|
| Time finding contact info | 10-15 min | ~5 seconds |
| Average hold + chatbot time | 20-30 min | 20-30 min |
| Interactions/year | 60-80 | 60-80 |
| **Time lost searching/year** | **15-20 hours** | **~7 minutes** |
| **Total time lost to support/year** | **45-60+ hours** | **25-40 hours** |
| **Time saved** | -- | **~20+ hours/year** |

That's **more than two full workdays** you reclaim every year on search time alone. And because Find Me People surfaces hidden support pages and direct contact links that bypass chatbot funnels entirely, the total time saved grows even further -- cutting your annual support burden from 45-60 hours down significantly.

> The annoyance economy thrives because companies bet you'll give up before you find the right number. **Find Me People breaks that bet.**

The result: reaching a real human for help has become a skill, not a right.

**Find Me People** fixes this by scanning every website you visit and surfacing customer service contact information instantly -- before you even have to look for it.

## Changelog

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
- **Rate prompt.** A discrete `★ Rate Find Me People` link sits in the popup footer at all times, plus a one-time encouragement toast after you've copied 5 contacts. Browser-aware: Firefox users land on AMO, Chrome users on the Web Store.
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

- `dist/find-me-people-chrome.zip`  -> upload to [Chrome Web Store developer console](https://chrome.google.com/webstore/devconsole)
- `dist/find-me-people-firefox.zip` -> upload to [addons.mozilla.org/developers](https://addons.mozilla.org/developers/)

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

## Why "Find Me People"?

Because when something goes wrong with a product or service, you don't want a chatbot. You don't want a knowledge base. You don't want to submit a ticket into a void. You want to talk to a person.

This extension is built on a simple belief: **access to human support should not require a scavenger hunt.**
