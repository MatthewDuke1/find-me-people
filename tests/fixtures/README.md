# Test fixtures

HTML snapshots of real pages that exercise specific scan paths, plus an
"expected" sidecar describing what `scanPage()` should surface from each.

Used by future jsdom-based integration tests. Not yet exercised by the
current pure-helper test runner; the snapshots live here so a future PR
can wire them up without re-collecting source material.

## Naming

`<short-site-id>.html` -- the page snapshot, trimmed to essentials.
`<short-site-id>.expected.json` -- expected scan output:

```json
{
  "emails":  [{ "value": "...", "min_score": 80, "source_prefix": "footer" }],
  "phones":  [{ "value": "(281) 816-5935", "min_score": 70 }],
  "links":   [{ "url_contains": "/media-contacts" }],
  "must_not_surface": [
    { "type": "email",   "value": "noreply@vendor.com" },
    { "type": "phone",   "value": "555-867-5309",          "reason": "Tommy Tutone, false-positive in body text" }
  ]
}
```

`min_score` / `source_prefix` / `url_contains` / `must_not_surface` are
the assertion shapes the future integration runner will support. They
intentionally accept ranges and partial matches rather than exact
fixtures, because we update scoring constants regularly and don't want
every constant tweak to break the suite.

## What's seeded

Empty for now -- this PR lands the test-runner foundation. Fixture
HTML files will be added in follow-up PRs as we encounter regressions
worth pinning. The `tests/cases/` directory has 6 pure-helper test
files covering ~40 assertion cases; that's the floor.
