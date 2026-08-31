# Checkout Guard — scope

The first **daily-use** feature. Where today's advocacy features are reactive
(you open them after a charge is wrong), Checkout Guard fires **before you pay**:
on a checkout page it reads the fine print the merchant buries — the real return
window, restocking fees, the cancellation path, and whether the purchase
auto-renews — and shows a quiet badge so the user decides with eyes open.

It rides along on normal shopping, so it earns a place in the "daily/weekly"
band the roadmap is chasing (`docs/pro-feature-roadmap.md`). It adds no new
permission and reuses two content scripts Sula already ships.

## Why this is a small build

Sula already has the two hard parts as content scripts loaded on every page:

- **`refund-moment-detector.js`** — classifies a page by URL + text signals with
  weighted scores and a threshold, and shows a dismissible shadow-DOM nudge.
  Checkout Guard is a *sibling moment*: `checkout` (pre-purchase), where the
  existing detector covers `order` (post-purchase) and `subscription`.
- **`refund-policy-extractor.js`** — `window.SulaRefundPolicy.summarizePolicy(text)`
  returns `{ windowDays, summary, ... }`, and `findPolicyOnPage()` locates
  policy text on the current page. Checkout Guard reads the same policy, at a
  different moment.

Both already run in the page context together (same `content_scripts` block),
so Checkout Guard can call them directly — no messaging, no popup round-trip.

## What it does, precisely

On a page classified as **checkout**, gather up to four facts and show them in a
single small card, each only if found (never invent a fact):

1. **Return window** — `SulaRefundPolicy.summarizePolicy(pageText).windowDays`
   (+ the plain-language summary). "30-day returns" vs "No return window found —
   check before paying."
2. **Restocking / final-sale flags** — the policy extractor's lexicon already
   includes `restocking`, `final sale`, `non-refundable`. Surface the ones
   present as short warnings.
3. **Auto-renewal** — regex scan of the checkout text for renewal language
   (below). If found, name it clearly: "This renews automatically."
4. **Cancellation path** — if the policy/return text names a cancellation
   method or the page links a "manage/cancel" URL, note that a path exists (do
   not claim to cancel it — inform only).

The card is advisory. It never blocks, never auto-acts, never promises. It says
what the fine print says, in plain words, before money moves.

## Detection — the `checkout` moment

Add a checkout classifier. Prefer a **new pure module** `checkout-signals.js`
(unit-testable, no DOM), mirroring how the moment detector separates
`classifyPage()` (pure) from `showMomentPrompt()` (DOM). Signals:

```
URL_SIGNALS (checkout):
  /\/(checkout|cart|bag|basket|payment|place-?order|review-?order)\b/i   weight 2
  /\/(secure|order)\/(checkout|payment)\b/i                              weight 2

TEXT_SIGNALS (checkout):
  /place your order|complete (your )?purchase|proceed to (payment|checkout)/i  w2
  /order total|order summary|payment method|billing address/i                 w1
  /you (will|'ll) be charged|by placing your order/i                          w2
```

Fire at **>= 2 points** (one strong or two weak), the same threshold the moment
detector uses. Crucially, **checkout must beat `order`**: an order-confirmation
page ("thank you for your order") is post-purchase and belongs to the existing
refund flow, not Checkout Guard. Guard against that by requiring a checkout
signal AND the absence of a strong post-purchase signal ("thank you for your
order", "order confirmed", an order number) before firing checkout.

### Auto-renewal scan (feeds fact #3 and Auto-renew Radar later)

```
/auto-?renew|automatically renew|renews (automatically|every|each)|
 recurring (payment|charge|billing)|until (you )?cancel|
 free trial (then|,? then|converts)|after (your )?trial/i
```

A hit sets `autoRenew: true` with the matched phrase for the card. This same
scan is the seed for **Auto-renew Radar** (roadmap daily #2) — build it here,
reuse it there.

## UI

Reuse the moment detector's shadow-DOM nudge pattern exactly (fixed, bottom-
right, dismissible, shadow root so page CSS can't touch it), restyled as an
info card rather than a CTA. Contents:

- Header: "Before you buy" + a small Sula mark.
- One line per fact found (return window, restocking/final-sale, auto-renew,
  cancellation path). Green check for a good term, amber dot for a catch.
- Footer: "Full policy →" opens Sula's Advocacy tab (the deep read), and a
  Dismiss. Shows once per checkout page; auto-dismisses after ~20s of no hover.

No fact ⇒ no card. Never show an empty or speculative card on a page that
merely looks like a cart.

## Free vs Pro

Checkout Guard is a **free** daily hook — it drives the habit and the install
story, consistent with keeping acquisition features free (guardrail 4). The
*depth* it points to is where Pro lives: the full policy read + drafted
cancellation/refund letter (already the free/Pro line). Auto-renew Radar's
tracker persistence is the natural Pro upsell later.

## Guardrails (from the roadmap, non-negotiable)

- **Inform only** — read and summarize the merchant's own text. Never act,
  cancel, or file. Never say "we'll cancel this for you."
- **Never invent a fact** — every line is quoted/derived from page text; a
  missing fact is stated as missing, not guessed.
- **No new permission** — runs in the existing `<all_urls>` content-script
  context; no `chrome.alarms`, no host additions, no network. Keeps store review
  clean.
- **Local only** — nothing leaves the page. Matches the anti-Rocket-Money
  posture and the "100% local" listing promise.
- **Quiet, dismissible, once-per-page** — a guard, not a nag. Respects
  `prefers-reduced-motion`.

## Files

| File | New/changed | Role |
|---|---|---|
| `checkout-signals.js` | new | Pure `classifyCheckout()` + `scanAutoRenew()`; no DOM. Unit-tested. |
| `checkout-guard.js` | new | Content script: detect checkout, call SulaRefundPolicy, render the shadow-DOM card. |
| `manifest.json` | changed | Add both to the first `content_scripts` `js` array (beside refund-moment-detector). |
| `build.sh` / `build.ps1` | changed | Add both files (keep parity — test 22). |
| `tests/cases/NN-checkout-signals.test.js` | new | Fixtures: real checkout URLs/text fire; order-confirmation does NOT; auto-renew phrases detected. |

## Build order

1. `checkout-signals.js` + its test — prove classification on fixtures (checkout
   fires, order-confirmation doesn't, auto-renew caught). Pure, fast, no DOM.
2. `checkout-guard.js` — wire signals + `SulaRefundPolicy` + the shadow-DOM card.
3. Manifest + build-script registration; manual pass on a few real checkouts
   (a store with a return window, one with final-sale items, one free-trial
   signup).

## Not in scope (later)

- Persisting the auto-renew into Subscription Guardian — that's
  **Auto-renew Radar** (roadmap daily #2); Checkout Guard only *detects and
  warns*. The shared `scanAutoRenew()` is the bridge.
- Price-drop watching — separate feature (roadmap daily #3).
