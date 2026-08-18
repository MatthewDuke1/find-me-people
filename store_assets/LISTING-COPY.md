# Sula — Chrome Web Store listing copy

Rewritten 2026-08-11 for store search. The old title ("Sula - Find People
Quickly") ranked for nothing — nobody types "find people quickly." Store search
weighs the **name** and the **short description** most heavily, so both now carry
the terms people actually type.

**Target keywords** (what a real user types into the store search box):
`email finder` · `find email on website` · `contact finder` · `email extractor`
· `phone number finder` · `lead finder` · `contact scraper` (people search this
even though Sula doesn't scrape a database)

---

## 1. Extension name — `manifest.json` `"name"`

Store limit: 75 characters. Keep the brand first so it stays yours, then the
keyword phrase.

**RECOMMENDED (61 chars):**
```
Sula — Email & Phone Finder | Contact Finder for Any Page
```

Alternates, if you want a different emphasis:

```
Sula — Email Finder & Contact Extractor for Any Website     (58)
Sula — Find Email Addresses & Phone Numbers on Any Page      (55)
Sula — Email Finder, Contact & Lead Finder (No Signup)       (54)
```

**Why this beats the old one.** "Find People Quickly" contains zero search
terms. "Email Finder" and "Contact Finder" are the two highest-volume queries in
this category, and putting both in the name is the single biggest ranking lever
you have. The em-dash keeps the brand readable rather than looking keyword-stuffed.

---

## 2. Short description — `manifest.json` `"description"`

Hard limit: 132 characters. This shows in search results, so it has to carry
keywords *and* the reason to click.

**RECOMMENDED (129 chars):**
```
Email finder & contact finder for any page. Pulls emails and phone numbers instantly — ranked, one click, 100% local. No signup.
```

Alternates:

```
Find email addresses & phone numbers on any website. Instant contact finder — ranked by confidence, runs 100% local. No account.   (131)
Free email finder & phone number extractor. Finds real contacts on the page you're on — no signup, no tracking, nothing uploaded.  (130)
```

**Keep from the original:** "no account, no tracking" and "100% local" are your
actual differentiator against Hunter, Apollo, and every data-broker tool. Don't
drop them for keywords — they're why people install *you* instead of the
incumbent.

---

## 3. Detailed description — store listing field

This one is for humans who clicked through. Keywords still matter but readability
wins. Paste as-is.

```
Sula finds the emails and phone numbers already on the page you're reading.

Open any company page, support page, job posting, or profile — click Sula — get
the real contacts, ranked by confidence. No signup, no account, no data broker.

WHAT IT DOES

• Finds email addresses and phone numbers on any web page
• Ranks every contact by confidence so you know which one is real
• One click to copy, or export to CSV / vCard
• Scans support and contact pages automatically when they exist
• Pulls hiring-contact details from job postings
• Works everywhere — no per-site setup

100% LOCAL

Sula reads the page on your device. Nothing is uploaded, nothing is logged, and
there's no account to create. Most contact finders route your browsing through
their servers and build a profile from it. Sula can't, by design — the scan
never leaves your browser.

FREE FOREVER

Finding and copying contacts is free and always will be. No trial, no credit
card, no signup wall.

SULA PRO

For people doing outbound or support escalation all day:

• Save to CRM — push a page's contacts straight to HubSpot, Zapier, Make, or any
  webhook, as structured JSON with source URL, confidence, and timestamp
• Email verification — check an address is real before you send
• Job-posting contacts — pull the hiring contact from a listing
• Export — CSV and vCard

$6/month, $57.60/year, or $80 once for lifetime.

WHO IT'S FOR

Recruiters and sourcers • SDRs and founders doing outbound • Anyone who's ever
hunted for a real support email instead of a contact form • Support and
escalation work

WHY NOT A DATA BROKER

Sula doesn't have a database of people. It reads what's publicly on the page in
front of you — the same thing you'd do by hand, just faster. That's a deliberate
design choice: no scraped-profile database means nothing to leak, nothing to
subpoena, and nothing about you to sell.
```

---

## 4. What to change where

| Field | File / location | Action |
|---|---|---|
| Name | `manifest.json` → `"name"` | Replace with recommended name |
| Short description | `manifest.json` → `"description"` | Replace with recommended short desc |
| Detailed description | CWS Developer Dashboard → Store listing | Paste section 3 |
| Category | CWS Dashboard | Confirm it's **Workflow & Planning** (not Productivity — less competition) |

**Version bump required.** Changing `manifest.json` means a new build. Per
`PRICING_VERSION` in `background.js`, any release must stay **≥ 2.1.0** — current
is 2.1.2, so bump to **2.1.3**. Never ship below 2.1.0 or grandfathering
misfires and new users get Pro free.

---

## 5. After you publish

Store ranking updates take a few days to a couple of weeks. Track it:

- Search the store for `email finder`, `contact finder`, `find email on website`
  and note where Sula lands. Re-check weekly.
- Chrome-Stats (chrome-stats.com) tracks keyword rank over time — free tier is
  enough. Hao Nguyen built it and is #7 on the outreach list.
- Watch installs/week in the CWS dashboard, not total installs. The weekly number
  is what tells you whether the listing change worked.

**Don't change the listing again for at least 3 weeks.** You need a clean signal.
