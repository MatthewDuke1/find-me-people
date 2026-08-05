# Sula PRO feature roadmap — the recurring-revenue thesis

Prepared 2026-07-31. Frames Sula's Pro tier through the lens an investor would
apply: what creates **recurring** revenue and **retention**, not one-off value.

---

## What the competitor research actually teaches

| Company | Raised / outcome | The lesson for Sula |
|---|---|---|
| **GetHuman** | Founded 2006, raised only **$3M**, ~7 employees, never acquired, still tiny 20 years on | A contact directory + hold-service is a **lifestyle business, not a venture outcome**. A directory has no lock-in and no recurring value — you use it, you leave. |
| **DoNotPay** | Raised **$27.8M**, $80M valuation — then **FTC settlement ($193K)** for "robot lawyer" overclaiming, credibility gutted | Two killers: (1) **transactional** "we did X for you" has terrible retention — cancel one subscription, then churn; (2) **overclaiming** ("we'll win your case") is regulatory death. |
| **Paribus → Capital One Shopping** | **Acquired by Capital One**; 76% claim success, $20M+ saved for users | The winning model: **passive, always-on monitoring.** Link once, it watches in the background forever, auto-surfaces value each cycle. Users keep it *because they forget it's there and it keeps paying off.* This is the retention engine. |
| **Chargeback / refund apps** | Chargeback market **$3B (2026) → $9.3B (2035), 13.5% CAGR**; one app cancelled 15,000+ subs | Refund/cancellation recovery is a **real, fast-growing market** — and 84% of consumers find a chargeback *easier* than contacting the merchant, which is precisely the friction Sula removes. |

Market context: advocacy software **$1.02B → $2.36B by 2035 (9.9% CAGR)**;
recurring-revenue businesses are valued on **ARR + retention**, and retention is
driven by *continuous* value, not one-off task completion.

