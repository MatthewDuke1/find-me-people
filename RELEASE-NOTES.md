# Sula — Release Notes (since v1.4.0)

_The stretch from v1.4.0 to v2.1.0: the rebrand from Find Me People to Sula, the
Pro tier going live, and the pivot to consumer advocacy — finding real humans,
accelerating refunds, and escaping bad subscriptions._

Firefox build: load via `about:debugging` (temporary) for testing, or from AMO
once signed. Same unified package as Chrome — one zip, both stores.

---

## v2.6.7 — Sula remembers what you buy

**The passive ledger.** Sula is already on the page when you buy something, so it
now keeps a record as it happens instead of asking you to export a bank
statement. When you land on an order confirmation or billing page it notes the
merchant, the amount, the order number and the date, plus renewal terms when the
page states them.

- **Refund deadlines date themselves.** A purchase Sula saw already has its date,
  so the deadline engine no longer needs you to type one in.
- **Renewal alerts before the charge.** Once a day Sula checks for subscriptions
  renewing in the next 5 days and puts the count on its toolbar icon. No OS
  notification and no `notifications` permission; the detail is in the popup.
- **Checkouts vs. purchases.** A checkout Sula sees is held as unconfirmed and is
  promoted only when the confirmation page arrives. An abandoned cart is dropped
  after 72 hours instead of becoming a fake purchase with a refund deadline.
- **One purchase, one entry.** Checkout, confirmation and a revisit days later are
  merged by order number, or by merchant and amount within 48 hours.
- **On by default, and easy to turn off.** A *Remember my purchases* switch sits
  beside the side-panel and Global Privacy Control switches.
- **Everything it holds is visible.** The top of the Subs tab lists what the
  ledger remembers, with a one-click delete-all. This view is not behind Pro:
  anyone Sula records for can see and erase it.
- **What it refuses to record.** If anything card-shaped appears on the page, the
  capture is abandoned entirely rather than scrubbed. Nothing is captured in a
  private window. Payment processors (Stripe, PayPal, Adyen) are never recorded
  as the merchant.
- **Where it goes: nowhere.** Stored in `chrome.storage.local` only. Never
  uploaded, synced or used for analytics. Purchases age out after about 18
  months; active subscriptions stay; at most 500 entries.

**Statement import recognises merchants properly.** Grouping used to rely on
hand-written patterns that failed on real bank descriptors:

- `PAYPAL *SPOTIFY` became `PAYPAL`, so every PayPal-routed subscription merged
  into one meaningless entry.
- `SPOTIFY P34F9G8 NEW YORK NY` kept the transaction id, so one subscription split
  into a separate merchant each month and was discarded. It never appeared.
- `SQ *BLUE BOTTLE` came back unchanged.

Sula now ships a table of 12 payment-processor prefixes and 335 recurring billers,
consulted before the old patterns. It matches whole words, so "The Honest
Company" is not mistaken for Google Nest. The table is static data built before
release: no model call, no network call, no API key at runtime.

**Also**

- The privacy policy now has a full section on the purchase ledger.
- The "Find Me People is now Sula" banner is retired. It never expired, so some
  1.x upgraders were still seeing it a dozen releases later.
- The What's new card can now feature a headline change and open the relevant tab.

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
