# Find Me People

A Chrome extension that instantly finds customer service emails and phone numbers on any website. Because companies are making it harder to reach a human -- we make it easier.

## The Problem

Customer service is disappearing.

- **Companies are cutting support staff.** Between 2023-2026, major companies eliminated tens of thousands of customer service positions. Telecoms, airlines, banks, and retailers have all reduced human support headcount while increasing automation.
- **Contact info is deliberately hidden.** Many companies bury their phone numbers and emails behind chatbot walls, help articles, and multi-step "contact us" funnels designed to deflect you before you ever reach a person.
- **Chatbots are the new gatekeepers.** You're now expected to explain your problem to a bot, navigate a decision tree, and prove the bot can't help you -- all before getting the option to speak with someone.
- **The "self-service" trap.** FAQ pages and knowledge bases are positioned as the first (and only) support channel. The actual email or phone number is either absent from the page or requires 4+ clicks to find.
- **Time is the real cost.** The average person spends 10-15 minutes trying to find a company's real support contact. Multiply that by every service you use -- internet, insurance, banking, subscriptions -- and you're losing hours every year to an intentionally frustrating system.

### The math: ~6 hours/year wasted finding contact info

The average American manages 8-12 service relationships -- phone, internet, insurance, bank, credit cards, streaming, utilities, and more. [58% of Americans contact customer service in any given month](https://www.statista.com/statistics/815526/customers-who-have-contacted-customer-service-in-the-past-month-us/) (Statista), and [86% have to contact support multiple times for the same issue](https://www.helpscout.com/75-customer-service-facts-quotes-statistics/) (HelpScout). Conservatively, that's **~30 customer service interactions per year**.

At 10-15 minutes spent hunting for the right number or email each time:

| | Without Find Me People | With Find Me People |
|---|---|---|
| Time per search | 10-15 min | ~5 seconds |
| Interactions/year | ~30 | ~30 |
| **Annual time spent** | **5-7.5 hours** | **~2.5 minutes** |
| **Time saved** | -- | **~6 hours/year** |

That's nearly a full workday you get back every year -- just from not having to hunt for a phone number or email address.

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
