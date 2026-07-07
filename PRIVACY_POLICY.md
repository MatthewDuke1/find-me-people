# Privacy Policy

**Sula** (formerly published as "Find Me People")
Last updated: July 3, 2026 — applies to v2.0.0 and later.

## Summary

Sula scans pages locally to find contact information. There is no account, nothing identifies you, your browsing data never leaves your machine, and no remote code is loaded. The extension makes two kinds of anonymous network request, both narrow and described in full below.

The same policy lives on the web at https://trysula.com/privacy.html.

## What the extension reads

When you visit a website, Sula reads the current page in your browser to extract:

- Email addresses visible on the page
- Phone numbers visible on the page
- Links to contact, support, help, and similar pages
- Business hours, when available (from `schema.org` / JSON-LD / microdata)
- Hydration state on JavaScript-rendered pages (e.g. `__NEXT_DATA__`, JSON-LD blocks) so contacts hidden in JS still surface
- The content of any **same-origin** iframes the page embeds
- The configuration of common chatbot widgets when present (Intercom, Zendesk, Drift, Crisp, HubSpot, Tidio, LiveChat, Tawk, Freshchat, Olark) — specifically the vendor's account identifier, so the standard help-center URL can be reconstructed and shown as a link

All of this is content already loaded into your browser. The extension cannot see anything you can't.

## What the extension stores

Sula uses `chrome.storage.local` for two things, kept entirely on your device:

- **Preferences.** Whether the side panel is on, your preferred mail client for Compose, sites where you've hidden the panel, and where you've dragged the panel tab.
- **Copy history.** When you copy an email or phone, a record (value, hostname, score, timestamp) is saved so the History tab can show it later. Capped at 50 entries; older ones drop off.

You can clear the whole history from the History tab at any time. Nothing is written to cookies, IndexedDB, or any other browser storage.

## What the extension transmits

Two kinds of network request, both anonymous and tightly bounded.

### 1. Same-origin contact-page fallback

If the in-page scan finds zero contacts, the extension fires up to three same-origin GET requests to common contact-page URLs on the site you're already visiting — `/contact`, `/contact-us`, `/about`, `/about-us`, `/support`, `/help`, `/customer-service` — and parses the responses for emails and phones. Constraints:

- `credentials: 'omit'`. No cookies attached; the server can't identify you from the request.
- Same-origin only. A redirect to a different domain gets discarded.
- Once per origin per browsing session (a `sessionStorage` flag prevents re-probing).
- Responses over 1 MB are discarded without parsing.
- Stops at the first hit.

### 2. Zendesk help-center search (only when a Zendesk chatbot is detected)

If the page carries a Zendesk Web Widget or is itself a Zendesk help center, the extension makes one anonymous query to that vendor's public help-center search API (`https://{subdomain}.zendesk.com/api/v2/help_center/articles/search.json?query=contact`) to find the support contact the chatbot was trained on. Anyone with a browser can hit this same public endpoint. Constraints:

- `credentials: 'omit'`. Zendesk sees an unauthenticated visitor, same as if you searched their help center yourself.
- Public endpoint only. No private data, no auth tokens.
- Once per Zendesk subdomain per browsing session.
- Up to 10 article results, body capped at 1 MB.
- No Zendesk detection on the page → no request.

That is the complete list. No telemetry, no analytics, no error reporting, no usage statistics. The extension never contacts a server we operate, because we don't operate one.

## What the extension shares

Nothing. No data goes to any third party, for any purpose, ever.

## Permissions

| Permission | What it does | Why it's needed |
|---|---|---|
| `activeTab` | Interact with the tab you're viewing when you click the icon. | To read page content from the active tab. |
| `scripting` | Inject the scanner if the content script didn't auto-load. | To recover after browser restarts and on pages that loaded before the extension was enabled. |
| `storage` | Write to `chrome.storage.local`. | For the preferences and copy history described above. |
| `host_permissions: <all_urls>` | Run the scanner on any website. | Contact info can appear on any domain. |

## No remote code

No remote JavaScript is loaded, executed, or referenced. No CDN imports, no external `<script>` tags, no `eval()`, no dynamic code loading, no WebAssembly. Every line that runs is in the package you install, reviewable in the open-source repository below.

## No accounts, no cookies

There is no login or registration of any kind, and the extension does not create, read, modify, or delete cookies.

## Children's privacy

The extension does not knowingly collect information from anyone, including children under 13.

## Changes to this policy

If this policy changes, the updated version is published in the GitHub repository and the "Last updated" date above is revised. The web copy at https://trysula.com/privacy.html is updated at the same time.

## Contact

Questions? Open an issue: https://github.com/MatthewDuke1/find-me-people/issues

## Open source

The complete source code is at https://github.com/MatthewDuke1/find-me-people. You're encouraged to read it and verify these claims yourself.
