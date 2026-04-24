#!/usr/bin/env bash
# Build script for Find Me People
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
  icons
  PRIVACY_POLICY.md
  README.md
)

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

zip -rq "$OUT_DIR/find-me-people-chrome.zip"  "${FILES[@]}"
zip -rq "$OUT_DIR/find-me-people-firefox.zip" "${FILES[@]}"

echo "Built:"
echo "  $OUT_DIR/find-me-people-chrome.zip   -> https://chrome.google.com/webstore/devconsole"
echo "  $OUT_DIR/find-me-people-firefox.zip  -> https://addons.mozilla.org/developers"
