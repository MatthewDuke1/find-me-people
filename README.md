# Find Me People

A Chrome extension that instantly finds customer service emails and phone numbers on any website. Because companies are making it harder to reach a human -- we make it easier.

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

### From source (developer mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/MatthewDuke1/find-me-people.git
   ```

2. Open Chrome and go to `chrome://extensions/`

3. Enable **Developer mode** (toggle in the top right)

4. Click **Load unpacked** and select the `find-me-people` folder

5. The extension icon appears in your toolbar. Visit any website and click it.

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
| Platform | Chrome Extension (Manifest V3) |
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
├── manifest.json       # Chrome extension manifest (V3)
├── content.js          # Injected into every page -- scans for contacts
├── background.js       # Service worker -- manages badge count
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic -- displays results, handles copy
├── icons/
│   ├── icon16.png      # Toolbar icon
│   ├── icon48.png      # Extensions page
│   └── icon128.png     # Chrome Web Store
└── README.md
```

## Why "Find Me People"?

Because when something goes wrong with a product or service, you don't want a chatbot. You don't want a knowledge base. You don't want to submit a ticket into a void. You want to talk to a person.

This extension is built on a simple belief: **access to human support should not require a scavenger hunt.**
