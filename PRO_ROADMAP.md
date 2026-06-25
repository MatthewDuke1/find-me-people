# Find Me People — Pro features & paid-plan roadmap

## Guiding principle: every job in ≤3 clicks
**Find Me People kills the most tedious part of outreach — hand-collecting
contacts.** The whole product runs on a click budget:

- **Finding contacts = 0 clicks.** Auto-scan on page load; the side panel just
  shows them.
- **Doing something with them = ≤3 clicks, ideally 1.** Copy, export, or push to
  your CRM — *without ever selecting-and-copy-pasting.*

Free does the finding. **Pro is the ≤3-click "get it where it needs to go."**
That's the time it saves, and that's what people pay for. Every Pro feature has
to pass one test: **does it remove clicks / minutes from a job people do over and
over?** If not, it doesn't ship.

## The pitch is time, not data
Recruiters, SDRs/sales, founders, BD, journalists, real-estate — anyone
collecting contacts **at volume**.

- Manual capture ≈ **20–40 sec per contact** (find → select → copy → switch tab →
  paste → fix formatting).
- FMP Pro ≈ **1–2 clicks for the entire page**.
- A 30-contact page: ~**15 min by hand → ~3 seconds**. A recruiter doing 10
  pages/day saves **~2+ hours/day**. At any hourly rate, **$3/mo is a rounding
  error** — *that's* the sell.

## The fence — Free vs Pro
| Capability | Free | Pro |
|---|---|---|
| Auto-scan contacts (all the deep detection) — **0 clicks** | ✅ | ✅ |
| Side panel, Compose/Call, copy **one** contact (1 click) | ✅ | ✅ |
| Save a **single** .vcf | ✅ | ✅ |
| Contact **history** (view + basic search, unlimited) | ✅ | ✅ |
| **Whole page → CSV / vCard** in 2 clicks | — | ✅ |
| **Whole page → Google Sheet / CRM / webhook** in 2 clicks | — | ✅ |
| **Copy ALL** contacts to clipboard in 1 click | — | ✅ |
| **Keyboard shortcut** to scan+send (0 clicks) | — | ✅ |
| **Scan every open tab** at once | — | ✅ |
| **Lists / tags / notes + power search** | — | ✅ |
| **Email pattern guess + verification** | — | ✅ |
| **Custom export templates / CRM field mapping** | — | ✅ |

> We never cap free history or hide found contacts — removing value people
> already have earns 1-star reviews. The fence is **speed at volume**, not scarcity.

## The ≤3-click promise (click budget per Pro action)
| Action | Clicks | Replaces (by hand) |
|---|---|---|
| Copy one contact | **1** — click the chip | select + Ctrl-C |
| Whole page → CSV / vCard | **2** — open → Export | copy/paste every row |
| **Whole page → Google Sheet / CRM** | **2** — open → Send | paste each contact one by one |
| Copy ALL to clipboard | **1** — open → Copy all | N× select + copy |
| Scan every open tab + export | **3** — open → Scan tabs → Export | visit + scan each tab |
| Scan + send via keyboard shortcut | **0 clicks** (hotkey) | all of the above |

*(With the side panel pinned, most of these drop a click — the panel's already open.)*

## Pro features — ordered by clicks/time killed
| # | Feature | The ≤3-click win | Effort | Serverless |
|---|---------|------------------|--------|------------|
| **P1** | **Bulk export CSV + vCard** (page + history) | 2 clicks vs paste-every-row | ✅ shipped (gated) | ✅ |
| **P2** | **Send to Google Sheet / webhook / CRM** *(the hero)* | 2 clicks vs paste-one-by-one into your pipeline | M | ✅ (client OAuth / webhook) |
| **P3** | **Copy ALL** to clipboard | 1 click vs N copies | S | ✅ |
| **P4** | **Keyboard shortcut** — scan + export/send | **0 clicks** | S | ✅ |
| **P5** | **Bulk / multi-tab scan** | 1 click = many pages | M | ✅ |
| **P6** | **Lists / tags / notes + power search** | stop re-finding the same people | M | ✅ |
| **P7** | **Email pattern guess + verification** | skip manual guess + bounce-checking | L | ⚠️ needs a service |
| **P8** | **Custom export templates / CRM mapping** | drop-in, zero reformatting | S–M | ✅ |
| **T1** | **Team: shared lists + seats** *(future)* | — | L | ⚠️ needs backend |

✅ = stays in the no-backend, client-side model. ⚠️ = needs a service/infra
decision first (P7 verification, T1 team).

## Paid plans
- **Free** — the acquisition engine (the Free column above): find in 0 clicks,
  copy one in 1.
- **Pro** — **$3/mo · $24/yr · $49 lifetime** (one tier, three LemonSqueezy
  variants; the extension just opens the checkout — see `LEMONSQUEEZY.md`).
  Cheap-by-design: optimize for conversion volume, with $49 lifetime as an
  early-adopter cash anchor.
- **Team** *(future)* — ~$5–8/seat/mo for shared lists + seats. First thing that
  needs a backend; only when there's pull.

## Rollout roadmap (speed-first)
| Version | Theme | Ships | The promise it delivers |
|---|---|---|---|
| **v1.7** (shipped) | Rails dormant | scaffold #68, export gated, `PRO_ENFORCED=false` | build the paywall without charging |
| **v1.8** | **Never copy-paste again** | **P1** export live + **P3 Copy-all** + **P4 hotkey** | one-click/zero-click off the page |
| **v1.9** | **One click to your stack** | **P2 Sheets/CRM push** + **P8 templates** | page → your pipeline in 2 clicks |
| **v2.0** | **A whole session in one pass** | **P5 multi-tab scan** + **P6 lists/notes** | many pages, one click; stop re-finding |
| **v2.1+** | **Enrichment** | **P7 pattern + verify** | after the service decision |
| **Later** | **Team** | **T1 shared lists + seats** | expansion revenue, new price point |

## Why this order
1. **Lead with the rawest time-save** — export + copy-all + hotkey are *tiny* to
   build and instantly deliver "never copy-paste a contact again." Cheapest path
   to a payable promise, and the cleanest demo of the speed angle.
2. **Then one-click-to-CRM (P2)** — the highest-value click kill (destroys the
   paste-into-CRM loop), worth the small OAuth/webhook lift.
3. **Then volume (P5)** — multiplies the saving across an entire prospecting
   session.
4. **Enrichment last** — P7/Team are the only items that break the serverless
   model; don't take on infra + per-verify cost until the free→Pro funnel is proven.

## Open decisions (need Matt)
- **Free teaser vs Pro for Copy-all / hotkey:** a free "copy all (plain text)"
  is a great speed *demo* that funnels to Pro's structured export + CRM push.
  Leaning Pro-but-generous; could free-tier the plain-text copy.
- **Feature-gate vs usage-meter:** v1 is feature-gated (export = Pro). Could add
  "N free exports/month then upgrade" if conversion needs a softer nudge.
- **P7 verification:** build vs buy (cost + privacy) — decide before v2.1.
- **Lifetime sunset:** $49 lifetime is great for early cash but caps LTV;
  consider retiring it after the first few hundred sales.
