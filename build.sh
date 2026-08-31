#!/usr/bin/env bash
# Build script for Sula
# Produces store-ready zips for Chrome Web Store and Firefox AMO.
# The manifest is unified (service_worker + browser_specific_settings.gecko),
# so both archives have identical contents -- the separate names just keep
# the upload workflow explicit per store.

set -euo pipefail

cd "$(dirname "$0")"

OUT_DIR="dist"
FILES=(
  manifest.json
  background.js
  content.js
  popup.html
  popup.js
  onboarding.js
  upgrade-cta.js
  whats-new.js
  license.js
  gpc-inject.js
  gpc-rules.json
  job-contacts.js
  email-verify.js
  escalation-registry.js
  advocacy-letters.js
  subscription-guardian.js
  refund-deadline-engine.js
  refund-templates.js
  chargeback-guide.js
  advocacy-ui.js
  autofill.js
  autofill-ui.js
  autofill-page-button.js
  resume-injection.js
  resume-ui.js
  statement-parser.js
  subscriptions-ui.js
  privacy-guard-ui.js
  refund-policy-extractor.js
  refund-moment-detector.js
  icons
  PRIVACY_POLICY.md
  README.md
)

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

zip -rq "$OUT_DIR/sula-chrome.zip"  "${FILES[@]}"
zip -rq "$OUT_DIR/sula-firefox.zip" "${FILES[@]}"

# Guard: fail the build if either zip is missing a file its manifest
# references. This is what stops a package that Chrome loads broken (or AMO
# rejects) from ever being produced. set -e aborts on a non-zero exit.
PY="${PYTHON:-python3}"
"$PY" scripts/check_manifest_files.py "$OUT_DIR/sula-chrome.zip"
"$PY" scripts/check_manifest_files.py "$OUT_DIR/sula-firefox.zip"

echo "Built:"
echo "  $OUT_DIR/sula-chrome.zip   -> https://chrome.google.com/webstore/devconsole"
echo "  $OUT_DIR/sula-firefox.zip  -> https://addons.mozilla.org/developers"
