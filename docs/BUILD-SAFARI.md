# Building Sula for Safari

Safari Web Extensions wrap the same WebExtension code (the exact files Sula
already ships) inside a native macOS/iOS app via Xcode. The web code is reused
as-is; the wrapper is what's new.

> **Requires macOS + Xcode.** The conversion tool
> (`safari-web-extension-converter`) and the build are macOS-only — they cannot
> run on Windows/Linux. Everything below is the runbook for the Mac step; the
> prep and audit are already done.

---

## 1. Compatibility audit — Sula is Safari-ready ✅

Audited against Safari Web Extension support:

| Area | Status |
|---|---|
| Manifest V3 | ✅ Safari 16.4+ |
| `chrome.*` namespace (storage, runtime, tabs, scripting, action) | ✅ all supported |
| Chrome-only APIs (offscreen / declarativeNetRequest / sidePanel) | ✅ none used |
| `background.service_worker` (+ `scripts` fallback) | ✅ Safari 16.4+ reads service_worker |
| `host_permissions: <all_urls>` | ⚠️ works, but Safari's per-site permission model prompts the user; expect a grant step |
| `chrome.runtime.setUninstallURL` | ⚠️ **not supported in Safari** — no-ops. Already wrapped in try/catch, so it degrades gracefully (no post-uninstall survey on Safari). |
| `fetch` to api.lemonsqueezy.com / cloudflare-dns (Tier-2 MX) | ✅ supported |

**No code changes are required to run.** The only functional gap is the
post-uninstall survey, which silently doesn't fire on Safari.

## 2. Convert (on a Mac)

From the repo root, after a normal build (`./build.sh` produces the file set):

```bash
xcrun safari-web-extension-converter . \
  --project-location ./safari \
  --app-name "Sula" \
  --bundle-identifier dev.matthewduke.sula \
  --swift \
  --copy-resources
```

This generates an Xcode project under `./safari/` that wraps the extension in a
macOS (and optionally iOS) container app.

## 3. Build & run

```bash
open safari/Sula/Sula.xcodeproj
```

In Xcode: select the **Sula (macOS)** scheme → Run. Then in Safari:
Settings → Extensions → enable Sula. For unsigned local testing, enable
Safari → Develop → **Allow Unsigned Extensions** (resets each Safari launch).

## 4. Distribution — and a real gotcha for the paid tier ⚠️

Two paths, and the choice matters *because* Sula now charges:

- **Developer ID notarization (recommended for macOS + your LemonSqueezy model).**
  Notarize the container app with your Apple Developer ID and distribute it
  directly (outside the Mac App Store). This is allowed on macOS and — crucially —
  **sidesteps Apple's in-app-purchase rules**, so your existing LemonSqueezy
  checkout keeps working exactly as on Chrome/Firefox.

- **Mac App Store / iOS App Store.** Broader reach, but Apple's review may treat
  the LemonSqueezy external checkout as a digital-goods purchase that should go
  through Apple IAP (Apple's cut). Rules loosened post-DMA/2025 for external
  links, but it's review-dependent and a genuine risk for the Pro upgrade flow.
  **iOS Safari extensions *must* go through the App Store**, so iOS inherits this
  constraint; macOS does not.

**Recommendation:** ship the macOS Safari extension via **Developer ID
notarization first** — it preserves the LemonSqueezy pricing flow untouched.
Treat iOS/App-Store distribution as a separate decision, since it may force an
Apple-IAP variant of the Pro purchase.

## 5. What's NOT done here

- The actual conversion/build/sign (needs macOS + Xcode + an Apple Developer
  account — $99/yr).
- An Apple-IAP fallback for the Pro tier, *if* you later choose App Store
  distribution. Not needed for the notarized-macOS path.
