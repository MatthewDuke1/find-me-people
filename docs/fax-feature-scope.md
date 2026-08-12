# Fax delivery for Sula — feature scope

Status: proposal, not built. Written August 2026.

## Why this exists

Wells Fargo, Bank of America, Chase and most large issuers accept written
billing-error disputes by **fax and mail only**. There is no email address and
usually no upload form. A user who has done everything right — spotted the
charge, drafted the letter, gathered the receipt — hits a wall at the last step
because they do not own a fax machine.

That is the single most automatable remaining step in the refund workflow Sula
already owns.

## How fax actually works, and why banks still use it

A G3 fax scans a page into a 1-bit bitmap, compresses it (MH/MR/MMR run-length
encoding tuned for text), and modulates it into audio tones over a voice line.
Two machines negotiate speed, send page by page, and the receiver acknowledges
each page. Ceiling is 14.4 kbps.

Almost nothing runs on copper anymore. Most fax traffic today is **T.38**: the
transmission is carried as IP packets and only re-modulated to tones if the last
hop is analog. A fax to a large bank is, in practice, an IP transmission landing
in a digital document queue.

So why do banks still require it?

1. **Evidentiary standing.** A fax transmission report is long-established
   proof of delivery, with a timestamp and page count, accepted by courts and
   regulators. Email has no equivalent standing.
2. **Point-to-point framing.** Fax is treated as direct transmission rather than
   store-and-forward, which is the same argument healthcare uses for PHI.
3. **Legacy compliance systems** built when fax was normal and never rebuilt.

Friction is a real side effect — every extra step reduces dispute volume, and
nobody at the bank is rewarded for fixing that. But the requirement is better
explained by inertia plus evidentiary convenience than by deliberate obstruction.

**The important consequence for Sula: the transmission confirmation is the
product.** Not the fax. The timestamped receipt proving the dispute was sent
before the FCBA 60-day window closed is the thing worth paying for.

## What we would build

Sula does not implement fax. It resells a provider API. Nobody should own a fax
stack in 2026.

```
extension (popup/panel)
    |  user reviews the letter, attaches evidence, clicks Send
    v
sula-fax backend (new)
    |  render PDF, POST to provider, store receipt, purge payload
    v
fax provider (T.38)  ->  bank fax number
    |
    v  status webhook -> receipt stored -> extension shows confirmation
```

### Backend responsibilities

- Verify the caller holds a valid Pro license (LemonSqueezy validate).
- Render letter + attachments into a single PDF.
- Submit to the provider, poll or receive webhook for status.
- Store the **transmission receipt** (timestamp, destination, page count,
  provider confirmation id, success/failure).
- **Delete the document payload** once the receipt is confirmed.
- Rate limit per license to stop abuse.

### What the backend must never do

- Retain letter contents after confirmation.
- Log account numbers or attachment bodies.
- Send anything the user has not reviewed and explicitly submitted.

## Provider comparison

Two markets, and they are priced very differently.

### Developer / API providers (what Sula would use)

Fax pages take roughly one minute of transmission each, which matters when a
provider bills trunking separately.

| Provider | Per page | Trunking | All-in / page | 3-page dispute |
|---|---|---|---|---|
| **Telnyx** | $0.007 | +$0.005/min SIP | **~$0.012** | $0.036 |
| Documo / mFax | ~$0.02 | included | ~$0.02 | $0.060 |
| SRFax API | ~$0.03 | included | ~$0.03 | $0.090 |
| Phaxio (Sinch) | $0.07 | included | $0.07 | $0.210 |

Telnyx is cheapest but its published $0.007 **excludes SIP trunking**, which is
mandatory for transmission — the real number is roughly $0.012/page. Phaxio is
10x more expensive but is genuinely all-in with no monthly commitment, which is
the right trade for a first integration.

### Consumer subscription services (what users buy today)

Useful as a pricing anchor: this is what a user pays if Sula does not do it.

| Service | Monthly | Pages included | Overage |
|---|---|---|---|
| Fax.Plus | $8.99 ($6.99 annual) | 200 | per page |
| MyFax Home Office | $12.00 ($8.25 annual) | 200 | per page |
| SRFax Basic Plus | $11.45 | 200 | per page |
| eFax Plus | $18.99 (~$16.95 base) | 170 send + 150 recv | $0.10/page |
| MyFax Small Business | $25.00 ($20.83 annual) | 600 | per page |

