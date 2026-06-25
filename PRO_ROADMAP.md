# Find Me People — Pro features & paid-plan roadmap

## Guiding principle
**Free finds the contact. Pro keeps it, exports it, organizes it, and scales it.**

The free tier must stay genuinely useful — it's the acquisition engine (installs,
reviews, word of mouth). Pro monetizes **volume, data-out, workflow, and
enrichment** — the things the paying persona actually needs. We gate *additive
power features*, never take away something free users already rely on.

## Who pays
Individual power-users doing outreach **at volume**: recruiters, SDRs / sales,
founders doing cold outreach, BD, journalists, real-estate agents. They care
about (a) getting contacts **out** into a sheet/CRM, (b) **not re-doing** work,
and (c) **speed**. That's the wedge.

## The fence — Free vs Pro
| Capability | Free | Pro |
|---|---|---|
| On-page contact scan (all the deep detection) | ✅ | ✅ |
| Side panel, click-to-copy, Compose/Call actions | ✅ | ✅ |
| Save a **single** contact (.vcf) | ✅ | ✅ |
| Contact **history** (view + basic search) | ✅ (unlimited — no takeaway) | ✅ |
| **Bulk export** all found contacts / history (CSV + vCard) | — | ✅ |
| **Push to Google Sheets / webhook / CRM** | — | ✅ |
| **Bulk / multi-tab scan** (many pages at once) | — | ✅ |
| **Lists, tags, notes + power search** | — | ✅ |
| **Email pattern guess + verification** | — | ✅ |
| **Custom export templates / CRM field mapping** | — | ✅ |

> Note we deliberately do **not** cap free history count — removing value people
> already have is the fastest way to earn 1-star reviews. The fence is *export &
> scale*, not *artificial scarcity*.

## Pro features (current + planned)
| # | Feature | Why they pay | Builds on | Effort | Serverless? |
|---|---------|--------------|-----------|--------|-------------|
| **P1** | **Bulk export (CSV + vCard)** — all found contacts + full history | The #1 "get my data out" job | #66, #57 | ✅ shipped (gated) | ✅ |
| **P2** | **Send to Google Sheets / Webhook (Zapier)** | One-click into their CRM/pipeline | OAuth (Sheets) or a webhook URL | M | ✅ (client OAuth / webhook) |
| **P3** | **Bulk / multi-tab scan** — scan all open tabs or a pasted URL list, aggregate + dedupe | Volume prospecting in one pass | existing scan + background fetch (#23/#35) | M | ✅ |
| **P4** | **Lists, tags, notes + power search** — organize the (free) history into named lists | CRM-lite; stops re-finding people | history (#56) | M | ✅ |
| **P5** | **Email pattern guess + verification** — `first@domain` guess + deliverability check | The core sales-tool feature | a verification provider | L | ⚠️ needs a service (cost/privacy) |
| **P6** | **Custom export templates / CRM field mapping** | Drop-in to HubSpot/Salesforce columns | export (#66) | S–M | ✅ |
| **T1** | **Team: shared lists + seats** (future tier) | Expansion revenue from teams | a backend | L | ⚠️ needs backend |

✅ = stays in the no-backend, client-side model (cheap to run). ⚠️ = requires a
service/infra decision before building (P5 verification, T1 team).

## Paid plans
- **Free** — the acquisition engine (everything in the Free column above).
- **Pro** — **$3/mo · $24/yr · $49 lifetime**. One tier, three billing options
  as LemonSqueezy variants (the extension just opens the checkout — see
  `LEMONSQUEEZY.md`). Cheap-by-design: optimize for conversion volume, with the
  $49 lifetime as an early-adopter cash-flow anchor.
- **Team** *(future)* — ~$5–8/seat/mo for shared lists + seats. Only when there's
  pull; it's the first thing that needs a backend.

## Rollout roadmap
| Version | Theme | Ships | Goal |
|---|---|---|---|
| **v1.7** (shipped) | Rails dormant | LemonSqueezy scaffold (#68), export gated, `PRO_ENFORCED=false` | Build the paywall without charging |
| **v1.8** | **Launch Pro** | Flip `PRO_ENFORCED=true`; **P1 export** = Pro; LemonSqueezy store live | Prove people *pay* for one clear feature |
| **v1.9** | **Thicken Pro** | **P3 bulk/multi-tab scan** + **P6 export templates** | Make $3/mo a no-brainer for power users |
| **v2.0** | **Outreach toolkit** | **P2 Sheets/CRM push** + **P4 lists/tags/notes** | Pro becomes a *workflow*, not a feature → justifies annual/lifetime |
| **v2.1+** | **Enrichment** | **P5 email pattern + verification** | The real sales-tool tier (after the service decision) |
| **Later** | **Team** | **T1 shared lists + seats** | Expansion revenue; new price point |

## Sequencing logic
1. **Launch on the strongest single feature (export)** — don't dilute the first
   paywall across many half-features. One obvious value, validate willingness to pay.
2. **Thicken before you broaden** — v1.9 adds power to the *same* export buyer
   (more scanning + better export) so early Pro users feel the price is fair.
3. **Then turn it into a workflow** (v2.0) — Sheets push + lists is what converts
   "nice tool" into "I run my outreach on this," which is where annual/lifetime sells.
4. **Enrichment last** — P5/Team are the only items that break the serverless
   model; don't take on infra + per-verification cost until the free→Pro funnel
   is proven.

## Open decisions (need Matt)
- **Feature-gate vs usage-meter:** v1 is feature-gated (export = Pro). Could later
  add "N free exports/month then upgrade" if conversion needs a softer nudge.
- **P5 verification provider** — build vs buy (e.g., a verification API) — has
  cost + privacy implications; decide before v2.1.
- **Annual vs lifetime emphasis** — lifetime is great for early cash but caps LTV;
  consider sunsetting the $49 lifetime after the first ~few hundred sales.
