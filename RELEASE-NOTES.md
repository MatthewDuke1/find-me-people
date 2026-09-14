# Sula — Release Notes (since v1.4.0)

_The stretch from v1.4.0 to v2.1.0: the rebrand from Find Me People to Sula, the
Pro tier going live, and the pivot to consumer advocacy — finding real humans,
accelerating refunds, and escaping bad subscriptions._

Firefox build: load via `about:debugging` (temporary) for testing, or from AMO
once signed. Same unified package as Chrome — one zip, both stores.

---

## v2.6.8 — The introduction shows once

**Fixed: Sula kept re-doing its introduction.** All three introductions recorded
"seen" only when you dismissed them a particular way, so any other way of leaving
brought them back:

- **The example-contacts panel** was marked seen only by "Got it". Collapsing it,
  hiding it for a site, or navigating away re-opened it, expanded, on every page
  of every site.
- **The welcome tour** in the popup was marked done only by Skip, the last step or
  Esc. Clicking outside the popup, the usual way it closes, restarted the tour on
  every open.
- **The What's new card** was marked seen only by its buttons.

Each is now marked seen the moment it appears, so it shows once. The example panel
stays on the page where it first appeared until you dismiss it, and is never
spent on a background tab.

**Also fixed:** on a first visit to a page with real contacts, the panel labelled
them "examples, not real contacts". The examples banner now appears only when
example contacts are actually shown.

Verified in Chrome against the previous release, where all three reproduced, and
against this build, where none do.

_Includes everything from 2.6.7._

## v2.6.7 — The purchase ledger (Pro)

**Sula keeps a ledger of what you buy.** Sula is already on the page when you buy
something, so it keeps the record as it happens instead of asking you to export a
bank statement. On an order confirmation, checkout or billing page it notes the
merchant, the amount, the order number and the date, plus renewal terms when the
page states them.

The ledger is Sula's cornerstone Pro feature. It is recorded for every user, so
someone who upgrades opens a ledger that is already full.

**What Pro unlocks**

- **Every purchase, listed.** The Subs tab shows each purchase, with upcoming
  renewals at the top.
- **Renewal alerts before the charge.** Sula works out when each subscription
  next charges — from a stated date ("Next billing date: October 12") or a
  cadence ("renews monthly") rolled forward by calendar month — and shows a count
  on its toolbar icon plus a banner naming them when something renews within 5
  days. No system notifications, no `notifications` permission.
- **Refund forms filled in.** On a site where the ledger holds a confirmed
  purchase, the refund form arrives with the date, amount and order number, so the
  deadline countdown appears immediately.

**What every user gets**

- The count of what Sula has remembered, a one-click delete-all, and the off
  switch. Nobody has to pay to see whether data exists or to remove it.

**How the ledger behaves**

- A checkout is held as unconfirmed and becomes a purchase only when the
  confirmation arrives. Abandoned carts are dropped after 72 hours and never alert.
- One purchase is one entry across checkout, confirmation and later visits, and a
  subscription stays one entry however many months you visit its billing page.
- The purchase date is never mistaken for the next billing date on the same page.
- If anything card-shaped is on the page, the capture is abandoned. Nothing is
  captured in a private window. Payment processors are never recorded as merchants.
- Stored in `chrome.storage.local` only. Never uploaded, synced or used for
  analytics. Purchases age out after about 18 months; active subscriptions stay.

**Statement import recognises merchants properly** (Pro). A table of 12
payment-processor prefixes and 335 recurring billers, matched as whole words,
now runs before the old patterns — so `PAYPAL *SPOTIFY` is Spotify rather than
PayPal, and a subscription whose descriptor changes monthly is no longer split up
and discarded.

**Also**

- Privacy policy rewritten for the ledger, and brought up to date: the removed
  Zendesk help-center request is gone from the list of network requests, and the
  `alarms` and `declarativeNetRequest` permissions are now explained.
- The "Find Me People is now Sula" banner is retired.
- The What's new card can feature a headline change and open the relevant tab.

_Includes everything from 2.6.6._

## v2.1.0 — Pro pricing is live

