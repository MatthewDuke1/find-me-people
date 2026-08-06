# Privacy Policy

**Sula** (formerly published as "Find Me People")
Last updated: August 6, 2026 — applies to v2.1.0 and later.

## Summary

Sula reads the page you're on to help you reach a real person and get your money back: it finds contact information, drafts refund and complaint letters, tracks subscriptions, and fills application and contact forms from a profile you save.

The core work happens locally in your browser. Nothing you browse, save, or draft is sent to a server we run, because we don't run one. The extension makes a small, fixed set of network requests, all listed in full below. Two outside services are involved, and only for narrow jobs: **LemonSqueezy** handles Pro purchases and license checks, and **Cloudflare's public DNS resolver** answers the optional email MX lookup. If you never buy Pro and never run an email check, neither is ever contacted.

The same policy lives on the web at https://trysula.com/privacy.html.

## What the extension reads

When you visit a website, Sula reads the current page in your browser to extract:

- Email addresses and phone numbers visible on the page
- Links to contact, support, and help pages
- Business hours from `schema.org` / JSON-LD / microdata, when present
- Hydration data on JavaScript-rendered pages (e.g. `__NEXT_DATA__`, JSON-LD) so contacts hidden in JS still surface
- The content of any **same-origin** iframes the page embeds
- Common chatbot widget configuration (Intercom, Zendesk, Drift, Crisp, HubSpot, Tidio, LiveChat, Tawk, Freshchat, Olark) — the vendor's account identifier, so the standard help-center URL can be rebuilt and shown as a link
- On order, receipt, and subscription pages: the merchant's stated refund/return policy text and the fields Sula uses to recognize a refund moment
- On application and contact forms: the form fields present, so it can match them to your saved autofill profile

All of this is content already loaded into your browser. The extension cannot see anything you can't.

## What the extension stores

Sula uses `chrome.storage.local`, kept entirely on your device. Nothing here is written to cookies, IndexedDB, or any server.

| Key | What it holds |
|---|---|
| Preferences | Side-panel state, preferred mail client, hidden sites, panel position |
| Copy history | Emails/phones you copied (value, hostname, score, timestamp). Capped at 50; older entries drop off. |
| Autofill profile | The details you enter on the Autofill tab — name, email, phone, address, links, current role. See the dedicated section below. |
| Subscriptions | Subscriptions you add to the Subscription Guardian (name, cadence, renewal date) |
| Applications | Jobs you've tracked with the apply-click contact finder |
| Email-verify cache | Results of email checks you've run, so the same address isn't re-checked |
| License + supporter flags | Your Pro license status and early-supporter grandfathering flag |
| Opt-in flags | Whether you've turned on optional features like the email MX check |

You can clear copy history from the History tab, and remove autofill, subscription, and application data from their respective tabs, at any time.

## What the extension transmits

Every network request Sula can make is listed here. Each is narrow, and most only fire when you take an action.

### 1. Same-origin contact-page fallback

If an in-page scan finds zero contacts, Sula fires up to three same-origin GET requests to common contact-page URLs on the site you're already visiting (`/contact`, `/about`, `/support`, `/help`, and similar) and parses them for emails and phones. `credentials: 'omit'` (no cookies), same-origin only, once per origin per session, responses over 1 MB discarded, stops at the first hit.

### 2. Zendesk help-center search (only when a Zendesk chatbot is detected)

If the page carries a Zendesk widget or is a Zendesk help center, Sula makes one anonymous query to that vendor's **public** help-center search API to find the support contact the bot was trained on. `credentials: 'omit'`, public endpoint only, once per subdomain per session, results capped at 1 MB. No Zendesk on the page means no request.

### 3. Email MX lookup — Cloudflare public DNS (optional, opt-in)

When you run an email check and have opted into MX verification, Sula makes **one** DNS-over-HTTPS request to Cloudflare's public resolver (`cloudflare-dns.com/dns-query`) to see whether the address's domain can receive mail. What leaves your browser is the **domain only** (e.g. `example.com`), never the full email address, and never who or what you were looking at. This is the same public resolver any browser can query. It runs only for checks you start, and only while the opt-in is on. The other email-quality checks (syntax, disposable domains, role accounts) run entirely locally with no request.

### 4. Pro license activation and validation — LemonSqueezy

If you buy Pro, Sula unlocks by a **license key** you paste in. Activating and periodically re-validating that key sends the key (and a randomly generated instance identifier) to LemonSqueezy's license API (`api.lemonsqueezy.com/v1/licenses`). The key authenticates the request; there is no separate account, login, or password. This request happens only for Pro users. If you stay on the free tier, it never fires.

### 5. Opening checkout — LemonSqueezy

Clicking Upgrade opens a LemonSqueezy checkout page in a new tab. From that point the purchase happens on LemonSqueezy's site under their privacy policy, not inside the extension.

That is the complete list. No telemetry, no analytics, no error reporting, no usage statistics, and no server we operate.

## Autofill data

The Autofill tab lets you save personal details (name, email, phone, address, LinkedIn, and similar) once and fill forms with them in a click. This data:

- Is stored **only** in `chrome.storage.local` on your device.
- Is **never** transmitted to us or to any third party. It goes only into the fields of the page you are actively on, and only when you click **Fill this page**.
- Is shown to you as highlighted fields so you can review it. Sula **never auto-submits** a form — you always hit send yourself.
- Can be edited or cleared from the Autofill tab at any time.

## Payments

Pro purchases are handled entirely by **LemonSqueezy**, which acts as Merchant of Record. Sula never sees, receives, or stores your card number, billing address, or payment details — those go to LemonSqueezy directly. Their handling of that data is governed by the LemonSqueezy privacy policy (https://www.lemonsqueezy.com/privacy).

## What the extension shares

We run no server and collect nothing about you. The only outside services that ever receive data are the two named above, each for one narrow job: Cloudflare's public DNS resolver receives an email domain when you run an opt-in MX check, and LemonSqueezy receives your license key when you activate or validate Pro (and your payment details when you check out, directly on their site). Nothing is sold, and no data goes anywhere for advertising, profiling, or analytics.

## Permissions

| Permission | What it does | Why it's needed |
|---|---|---|
| `activeTab` | Interact with the tab you're viewing when you click the icon. | To read page content from the active tab. |
| `scripting` | Inject the scanner if the content script didn't auto-load. | To recover after browser restarts and on pages loaded before the extension was enabled. |
| `storage` | Write to `chrome.storage.local`. | For the preferences, history, autofill, subscription, and license data described above. |
| `host_permissions: <all_urls>` | Run on any website. | Contacts, refund moments, and forms can appear on any domain, so Sula must be able to read the page wherever you are. It reads only the page you're on and transmits only the requests listed above. |

## No remote code

No remote JavaScript is loaded, executed, or referenced. No CDN imports, no external `<script>` tags, no `eval()`, no dynamic code loading, no WebAssembly. Every line that runs ships in the package you install and is reviewable in the open-source repository below.

## Accounts and cookies

The free tier needs no account of any kind. Pro is unlocked by a license key you paste in — not a login, username, or password. The extension does not create, read, modify, or delete cookies.

## Children's privacy

The extension does not knowingly collect information from anyone, including children under 13.

## Changes to this policy

If this policy changes, the updated version is published in the GitHub repository and the "Last updated" date above is revised. The web copy at https://trysula.com/privacy.html is updated at the same time.

## Contact

Questions? Open an issue: https://github.com/MatthewDuke1/find-me-people/issues

## Open source

The complete source code is at https://github.com/MatthewDuke1/find-me-people. You're encouraged to read it and verify these claims yourself.
