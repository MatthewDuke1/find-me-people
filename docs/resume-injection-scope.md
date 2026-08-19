# Resume injection — scope

Status: engine built (`resume-injection.js`), no UI yet. Written August 2026.

## What is built

`window.SulaResumeInjection` — pure, tested, 20 cases:

| Function | Does |
|---|---|
| `extractKeywords(text, limit)` | ranks the posting's terms; phrases outweigh tokens |
| `coverage(keywords, resumeText)` | splits into matched / missing, returns a % score |
| `resumeBullets(resumeText)` | the user's own bullets, headers excluded |
| `bestHostBullet(term, bullets, kw)` | which bullet could truthfully host a term |
| `buildReport(jobText, resumeText)` | the whole report |
| `readJobPage()` | pulls the posting off the current page |

A run against a real Director of Product posting: **43% of terms already
supported**, matched `product roadmap / user research / sql / churn / retention`,
missing `figma / jira / amplitude / a-b testing / machine learning`.

## The line this feature must not cross

There are two products here that look similar and are not:

1. **Help someone present real experience in the language a screener scans for.**
   Legitimate, useful, and what almost every career coach does.
2. **Generate experience the person does not have.** Resume fraud. It gets
   people fired, and for regulated or cleared roles it is worse than that.

Everything in the engine is built for (1). A suggestion always names a real
bullet the user wrote and asks them to rewrite it *if it is true*. Where no
bullet fits, the output says to add the term only with genuine experience.

This is enforced by tests, not by good intentions:

- a suggestion must never assert experience on the user's behalf
- a posting term absent from the resume surfaces as a gap, never as pastable text
- an empty resume produces gaps and zero host bullets, not invented bullets

Any future UI has to preserve this. A "generate my bullets" button that emits
finished claims would turn a legitimate tool into a liability -- for the user
first, and then for Sula.

## Proposed UI (not built)

A **Resume** tab, or a section inside the existing Autofill tab since both are
job-search surfaces.

```
[ Paste your resume ]            <- stored locally, same as the autofill profile
[ Scan this job posting ]        <- readJobPage() on the tab the user is on

  Match score        43%
  Already covered    product roadmap, user research, sql, churn, retention
  Missing            figma, jira, amplitude, a/b testing, machine learning

  For each missing term:
    - the term
    - your closest bullet
    - "Rewrite so this appears, if it is true of the work you did"
    - [ copy bullet ]
```

Storage: `sula_resume_text`, local only, same handling as the autofill profile.
It never leaves the browser, and the privacy policy's autofill paragraph covers
it with a one-line addition.

Free vs Pro (decided): the match score and the covered/missing lists are free.
The per-term host bullet and rewrite guidance are Pro.

The split is deliberate about where the paywall sits. A free user runs a real
scan and sees a real result — their score, everything the posting asks for that
they already cover, and every gap. What Pro buys is the actionable half: which
of their own bullets to rewrite for each gap. Gating the scan itself would put
the wall before any proof the tool works, which reads as a nag rather than an
offer.

Autofill stays free. It is the acquisition hook; resume analysis is the thing
worth paying for.

## The "give them the new resume altogether" option

You asked me to scope full-document generation. Three ways to do it, in
increasing order of both usefulness and risk:

**A. Reordering only.** Keep every word the user wrote; reorder bullets so the
ones matching this posting rise to the top of each role. No new text at all,
so nothing can be fabricated. Genuinely useful — screeners read the first two
bullets under each job — and completely safe.

**B. Guided rewrite, user-confirmed.** For each gap, show the host bullet with
a suggested rewrite, and require the user to accept, edit, or skip it one at a
time. Sula proposes wording; the user asserts the fact. The output document is
assembled only from bullets the user approved. Safe, but a lot of UI.

**C. Generate the document.** Produce a tailored resume in one click. This is
what people will ask for, and it is the one I would not ship. To generate a
full resume you must write sentences the user has not confirmed, which means
either inventing experience or producing something they will send without
reading. It also needs a model, which means a backend, which means the resume
leaves the machine.

**Recommendation: A now, B later, and not C.** Reordering delivers most of the
practical benefit with none of the honesty problem, and it needs no backend.

## Open questions

1. Where does the resume live — paste-only, or file import (.docx/.pdf parsing
   is real work and .pdf text extraction is unreliable)?
2. Does export matter, or is copy-to-clipboard per bullet enough for v1?
3. If reordering ships, what format comes out — plain text, .docx, or a
   rendered PDF (we already write both by hand on the site's templates page)?
4. Should the match score be visible before the user pastes a resume, as a
   teaser? It cannot be computed without one.

## What this is not

Not an ATS-beating trick. The "prompt injection in white text" advice that
circulates is detectable, gets applications discarded, and is dishonest.
Sula's version is the boring legitimate one: find the words this employer
actually uses, and make sure your real matching experience is described in
those words.