The consumer market charges **$9–19/month for ~200 pages**. A user sending three
disputes a year is paying roughly $108/year for 9 pages of actual use.

## Unit economics

At Telnyx all-in ($0.012/page), a 3-page dispute costs **$0.036**.

| Faxes/month | Provider cost | Pro subs needed to cover |
|---|---|---|
| 100 | $3.60 | 1 |
| 500 | $18.00 | 3 |
| 2,000 | $72.00 | 12 |
| 10,000 | $360.00 | 60 |

A single $6/month Pro subscription absorbs **166 three-page disputes**. Even at
10 pages per dispute it covers 50.

**Conclusion: this is effectively free to include in Pro.** Do not meter it,
do not sell fax credits, do not build a wallet. Bundle it, cap it generously
(say 20 pages/month per license) to stop abuse, and let the cap be invisible to
every honest user.

That is also the strongest possible positioning against the consumer services:
they charge $9–19/month for fax alone; Sula includes it inside a $6/month plan
that also finds the contact, computes the deadline, and writes the letter.

## The real cost is not money

Three things make this harder than the price table suggests.

### 1. It breaks the architecture

Sula's core promise today is that scanning is local and there is no server we
operate. Faxing requires a backend that receives the user's **name, address,
account number, charge details, and evidence attachments** — the most sensitive
data the product has ever touched.

This is a genuine architectural fork, not an incremental feature.

Required changes:
- A hosted service with real uptime and security obligations.
- Privacy policy rewrite: a new named third party (the fax provider), a new
  category of transmitted data, and a stated retention window.
- Chrome Web Store data-disclosure update.
- Honest revision of "no server we operate" in the listing and on the site.

### 2. It bends "you always hit send"

Sula's differentiator is that it drafts and the user sends. A fax button means
Sula transmits on the user's behalf.

This is defensible if the flow is explicit: the user reads the full rendered
PDF, confirms the destination number, and presses Send. That is closer to a
stamp than to an agent. But it must be designed that way deliberately, and the
copy has to stay honest — Sula transmits a document the user approved, and never
acts as their legal representative.

### 3. Sending to the wrong number is a real harm

A dispute letter contains an account number. Faxing it to a wrong number leaks
it to a stranger. Bank fax numbers must come from a **curated, verified
registry** maintained by us, not from a number the page happened to contain or
the user typed from memory. Free-form entry should be a deliberate,
clearly-warned fallback.

## Scope of a first version

Build:
- Curated fax registry for the top issuers (Chase, Amex, BofA, Citi, Capital
  One, Wells Fargo, Discover), each number verified against the issuer's own
  published dispute instructions.
- PDF rendering of the existing letter templates plus user attachments.
- Send flow: preview -> confirm destination -> send -> receipt.
- Receipt stored and displayed in the Advocacy tab, exportable as proof.
- 20 pages/month per license cap.

Do not build:
- Inbound fax numbers for users.
- Fax to arbitrary numbers without a warning interstitial.
- Any retention of letter contents past confirmation.
- Metered credits or a fax wallet.

## Open questions

1. Where does the backend live, and who is on call when it breaks?
2. Does the fax provider sign a DPA? What is their retention default, and can
   it be shortened?
3. Does adding server-side PII processing require any state-level privacy
   disclosure beyond the policy rewrite (CCPA/CPRA in particular)?
4. Is receipt storage a liability we want? It proves delivery for the user, and
   it is also a record of their disputes sitting on our infrastructure.
5. Should the first version be mail (Lob API, physical letter) instead? Same
   backend shape, no fax gotchas, and mail is accepted everywhere fax is.

## Recommendation

The feature is worth building. It is the most painful unautomated step in a
workflow Sula already owns, users cannot easily do it themselves, and the
marginal cost is close to zero inside the existing Pro price.

But it should ship **after** the store listing and privacy policy are honest
about what v2.1.x already does, not alongside that cleanup. Adding server-side
PII processing to a product whose listing still claims "100% local" would
compound an existing accuracy problem rather than fix it.

Sequence: fix the listing and privacy copy first, then build fax as the
headline feature of 2.2.0 with its own privacy disclosure written before the
code.
