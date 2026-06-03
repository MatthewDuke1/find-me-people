# tests/

Test suite for the pure (DOM-free) helpers in `content.js`. Run with:

```
npm test
```

(or directly: `node tests/run.js`)

No npm dependencies. The runner uses Node's built-in module system and
`new Function()` to evaluate extracted helper code in isolation.

## What's covered today

The `content.js` IIFE has roughly two classes of code:

1. **Pure helpers** -- score calculators, regex matchers, dedup keys,
   obfuscation decoders, URL pattern lists. No DOM access, no
   `chrome.*` calls, no `window` references. Testable in plain Node.
2. **DOM-touching scan / render paths** -- `scanPage`, the side panel
   render functions, the background fetch helpers. Need a browser or
   a jsdom-based simulator.

This PR establishes the **pure-helper test layer**. The DOM layer is
deliberately out of scope -- a separate PR can wire up jsdom (or a
Playwright-based fixture runner) on top of the same runner and pull
HTML snapshots from `tests/fixtures/`.

### Current cases

| File | What it pins |
|---|---|
| `cases/01-phone-key.test.js`            | Canonical phone-dedup key. Same input in any format -> same key. |
| `cases/02-trim-digit-prefix-bleed.test.js` | Zip-code prefix stripping (the `77546thesanctuarygymtx@outlook.com` bug). |
| `cases/03-decode-obfuscated.test.js`    | Email obfuscation decoder (10+ variants, plus false-positive guards). |
| `cases/04-contact-page-patterns.test.js` | URL pattern matching (catches `/media-contacts`, rejects `/contactless-payment`). |
| `cases/05-proximity-anchor.test.js`     | Phone proximity guard for loose-body scans. |
| `cases/06-format-phone.test.js`         | US phone display normalization. |

~40 assertion cases total.

## How the runner works

`lib/extract.js` reads `content.js` and pulls out specific named
functions / consts using brace-counting -- not a real JS parser, but
fine for our hand-rolled style. The extracted code is wrapped in
`new Function(...)` and returned as a namespace object.

`lib/test-runner.js` is a 50-line runner: `suite()` / `test()` register
cases, `assertEq` / `assertTrue` / `assertFalse` throw on mismatch,
`runAll()` reports.

`run.js` discovers `cases/*.test.js`, imports each, then calls
`runAll()`. Files run in filename order (so `01-*` runs before `06-*`),
which makes failures easier to read.

## Why no dependencies

The extension itself has zero npm dependencies and ships as plain
files. Keeping the test layer dependency-free matches that constraint
and means anyone can clone + run tests without installing anything
beyond Node 18+.

## Adding a case

1. Identify a pure helper in `content.js`.
2. Add `tests/cases/NN-name.test.js` (use a two-digit prefix so ordering
   stays clean).
3. Import `loadPureHelpers` from `../lib/extract.js`, request the
   helper by name, write `test(...)` blocks.
4. `npm test` -- the new file is auto-discovered.

## Adding a fixture (future work)

`tests/fixtures/README.md` describes the format. Drop a `.html`
snapshot in alongside a `.expected.json` sidecar. The fixture
infrastructure is reserved for a follow-up PR that wires up
jsdom-based integration tests on top of the same runner.
