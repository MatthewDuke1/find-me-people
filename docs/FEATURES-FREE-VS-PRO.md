# Sula — free vs Pro

Current as of **2.6.7**. Checked against the Pro gates in the code, not the other way round.

The shape of the split: anything that helps you *find out where you stand* is
free. Anything that *does the work for you* is Pro. A free user gets a real
answer on every feature, not a teaser.

---

## Free, forever

| Feature | What it does |
|---|---|
| **Contact finder** | Reads the page and surfaces real customer-service emails and phone numbers, ranked so the address most likely to reach a person is first. |
| **Support-posture signal** | Detects Intercom, Zendesk, Drift, Crisp, HubSpot, Tidio, LiveChat, Tawk, Freshchat, Olark and tells you how the company actually routes support — so a site with no published email is read as "routes through chat" rather than a dead end. Presence only: the help-center fetch this used to do was measured across 48 sites, recovered 2 usable addresses out of 21 extracted, and was removed in 2.6.6. |
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
| **Regulator directory** | Where to escalate — CFPB, FTC, DOT, FCC, BBB, state AG — with filing links. |
| **Email quality checks** | Syntax, disposable domains, and role-account detection, all local. |
| **Network transparency** | Shows exactly what (if anything) left your browser during a scan. Three of the six request sites were removed in 2.6.6, so this now reads a truthful zero on far more pages. |
| **Checkout Guard** | Reads the fine print a merchant buries on the checkout page — auto-renewal terms, restocking fees, final-sale flags — before you pay. |
| **Privacy Guard / GPC** | Sends a Global Privacy Control signal, which several US states legally require sites to honour. The switch is free; the Privacy Guard *tab* (data-broker opt-out tracker) is Pro. |
| **Refund & complaint letters** | Refund request, cancellation request, and executive escalation letters, built from the facts you enter. Free since 2.6.3. |
| **Chargeback guidance** | Whether a chargeback is the right move *yet*, then the dispute steps. |
| **Subscription Guardian (manual)** | Add a subscription by hand on the Advocacy tab and see how many days until it renews. No alerts; automatic renewal alerts come from the ledger (Pro). |
| **Purchase ledger: capture, count, delete** | Sula records purchases for every user. A free user sees how many, can delete them all, and can switch capture off. The detail and what the ledger powers are Pro (below). |

## Pro — $6/month, $57.60/year, or $80 once

| Feature | What it does |
|---|---|
| **Passive ledger** | The cornerstone. Every purchase Sula has remembered, listed in the Subs tab with upcoming renewals first. |
| **Renewal alerts** | Toolbar count plus a popup banner naming what renews in the next 5 days. Dates come from the page's stated next billing date, or its cadence rolled forward by calendar month. |
| **Refund-form prefill** | On a site where the ledger holds a confirmed purchase, the refund form arrives with date, amount and order number, so deadlines appear instantly. |
| **Statement import** | CSV / OFX / QFX from your own bank, parsed in the browser, with 335 merchants recognised by name. The power-user path now that the ledger exists. |
| **Bulk export** | Contacts as CSV or vCard. |
| **Save to CRM** | Push a page's contacts to your own webhook. |
| **Draft outreach** | A cold email pre-filled to the contact you found. |
| **Privacy Guard tab** | Data-broker opt-out tracker: each broker's real opt-out page and a 6-month re-check reminder. Points you at each one; does not submit removals. |
| **Regulatory escalation drafts** | Complaint letters aimed at the right agency. |

---

## Grandfathering

**Anyone who installed Sula before pricing shipped keeps Pro for good — every
Pro feature, including ones added later, with no license and nothing to click.**

That covers the passive ledger, renewal alerts and refund-form prefill, and
anything Pro that ships after them. Two ways to qualify, so nobody slips through:

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
refund-policy reader and the regulator directory are free for the same reason —
you always learn where you stand. Pro is what you buy once you know you need it.

**Autofill is entirely free.** It is the acquisition hook. Resume analysis is
the thing worth paying for, so that is where the line falls between two features
that live next to each other.

## What Pro is not

Pro does not buy you a service that acts on your behalf. Sula drafts, finds,
computes, and tracks — you always hit send. There is no percentage taken from
any refund you recover, and Sula never represents you. A $6/month subscription
either earns its keep or it doesn't; it is not a cut of your money.

---

## Removed features

Kept here so they are not re-proposed, and because the store listing and this
doc both advertised them.

| Feature | Removed | Why |
|---|---|---|
| Resume match, coverage, rewrite | 2.6.6 | Job-seeker tooling in a Shopping-category consumer extension. Moved to ApplyPilot. -946 lines. |
| Help-center fetch (Zendesk / Freshdesk / Crisp) | 2.6.6 | Measured across 48 sites: 2 usable addresses out of 21 extracted, 86% noise. The Zendesk subdomain it depended on was wrong 3 times out of 3. -410 lines, and half the network request sites went with it. |
| Contact export (CSV / vCard) | pending | Bulk-exporting a page's contacts is lead-generation behaviour, not consumer advocacy. |
| Save to CRM | pending | The literal B2B feature. Its copy is what the Chrome Web Store cited when the listing was rejected for keyword spam. |
| Draft the first touch | pending | Outbound sales, by name. |

## A line the product does not cross

The ledger remembers, but it never transmits. Everything it captures stays in
`chrome.storage.local` on the device that captured it. No sync, no backup, no
analytics, no "improving the product" — the moment purchase data leaves the
browser, every claim in this document collapses at once.
