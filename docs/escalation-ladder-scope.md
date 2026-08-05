# Escalation-ladder feature — scope

Three stages, matching the documented consumer-advocacy pattern (EECB,
Elliott.org, CFPB/FTC/BBB filing data — see `docs/consumer-advocacy-strategy.md`):

1. **Frontline** — already shipped (core Sula extraction)
2. **Executive escalation** — new
3. **Regulatory** — new

The key architectural shift: every Sula feature to date is **point-in-time**
(scan this page, verify this email, once). Escalation is inherently
**stateful over time** — "I contacted frontline support 6 days ago, got
nothing, now what?" That's a new primitive, not just new UI.

---

## Stage 2 — Executive escalation contact

### The decision that matters: don't build a database

Elliott.org's model is a hand-curated directory of exec contacts per company.
**Do not copy that model.** It's the same trap flagged in the earlier SWOT:
building/maintaining a per-company contact database is exactly the kind of
data-eng-team-scale undertaking a solo-maintained extension shouldn't try to
out-build against incumbents (or in this case, out-maintain against a site
that's been doing it for 15+ years).

### Recommended approach: local discovery + pattern inference + verify

Reuse two things that already exist rather than build a third:

1. **Named-executive discovery — reuse `job-contacts.js`'s local-orchestration
   lane.** It already opens a company's `/about` page and LinkedIn people
   search; that same mechanism surfaces named leadership (CEO, Head of
   Customer Experience, etc.) instead of frontline recruiters. Zero new
   infrastructure — same pages, same extraction, different target role.

2. **Address inference + verify — reuse `email-verify.js`'s Tier 2/3
   pipeline.** Once Sula has a name (from step 1) and a domain:
   - If Sula has already seen **any named-person email at that domain**
     (not a role account — `classifyEmailRole() === "personal"`), infer the
     naming pattern from it (`firstname.lastname@`, `flast@`, etc.) and
     construct the same pattern for the target executive.
   - If no named-person email has been seen yet, generate the standard
     candidate set (`first.last@`, `firstlast@`, `flast@`, `first@`,
     `first_last@`) for the target name.
   - Run each candidate through the **already-built** Tier 2 (MX, free) then
     Tier 3 (mailbox check, Pro) pipeline. The first candidate that verifies
     is the answer.

**Honest naming of what this is:** guess-the-pattern-then-verify is exactly
the core technique Hunter/Apollo-style tools use for lead generation. Using
it here is fine — it's a well-known, legitimate technique — **as long as
it stays scoped to one explicit, user-triggered lookup for one named
executive during an active escalation**, never a batch/bulk run across many
names. That boundary is what keeps this a consumer-advocacy feature instead
of sliding back into the B2B lead-gen territory already ruled out.

**No new backend capability required** — this is pure reuse/orchestration of
Tiers 2–4 already scoped and stubbed.

---

## Stage 3 — Regulatory routing

Much more tractable than Stage 2: this needs a small, **hand-curated,
category-level** registry, not a per-company one — the same scale and
maintenance model as the existing `SITE_OVERRIDES` registry in `content.js`
(~20-30 entries, dated, hand-maintained).

| Complaint category | Venue | Notes |
|---|---|---|
| Banking, credit, loans, debt collection | CFPB | 97% response rate; specific complaint-narrative format |
| Scams, deceptive practices, general fraud | FTC (ReportFraud.ftc.gov) | |
| Telecom, robocalls, carrier billing | FCC | |
| Airlines, travel | DOT (aviation consumer complaints) | |
| Insurance | State insurance commissioner | Varies by state |
| General business / retail | BBB | ~75% resolution rate |
| Anything else / unsure | State Attorney General consumer-protection office | Catch-all |

**Category selection: human-confirmed, not auto-decided.** Sula can suggest a
likely category from the company/domain type, but the user picks/edits
before anything is drafted. Misrouting a complaint (telling someone to file
with the wrong agency) wastes their time and would be a real trust failure —
this is a "keep a human in the loop" design choice, consistent with the
DoNotPay lesson: inform and route, never autonomously decide or act.

Draft Outreach (already shipped, Pro) generates the actual complaint text in
each agency's expected narrative shape — this is a copy/prompt change, not
new engineering.

---

## The new primitive: a persistent "case," not a point-in-time popup

Every Stage needs to know: has the user heard back? How long has it been?
What's already been tried? This requires:

- **A stored escalation record** (`chrome.storage.local`, capped list — same
  architectural pattern as `job-contacts.js`'s application tracker, new key
  e.g. `sula_escalations`): `{ company, domain, category, stage, contactsUsed[],
  lastActionDate, status }`.
- **Time-based nudges** ("it's been 7 days, no response — escalate to
  executive contact?"). MV3 service workers can't reliably `setTimeout` across
  restarts — the correct mechanism is `chrome.alarms`, which persists and
  fires even if the service worker was torn down.
- **Real cost to flag:** `alarms` is a **new manifest permission** Sula
  doesn't have today. Existing users get a permission-upgrade prompt on
  update. Worth doing, but it's not free — say so plainly rather than bury it.

---

## The user-facing flow

1. User is on a company's contact/support page (or already has a tracked
   frontline contact from earlier). Sula shows the frontline contact —
   free, as today.
2. User marks "no response" (manually, or Sula nudges via the alarm after
   N days). **This is the moment Sula becomes a case-tracker, not a
   one-shot tool.**
3. **Escalate (Pro):** Sula runs Stage 2 — surfaces the named executive
   contact via discovery + pattern-verify, Draft Outreach generates an
   EECB-style letter referencing the unresolved frontline attempt. User
   sends it themselves.
4. Still no response after another interval → **File a complaint (Pro):**
   Sula suggests a regulatory category, user confirms/edits, Draft Outreach
   generates the complaint narrative, direct link to the agency's filing
   page. User files it themselves.

## Pro gating

| Stage | Gate |
|---|---|
| Frontline contact-finding | Free (today) |
| Time-based "you should escalate" nudge | **Pro** — the recurring-engagement hook |
| Executive contact discovery + verify | **Pro** |
| Regulatory routing + drafted complaint | **Pro** |

## Guardrails (extends the DoNotPay lesson to this specific feature)

- Never claim to file, negotiate, or represent the user — inform, draft, and
  route; the user sends everything themselves.
- Draft Outreach copy for escalation/regulatory letters must avoid
  legal-sounding assertions ("you are legally entitled to...") without
  appropriate hedging — this is a content-guideline addition, not a code change.
- Never promise an outcome ("this will get your refund").

## What's genuinely new vs. reused

| Piece | Status |
|---|---|
| Named-executive discovery | **Reused** — `job-contacts.js` local-orchestration lane |
| Address inference + verification | **Reused** — `email-verify.js` Tiers 2–4, already built |
| Regulatory category→agency registry | **New** — small static data, same shape as `SITE_OVERRIDES` |
| Case tracker (storage + alarms) | **New** — the one real new architectural piece |
| Escalation/complaint draft copy | **New prompts** on the existing Draft Outreach feature |

Net: most of the hard infrastructure (contact discovery, verification) is
already built. The actual new work is the category registry (small), the
case-tracker + alarm plumbing (the real new piece), and new Draft Outreach
prompts — not a new subsystem from scratch.
