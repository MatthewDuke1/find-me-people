# Sula strategic direction: consumer advocacy, not B2B lead-gen

**Decision (2026-07-31):** Sula does not compete with Apollo/ZoomInfo-style B2B
sales-intelligence tools. That direction was explored in an earlier SWOT and
is explicitly abandoned. Sula's positioning returns to — and sharpens — its
own stated identity (`package.json`): *"bypasses chatbots and surfaces real
customer service contacts."* That's a consumer-advocacy tool, not a sales
tool, and it always was one before the B2B detour.

---

## Part 1 — Email verification providers' free tiers (context for Sula's own free/Pro cut)

| Provider | Free tier | Paid entry price | Notes |
|---|---|---|---|
| **MyEmailVerifier** | 100 requests/**day** (~3,000/mo) | $0.0025/request — lowest in market | Most generous free tier found; no credit card required |
| **ZeroBounce** | 100 credits/month, roll over, never expire | ~$0.008/request | 98%+ accuracy claim, spam-trap detection, AI scoring |
| **Hunter.io** | 25 searches + 50 verifications/mo (sources vary; one cites 100 verifications/mo — confirm current figure before quoting publicly) | Subscription only, no pay-as-you-go | Combines finder + verifier in one tool |
| **Abstract API** | 100 calls/month | $0.005/request | Developer-oriented aggregator; "not production-grade" per one review |
| **Snov.io** | 50 monthly credits, **shared** across finder + verifier | Credit-based | Full sales-automation platform bolted around the verifier |
| **NeverBounce** | One-time trial credit block (not renewing) | ~$0.008/request | Weakest free-tier structure of the group |

Sources: [Hunter vs ZeroBounce vs NeverBounce 2026](https://apiscout.dev/guides/hunter-vs-zerobounce-vs-neverbounce-email-validation-api-2026) · [MyEmailVerifier pricing](https://myemailverifier.com/blog/email-verification-api-pricing/) · [Abstract API](https://www.abstractapi.com/guides/email-validation/free-email-validation) · [Snov.io API](https://snov.io/api)

**What this means for Sula's own tiers:** every provider above metrics its free tier tightly because *they* pay real infra/IP-reputation cost per lookup. Sula's Tier 0–2 (relevance heuristic, syntax/disposable-list, MX-exists check) cost Sula **$0 per lookup** — no SMTP probing, no IP reputation to protect. Sula can afford to make Tiers 0–2 **unlimited and free**, which no competitor above can match at their own free tier. Tier 3 (real mailbox verification) is the one tier that costs money per lookup (rent from a provider like MyEmailVerifier at ~$0.0025–0.008/request) — that's the correct, and only necessary, Pro gate.

---

## Part 2 — Consumer-advocacy competitor landscape

| Product | Core mechanism | Pricing | Documented weaknesses |
|---|---|---|---|
| **Rocket Money** (formerly Truebill) | Links to your bank via account aggregation; tracks subscriptions/bills; cancels subscriptions; negotiates bills on your behalf | Free tier + "pay what's fair" Premium ($7–14/mo) + **35–60% success fee** on negotiated savings | Surprise negotiation charges users didn't know were happening; "savings" sometimes a one-time credit misrepresented as recurring; hard-to-cancel Premium itself; charges continuing post-cancellation |
| **DoNotPay** | Chatbot automates 100+ consumer actions: cancel subscriptions, negotiate bills, appeal tickets, fight bureaucracy | Subscription | Sued in CA (2023) for **practicing law without a license** and misleading claims about "robot lawyer" capability; FTC action for deceptive claims (see earlier session) |
| **GetHuman** | Tells you the fastest real phone number + IVR button sequence for any company + estimated hold time; app **waits on hold for you** and texts when a human picks up | Freemium | Closest positioning match to Sula's own stated purpose — but is phone-only, no email/web-contact discovery, no browser-integrated "you're on this company's page right now" context |

Sources: [Rocket Money review 2026](https://www.coinstocashdollars.com/post/rocket-money-review-2026-is-the-popular-budgeting-app-worth-your-money-and-your-data) · [Rocket Money pricing](https://getfinny.app/blog/rocket-money-pricing-2026) · [DoNotPay overview](https://opentools.ai/tools/donotpay) · [GetHuman](https://gethuman.com/) · [What is GetHuman](https://www.techlicious.com/blog/gethuman-customer-service/)

**Regulatory tailwind:** the FTC's Click-to-Cancel ("Negative Option") Rule was vacated by the 8th Circuit in July 2025, but the FTC opened an ANPRM in March 2026 to revive it, and continues Section 5 "unfair/deceptive" enforcement against bad cancellation practices regardless of the rule's formal status. Subscription-cancellation friction is a live regulatory target either way. ([Jones Day](https://www.jonesday.com/en/insights/2026/05/ftc-revives-clicktocancel-rule-new-risks-for-subscription-businesses) · [Goodwin](https://www.goodwinlaw.com/en/insights/publications/2026/02/alerts-practices-ba-ftcs-click-to-cancel-rule-gets-new-life))

---

## Part 3 — Where Sula can actually win

Every incumbent above has a structural weakness Sula's existing architecture avoids by design, not by promise:

1. **No bank-account linking, ever.** Rocket Money's whole model requires Plaid-style access to your financial accounts — a huge trust and data-security ask. Sula never touches financial accounts; it only reads pages you're already viewing. This is a real, structural (not marketing) privacy advantage, consistent with the brand you already have.

2. **No success fees, no "we negotiated on your behalf" black box.** Rocket Money's 35–60% success-fee model is the single largest complaint driver (surprise charges, misrepresented savings). Sula's honest lane: **find the right human + give the user the script/leverage** — the user stays in control of the actual conversation. This also sidesteps DoNotPay's legal exposure (practicing-law claims) entirely: Sula never claims to act or negotiate *for* the user, only to inform and route them.

3. **GetHuman's hold-skipping is the one feature genuinely worth studying**, and it's the most complementary to what Sula already does (find the contact) rather than competitive with it. A real "wait on hold and ring you back" capability is a bigger lift (phone/IVR infra or VoIP), but it's the natural v2 alongside verified email/phone discovery — flagged as a bigger swing, not near-term roadmap.

4. **Draft Outreach (already a shipped Pro feature) is a direct, low-lift repositioning target.** Right now it's framed for sales outreach. Reframed as "draft my refund request" / "draft my cancellation/complaint escalation," it becomes the consumer-advocacy analog of what Rocket Money charges a 35–60% success fee for — except the user sends it themselves, for a flat Pro price, with no cut of their savings.

5. **The verification pipeline (Tiers 0–4) stays exactly as scoped** — it's equally valuable whether the contact is a sales lead or a company's refund/complaints line. What changes is targeting and copy: Pro messaging should now foreground "verified real human contact for your refund/complaint" over any B2B sales framing.

---

## Immediate implications for the roadmap

- Ship the 5-tier verification pipeline as designed (Tiers 0–2 free/unlimited, Tiers 3–4 Pro, provider-backed).
- Re-message **Draft Outreach** and **Save to CRM** away from sales language — CRM becomes "save this contact for follow-up," draft becomes complaint/refund/cancellation-request generation.
- Do not build or pursue: sales-lead enrichment, contact databases, anything resembling Apollo/ZoomInfo's core product.
- Do not claim: legal representation, "we negotiate for you," autonomous action on the user's behalf — stay in the information/routing lane DoNotPay's lawsuits show is the risk boundary.
- Flag as a future big swing, not current scope: GetHuman-style hold-time skipping / callback.