Sources: [GetHuman funding (Crunchbase)](https://www.crunchbase.com/organization/gethuman) · [FTC v. DoNotPay final order](https://www.ftc.gov/news-events/news/press-releases/2025/02/ftc-finalizes-order-donotpay-prohibits-deceptive-ai-lawyer-claims-imposes-monetary-relief-requires) · [Capital One Shopping price protection](https://financebuzz.com/earn-with-paribus) · [Chargeback management market](https://market.us/report/chargeback-management-market/)

---

## The thesis in one line

**Move Sula from a *utility you open when you have a problem* (low retention,
GetHuman's ceiling) to an *always-on protection layer that passively saves you
money and time* (high retention, Paribus's engine) — while never claiming to
act FOR the user (DoNotPay's grave).**

Every Pro feature below is scored on the two axes investors actually care about:

- **Recurring value (R):** does it deliver value *every cycle* without the user
  re-engaging? (This is the retention driver.)
- **Consumer value (C):** does it solve a real, felt pain?

Scale 1–5 each. Features are ordered by R×C.

---

## Tier A — the retention engine (build these; they justify a subscription)

### A1. Subscription Guardian / Cancellation Vault  — R:5 C:5
Passively track the subscriptions and recurring bills a user signs up for
(Sula already detects when you're on a company/checkout page). Before each
renewal, surface: the renewal date, the *verified* cancellation contact, and a
one-click drafted cancellation request. **Recurring by construction** — every
renewal cycle is a new moment of value. Directly rides the FTC Click-to-Cancel
regulatory tailwind.
*This is the flagship. It is the single most VC-legible feature Sula can build.*

### A2. Refund Radar  — R:5 C:5
Paribus-for-service-failures. Passively watch for refund-eligible events tied
to companies the user has flagged (delivery delays, outages, price drops,
recalls) and surface the right contact + a drafted claim the moment one occurs.
Paribus proved the model (76% success, acquired). Sula's twist: **contact-first
and consent-first** — it never files for you, it hands you a ready claim.

### A3. Escalation Autopilot (case tracker + nudges)  — R:5 C:4
The stateful case tracker already scoped (`docs/escalation-ladder-scope.md`):
"it's been 7 days with no response — escalate to the executive contact?" then
"still nothing — file with the CFPB?". The time-based nudge is the recurring
re-engagement hook. Needs the `chrome.alarms` permission (documented cost).

---

## Tier B — monetizable depth (build after Tier A; strong C, metered R)

### B1. Real-time mailbox verification (metered)  — R:4 C:4
The Tier 3/4 pipeline (already built + stubbed). Sold as metered Pro credits —
recurring *consumption* revenue, the model every email-verification competitor
(ZeroBounce/Hunter) already runs. Sula's edge: verification composed with the
free local extraction, framed for consumer advocacy ("is this refund contact a
real inbox?") not B2B lead-gen.

### B2. Executive-contact finder  — R:3 C:5
Stage 2 of the escalation ladder: name discovery (reuse job-contacts local
orchestration) + address pattern-inference + verify (reuse the pipeline). The
EECB technique is documented as reliably effective. High felt value; more
episodic than passive.

### B3. Complaint & escalation letter studio  — R:3 C:5
Reframe the shipped Draft Outreach into consumer-advocacy letter generation:
EECB executive letters, cancellation requests, refund demands, regulatory
complaint narratives (CFPB/FTC/BBB shapes). Guardrailed per the DoNotPay lesson
— drafts the user sends, never legal claims, never "we'll win."

---

## Tier C — moat / stickiness (build opportunistically)

### C1. Personal advocacy dashboard  — R:4 C:4
One hub for every open case, refund, cancellation, and complaint — the "always
on" surface a user returns to. Turns a collection of features into a product
users organize their consumer life around (the retention flywheel).

### C2. Company Watchlist / complaint intelligence  — R:4 C:3
Track companies the user has fought; alert on recalls, outages, class actions,
data breaches affecting them. Passive, recurring, and a genuine reason to keep
the extension installed between active disputes.

### C3. Community responsiveness ratings  — R:2 C:4
Elliott.org-style "which companies actually respond, and how fast" — but
crowd-sourced from Sula's own (opt-in, anonymized) outcome data. A data moat
that compounds with users and that no new entrant can replicate cheaply.

---

## What NOT to build (research-backed)

- **A contact database** (GetHuman/ZoomInfo model) — no lock-in, unwinnable
  against incumbents, and off-strategy. Sula reads live pages; that's the moat.
- **Autonomous action / "we'll get your refund" / "robot lawyer"** — the exact
  claim that cost DoNotPay its FTC case and credibility. Inform, draft, route.
  The user always sends/files themselves.
- **Hold-skipping** — Apple (iOS 26 Hold Assist) and Google (Pixel Hold for Me)
  ship it free at the OS level, and a browser extension has no call-audio access
  to build it anyway.

---

## Guardrails that keep Sula out of DoNotPay's grave (apply to every feature)

1. Never claim to act, file, negotiate, or represent — only inform, draft, route.
2. Never promise an outcome ("this will get your refund").
3. Never assert legal entitlement without hedging.
4. Keep the free tier genuinely useful (local extraction stays free/unlimited) —
   trust is the brand, and trust is the acquisition channel.
5. Any monitoring feature (A1/A2/C2) is **opt-in, transparent about what it
   watches, and stores locally by default** — the anti-Rocket-Money posture
   (no bank linking, no success-fee black box).

---

## Suggested build order (and what ships in this session's PRs)

1. **Now (this session):** the foundation is already built and PR'd —
   verification pipeline (B1 core), job-application contacts (B2 substrate),
   escalation registry (B3/Stage-3 substrate). Plus two new Tier-B/A modules
   implemented tonight (see the session PR summary): the **complaint/escalation
   letter studio (B3)** and the **Subscription Guardian data model (A1 core)**.
2. **Next:** wire `chrome.alarms` for A3/A1 nudges (permission-gated), then A2
   Refund Radar.
3. **Later:** C1 dashboard as the retention hub once 3+ features exist to
   aggregate.
