# Pro licensing (LemonSqueezy)

Find Me People monetizes via **LemonSqueezy** (Merchant of Record — it runs
checkout and handles global sales tax/VAT). Pro is unlocked by a LemonSqueezy
**license key**; the extension validates it directly against LemonSqueezy's
license API (no backend, no API secret shipped).

## Pieces
| File | Role |
|---|---|
| `license.js` | The engine: `isPro()`, `activateLicense()`, `validate`, `deactivate`, `openUpgrade()`. Loaded in `popup.html` before `popup.js`. |
| `popup.js` | `gateExport()` wraps the CSV/vCard export actions; `renderProFooter()` draws the upgrade/activate UI. |
| `popup.html` | Loads `license.js`; `#pro-footer` slot for the UI. |

`host_permissions` is already `<all_urls>`, so the fetch to
`api.lemonsqueezy.com` needs **no manifest change**.

## Soft launch (current state)
`license.js` ships with **`PRO_ENFORCED = false`**. While false:
- `isPro()` returns `true` for everyone → export stays free, nothing is locked.
- The Pro footer is hidden.

So the rails are in place and **nothing is user-visible yet**. Flip the flag
when the store is live.

## Go live — one-time setup
1. **Create the store + product(s)** at lemonsqueezy.com:
   - Pricing (chosen to steer buyers toward Lifetime):
     - **Monthly $6/mo** (base)
     - **Annual $57.60/yr** — 20% off the $72 annualized base (round to ~$58 if you prefer a clean number)
     - **Lifetime $80** (one-time; pays for itself vs annual in ~1.4 yrs — the intended nudge)
   - On each variant, enable **"Generate license keys"** (set an activation
     limit, e.g. 3 devices).
2. **Grab the checkout URLs** for each variant and paste them into
   `CHECKOUT` in `license.js`. Point `DEFAULT_CHECKOUT` at the one the
   "Upgrade" button should open.
3. **Flip the switch:** set `PRO_ENFORCED = true` in `license.js`.
4. Rebuild + publish (`./build.ps1` → upload `dist/find-me-people-chrome.zip`).

That's it — no server. After this:
- Export is **Pro-gated**: free users get an "Export is a Pro feature" nudge +
  the checkout opens.
- The popup footer shows **Upgrade** + an **Activate license** field. A buyer
  pastes the key LemonSqueezy emailed them → `activateLicense()` →
  `isPro()` flips true → export unlocks.
- `isPro()` re-validates against LemonSqueezy at most daily (so a cancelled/
  refunded subscription eventually revokes), trusts the cache offline, and
  never locks out a paying user on a network blip.

## License API used (no API key needed)
```
POST https://api.lemonsqueezy.com/v1/licenses/activate    (license_key, instance_name)
POST https://api.lemonsqueezy.com/v1/licenses/validate    (license_key, instance_id)
POST https://api.lemonsqueezy.com/v1/licenses/deactivate  (license_key, instance_id)
```
These authenticate with the license key itself — your LemonSqueezy **API
secret is never shipped** in the extension.

## Don't forget
- `license.js` must stay in the build file list (`build.sh` / `build.ps1`) or
  it won't be in the store zip.
- Currently the only Pro-gated feature is **CSV/vCard export**. To gate more,
  wrap the action with `if (!(await gateExport())) return;` (or a similar
  `isPro()` check).
