# Sula — free vs Pro

Current as of **2.3.0**.

The shape of the split: anything that helps you *find out where you stand* is
free. Anything that *does the work for you* is Pro. A free user gets a real
answer on every feature, not a teaser.

---

## Free, forever

| Feature | What it does |
|---|---|
| **Contact finder** | Reads the page and surfaces real customer-service emails and phone numbers, ranked so the address most likely to reach a person is first. |
| **Chatbot bypass** | Detects Intercom, Zendesk, Drift, Crisp, HubSpot, Tidio, LiveChat, Tawk, Freshchat, Olark — and reads the vendor's own help-center data to find the contact the bot deflects from. |
| **Deeper scanning** | JSON-LD, schema.org, hydration state (`__NEXT_DATA__`), same-origin iframes, and a same-origin contact-page fallback. |
| **Copy history** | The last 50 contacts you copied, searchable. |
| **Business hours** | Live "Open now" / "Closed" from the page's structured data. |
| **Compose & call** | Pre-filled email templates and one-click VOIP deep links (WhatsApp, Google Voice, FaceTime, Teams). |
| **Side panel** | A pull-tab on any page where contacts were found. |
| **Refund deadline countdown** | Enter a charge date, see every clock that applies: FCBA (~60 days for credit-card billing errors), Regulation E (~60 days for debit), card chargeback (commonly ~120 days), and the merchant's own return window. Missing the window is the top reason refunds fail. |
| **Refund-policy reader** | Pulls the merchant's stated refund terms off the page in plain language, so your request can quote their own words. |
| **Refund-moment detector** | Recognises order, receipt, and subscription pages and offers help there. |
| **Autofill** | Save your details once, fill any application or contact form in one click. Stored on your device, highlighted so you can check it, and never auto-submitted. |
| **On-page autofill button** | On a form page with no contacts, a floating **Fill** button appears so you never have to open the toolbar. |
| **Resume match score** | Paste your resume, scan a job posting, see what percentage of the posting's terms your resume already supports. |
| **Resume coverage & gaps** | Every term the posting emphasises, split into what you already cover and what you don't. |
| **Regulator directory** | Where to escalate — CFPB, FTC, DOT, FCC, BBB, state AG — with filing links. |
| **Email quality checks** | Syntax, disposable domains, and role-account detection, all local. |
| **Network transparency** | Shows exactly what (if anything) left your browser during a scan. |

## Pro — $6/month, $57.60/year, or $80 once

| Feature | What it does |
|---|---|
| **Refund & complaint letters** | Seven scenarios (unauthorized charge, duplicate charge, defective, not as described, free-trial auto-renewal, cancelled-but-charged, price drop), each written with the right leverage — FCBA, the merchant's own policy, chargeback, FTC negative-option, CFPB. |
| **Chargeback guidance** | Tells you whether a chargeback is the right move *yet* (often: write to the merchant first), then the exact dispute steps for Chase, Amex, Bank of America, Citi, Capital One, or Wells Fargo. |
| **Subscription Guardian** | Tracks renewal dates, warns before a free trial converts, and drafts the cancellation. |
| **Regulatory escalation drafts** | Complaint letters aimed at the right agency. |
| **Resume rewrite guidance** | For each gap, which of *your own* bullets could carry it, with a copy button. Sula never writes the claim — you decide what is true. |
| **Contact export** | CSV and vCard. |
| **Save to CRM** | One click to Zapier, Make, HubSpot, or any webhook. |
| **Draft the first touch** | A personalised outreach email for a contact you found. |
| **Mailbox verification** | Real deliverability checks beyond the free syntax/MX tier. |

---

## Grandfathering

**Anyone who installed Sula before pricing shipped keeps Pro for good — every
Pro feature, including ones added later, with no license and nothing to click.**

That covers the Resume rewrite guidance in 2.3.0 and anything Pro that ships
after it. Two ways to qualify, so nobody slips through:

1. Running any build older than `PRICING_VERSION` (2.1.0), on install *or*
   update — the flag is written before pricing ever reaches them.
2. Updating straight into a pricing build from an older one, having skipped
   the builds in (1).

A clean install of a pricing build matches neither, so genuinely new users pay.
The flag is `sula_early_supporter`, and `isPro()` honours it before it ever
looks for a license:

```js
if (!PRO_ENFORCED) return true;              // pre-pricing build
if (await isEarlySupporter()) return true;   // grandfathered, no license needed
```

Verified across the three cases:

| User | `isPro()` |
|---|---|
| Grandfathered early supporter | `true` |
| Brand-new install, no license | `false` |
| Paying user with a valid license | `true` |

---

## Where the paywall sits, and why

Two rules, applied consistently:

**A free user always gets a real answer.** The refund deadline countdown is free
because knowing your FCBA window has expired is the single most valuable thing
Sula can tell you, and charging for it would be charging for the diagnosis. The
resume match score and gap list are free for the same reason — you see your
actual score and every gap. Pro is what you buy once you know you need it.

**Autofill is entirely free.** It is the acquisition hook. Resume analysis is
the thing worth paying for, so that is where the line falls between two features
that live next to each other.

## What Pro is not

Pro does not buy you a service that acts on your behalf. Sula drafts, finds,
computes, and tracks — you always hit send. There is no percentage taken from
any refund you recover, and Sula never represents you. A $6/month subscription
either earns its keep or it doesn't; it is not a cut of your money.
