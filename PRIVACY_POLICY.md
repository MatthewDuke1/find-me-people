# Privacy Policy

**Find Me People**
Last updated: June 1, 2026 — applies to v1.5.2 and later.

## Summary

Find Me People scans pages locally to find customer service contacts. It does not create an account, does not identify you, does not send your browsing data anywhere, and does not load remote code. It makes two kinds of anonymous network request, both narrowly bounded and described in full below.

A polished web version of this same policy is at https://find-me-people.com/privacy.html.

## What the extension reads

When you visit a website, Find Me People reads the current page in your browser to extract:

- Email addresses visible on the page
- Phone numbers visible on the page
- Links to contact, support, help, and similar pages
- Business hours, when available (from `schema.org` / JSON-LD / microdata)
- Hydration state on JavaScript-rendered pages (e.g. `__NEXT_DATA__`, JSON-LD blocks) so contacts hidden in JS still surface
- The content of any **same-origin** iframes the page embeds
- The configuration of common chatbot widgets when present (Intercom, Zendesk, Drift, Crisp, HubSpot, Tidio, LiveChat, Tawk, Freshchat, Olark) — specifically the vendor's account identifier so the standard help-center URL can be reconstructed and surfaced as a link

All of this is content already loaded into your browser. The extension does not access any data that is not already visible to you on the page.

## What the extension stores

The extension uses `chrome.storage.local` for two things, kept entirely on your device:

- **Preferences.** Whether the side panel is enabled, which mail client you prefer for Compose, which sites you have hidden the panel on, where you have dragged the side panel tab vertically.
- **Copy history.** When you click to copy an email or phone, a record of what you copied (value, hostname, score, timestamp) is added so the History tab can show it later. Capped at 50 entries; older ones are dropped.

You can clear the entire history at any time from the History tab. Nothing is written to cookies, IndexedDB, or any other browser storage.

## What the extension transmits

The extension makes **two kinds of network request**, both anonymous and tightly bounded.

### 1. Same-origin contact-page fallback

When the in-page scan finds zero contacts, the extension fires up to three same-origin GET requests to common contact-page URLs on the site you are already visiting — `/contact`, `/contact-us`, `/about`, `/about-us`, `/support`, `/help`, `/customer-service` — and parses the responses for emails and phones. Constraints:

- `credentials: 'omit'`. No cookies are attached. The server cannot identify you from the request.
- Same-origin only. If a URL redirects to a different domain, the response is discarded.
- Once per origin per browsing session. A flag in `sessionStorage` prevents the same site from being re-probed.
- Bounded size. Responses larger than 1 MB are discarded without parsing.
- Stops at the first hit. As soon as one of the candidate URLs returns useful results, the rest are skipped.

### 2. Zendesk help-center search (when a Zendesk chatbot is detected)

When the page carries a Zendesk Web Widget or is itself a Zendesk help center, the extension makes one anonymous query to that vendor's public help-center search API at `https://{subdomain}.zendesk.com/api/v2/help_center/articles/search.json?query=contact` to find the real support contact the chatbot was trained to surface. This is the same public endpoint anyone with a browser can hit. Constraints:

- `credentials: 'omit'`. No cookies. Zendesk sees an unauthenticated visitor — identical to clicking "search" in their help center yourself.
- Public endpoint only. No private data, no auth tokens, no account information.
- Once per Zendesk subdomain per browsing session. Same `sessionStorage` gate.
- Up to 10 article results returned, body capped at 1 MB before parsing.
- Only fires when a Zendesk chatbot is actually detected on the page. No detection → no request.

That is the complete list of network requests the extension makes. No telemetry, no analytics, no error reporting, no usage statistics, no third-party services beyond the single public-API query above. The extension does not contact any server we operate, because we do not operate any server.

## What the extension shares

**None.** No data is shared with any third party, for any purpose, ever. The extension has no business model, no advertisers, and no analytics partners.

## Permissions Explained

| Permission | What It Does | Why We Need It |
|---|---|---|
| `activeTab` | Lets the extension interact with the tab the user is currently viewing when they click the extension icon. | Required to read page content from the active tab. |
| `scripting` | Lets the extension inject the contact scanner if the content script did not auto-load. | Required to recover after browser restarts and on pages that loaded before the extension was enabled. |
| `storage` | Lets the extension write to `chrome.storage.local`. | Required for the two preference items and copy history described above. |
| `host_permissions: <all_urls>` | Lets the scanner run on any website. | Required because customer service info can appear on any domain. |

## No Remote Code

The extension does not load, execute, or reference any remote JavaScript. There are no CDN imports, no external `<script>` tags, no `eval()` calls, no dynamic code loading, and no WebAssembly modules. Every line of code that runs in the extension is bundled in the package you install — reviewable line-by-line in the open-source repository linked below.

## No User Accounts

The extension does not require or support user accounts, login, or registration of any kind.

## No Cookies

The extension does not create, read, modify, or delete any cookies.

## Children's Privacy

The extension does not knowingly collect any information from anyone, including children under 13.

## Changes to This Policy

If this policy changes, the updated version will be published in the extension's GitHub repository at https://github.com/MatthewDuke1/find-me-people. The "Last updated" date at the top of this document will be revised accordingly. The same policy is also published at https://find-me-people.com/privacy.html.

## Contact

If you have questions about this privacy policy, open an issue on the GitHub repository: https://github.com/MatthewDuke1/find-me-people/issues

## Open Source

This extension is open source. The complete source code is at https://github.com/MatthewDuke1/find-me-people. You are encouraged to review the code yourself to verify these privacy claims.