- **Paid Pro tier**, via LemonSqueezy (Merchant of Record — handles global tax).
  Monthly $6 · Annual ~$58 · Lifetime $80. Unlocked by a license key validated
  directly against LemonSqueezy; no backend, no API secret shipped.
- **Pricing-trap guardrail** — an automated check that enforces
  `PRO_ENFORCED ⟺ version ≥ 2.1.0`, so a build can never accidentally give Pro
  away free or close the early-supporter window early.
- Existing pre-pricing users are **grandfathered** — Pro stays free for them, no
  key needed.

## v2.0.x — Consumer-advocacy & refund pipeline

The core repositioning: Sula helps you reach a real person and get your money
back. Sula **drafts, finds, tracks, and routes — you always hit send.** No fees
on your refund, no "we act for you."

- **Refund deadline engine** — enter a charge date, see exactly how long you have
  under each remedy: FCBA billing disputes (60 days), Reg E debit disputes,
  card chargebacks (~120 days), and the merchant's own return window, with a
  live countdown and urgency flags. Missing the window is the #1 reason refunds
  fail; now you won't.
- **Refund-request templates** — seven scenarios (unauthorized/duplicate charge,
  defective, not-as-described, free-trial auto-renewal, cancelled-but-charged,
  price-drop) with the right leverage baked in (FCBA, the merchant's policy,
  chargeback, FTC negative-option, CFPB).
- **Chargeback guidance** — tells you whether a chargeback is appropriate *yet*
  (try the merchant first), then gives the exact dispute steps for your card
  issuer (Chase, Amex, BofA, Citi, Capital One, Wells Fargo, or generic).
- **Refund-policy extractor** — reads the page and plain-languages the merchant's
  own return policy (window, full refund vs. store credit, restocking fees,
  final-sale catches) so your request cites their own terms.
- **Refund-moment detector** — recognizes order/receipt and subscription/billing
  pages so Sula offers the right help at the right time.
- **Escalation registry** — routes complaints to the right regulator (CFPB for
  banking/billing, FTC for scams, FCC for telecom, DOT for airlines, BBB, or
  your state AG), with the agency's filing link and tips.
- **Advocacy Letter Studio (Pro)** — generate refund, complaint, and
  cancellation letters in your voice.
- **Subscription Guardian / Cancellation Vault (Pro)** — track subscriptions and
  guide the cancellation/escalation ladder.
- **Apply-click contact finder (Pro)** — after you apply to a job, surface the
  company's points of contact.
- **Email verification pipeline** — free tiers check syntax, disposable domains,
  role accounts, and MX records; Pro adds real mailbox verification.

## v2.0.x — Pro tools & polish

- **Export contacts** as CSV + vCard (Pro).
- **Send to CRM / webhook** — one click pushes found contacts to Zapier, Make,
  HubSpot, or any webhook (Pro).
- **Draft the First Touch** — one-click personalized outreach email (Pro).
- **Email-quality hints** — flags disposable, role, and personal-mailbox
  addresses at a glance.
- **Network-transparency indicator** — shows exactly what (if anything) left your
  browser during a scan. Usually zero; when not, it says precisely what.
- **Pro gate names the specific feature** you tried, instead of a generic prompt.
- **Post-uninstall survey** to learn why people leave.

## v2.0.x — Fixes & performance

- Fixed a crash where scanning **died on any page with a shadow root**.
- Fixed **copy silently failing** while the toast claimed success.
- Rewrote the info panel in **plain language** for non-technical users.
- Extraction accuracy: JS-escape decoding, NANP US-number validation,
  cross-source de-duplication, international phone formatting, TLD/zip-prefix
  bleed fixes, and shadow-root free-text phone recovery.
- Performance: big-DOM caps in the scanner, a mutation-relevance gate, and an
  idle-scheduled, rate-limited auto-rescan so live pages update without
  thrashing.

## v1.5.x – v1.6.0 — The rebrand

- **Find Me People is now Sula.** New name, new mark, same 100%-local promise.
- One-time in-app rebrand notice for users updating from the 1.x line.

---

_Sula stays 100% local for its core: it reads the page you're on, ranks the real
contacts, and never runs a database of you. The only network calls are the ones
you trigger (an MX check, a license validation, opening a checkout) — and the
network-transparency indicator shows every one._
