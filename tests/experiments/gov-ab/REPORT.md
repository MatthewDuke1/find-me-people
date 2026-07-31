# Sula gov-site extraction A/B — results

Run at: 2026-07-31T04:46:21.923Z

Arm A = generic pattern-only extraction. Arm B = registry-assisted (SITE_OVERRIDES lookup + generic fallback). Score = total unique phones + emails surfaced.

| Fixture | Hostname | Registry hit? | Arm A score | Arm B score | Delta |
|---|---|---|---|---|---|
| federal-agency-existing-registry | irs.gov | ✅ | 0 | 1 | +1 |
| state-dmv-buried-phone | dmv.example-state.gov | — | 1 | 1 | 0 |
| county-clerk-obfuscated-email | clerk.example-county.gov | — | 1 | 1 | 0 |
| city-hall-chatbot-wall | www.example-city.gov | — | 2 | 2 | 0 |
| school-district-staff-directory | www.example-isd.gov | — | 3 | 3 | 0 |
| state-agency-pdf-only-contact | agency.example-state.gov | — | 0 | 0 | 0 |

## Per-fixture detail

### federal-agency-existing-registry (irs.gov)
- Registry: hit — "IRS"
- Arm A (generic) found: phones=[], emails=[]
- Arm B (registry) found: phones=["+1-800-829-1040"], emails=[]

### state-dmv-buried-phone (dmv.example-state.gov)
- Registry: no entry
- Arm A (generic) found: phones=["512-555-0148"], emails=[]
- Arm B (registry) found: phones=["512-555-0148"], emails=[]

### county-clerk-obfuscated-email (clerk.example-county.gov)
- Registry: no entry
- Arm A (generic) found: phones=[], emails=["recordsclerk@example-county.gov"]
- Arm B (registry) found: phones=[], emails=["recordsclerk@example-county.gov"]

### city-hall-chatbot-wall (www.example-city.gov)
- Registry: no entry
- Arm A (generic) found: phones=["(555) 019-4420"], emails=["info@example-city.gov"]
- Arm B (registry) found: phones=["(555) 019-4420"], emails=["info@example-city.gov"]

### school-district-staff-directory (www.example-isd.gov)
- Registry: no entry
- Arm A (generic) found: phones=[], emails=["aramirez@example-isd.gov","jwhitfield@example-isd.gov","mosei@example-isd.gov"]
- Arm B (registry) found: phones=[], emails=["aramirez@example-isd.gov","jwhitfield@example-isd.gov","mosei@example-isd.gov"]

### state-agency-pdf-only-contact (agency.example-state.gov)
- Registry: no entry
- Arm A (generic) found: phones=[], emails=[]
- Arm B (registry) found: phones=[], emails=[]

## Aggregate

- Fixtures tested: 6
- Fixtures with an existing registry entry: 1/6
- Fixtures where the GENERIC arm found nothing at all: 1/6
- Total score, Arm A (generic): 7
- Total score, Arm B (registry-assisted): 8
- Net lift from registry assistance: +1 contact(s) across the fixture set

## Reading the result

The generic scanner already does reasonably well on fixtures where the phone/email sits near an obvious contact-context anchor word (city hall, school district). It does WORSE, independent of any registry, on: obfuscated-only contact (county clerk), phone buried in unrelated FAQ prose with no proximity anchor (DMV), and contact info that only exists inside a linked PDF (state agency leadership page) — that last case is a structural gap no registry entry can fix without OCR/PDF parsing.

## Recommendation

1. Expand `SITE_OVERRIDES` for the .gov archetypes that scored 0 on the generic arm — these are exactly the cases a hand-curated registry entry is FOR. Do this per-domain as real gaps are found in the field, not speculatively for the whole .gov namespace.
2. The FAQ-buried-phone case suggests loosening (or adding a .gov-specific) proximity-anchor list — e.g. treating a paragraph that ANSWERS a Q/A pair as anchor context even without a literal 'contact'/'call us' keyword.
3. The PDF-only case is out of scope for a registry fix — it needs a separate capability (follow-and-parse linked PDF orgcharts), which is a different feature, not an extension of this experiment.

## Limitations (read before acting on this)

- Fixtures are hand-constructed representative text, not live-scraped pages — they test the REGEX/LOGIC layer honestly, but not real-world HTML structure, JS-rendered content, or actual current .gov copy.
- This experiment does not exercise scanPage()'s full DOM pipeline (selectors, shadow roots, iframes, JSON-LD) — only the pure text/pattern helpers, per the existing pure-helper test boundary.
- A follow-up jsdom/Playwright-based fixture runner (using real saved HTML snapshots from a handful of real, permission-cleared .gov pages) would be the natural next step to validate these findings against real markup before committing engineering time to option 1 or 2 above.
