#!/usr/bin/env bash
# Sula — Safari Web Extension converter (macOS + Xcode ONLY).
# Wraps the same web-extension files into a native Safari container app.
# See docs/BUILD-SAFARI.md for the full runbook, compatibility audit, and the
# distribution/pricing gotcha (notarize for macOS to keep LemonSqueezy working).
#
# This is a no-op anywhere but macOS with Xcode installed.

set -euo pipefail
cd "$(dirname "$0")"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "Safari extensions can only be built on macOS. This is $(uname)." >&2
  echo "Run this on a Mac with Xcode installed. See docs/BUILD-SAFARI.md." >&2
  exit 1
fi

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "safari-web-extension-converter not found. Install Xcode (not just the CLI tools)." >&2
  exit 1
fi

echo "Converting Sula -> Safari Web Extension project under ./safari ..."
xcrun safari-web-extension-converter . \
  --project-location ./safari \
  --app-name "Sula" \
  --bundle-identifier dev.matthewduke.sula \
  --swift \
  --copy-resources \
  --force

echo ""
echo "Done. Next:"
echo "  open safari/Sula/Sula.xcodeproj"
echo "  -> select the Sula (macOS) scheme, Run."
echo "  Safari: Settings > Extensions > enable Sula."
echo "  For distribution, notarize with your Developer ID (macOS) to keep the"
echo "  LemonSqueezy checkout flow -- see docs/BUILD-SAFARI.md section 4."
