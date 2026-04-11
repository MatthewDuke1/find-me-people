# Privacy Policy

**Find Me People**
Last updated: April 11, 2026

## Summary

Find Me People does not collect, store, transmit, or share any user data. Everything happens locally in your browser. There are no servers, no accounts, no analytics, and no tracking of any kind.

## What Data We Access

When you visit a website, the extension reads the current page's DOM (Document Object Model) to extract:

- Email addresses visible on the page
- Phone numbers visible on the page
- Links to contact/support pages

This information is extracted from content that is already visible to you in your browser. The extension does not access any data that is not already displayed on the page you are viewing.

## What Data We Store

**None.** The extension does not write to localStorage, cookies, IndexedDB, or any other browser storage mechanism. Scan results exist only in memory for the duration of your visit to a page and are discarded when you navigate away or close the tab.

## What Data We Transmit

**None.** The extension makes zero network requests. No data is sent to any server, API, endpoint, or third party. There is no backend. There is no telemetry. There is no analytics. There is no crash reporting.

## What Data We Share

**None.** No data is shared with any third party for any purpose.

## Permissions Explained

| Permission | What It Does | Why We Need It |
|-----------|-------------|----------------|
| `activeTab` | Allows the extension to interact with the tab the user is currently viewing when they click the extension icon | Required to read the page content and extract contact information from the current tab |
| `scripting` | Allows the extension to inject the content script that scans the page | Required to run the contact-finding scanner on pages where the content script hasn't loaded automatically |
| `host_permissions` (`<all_urls>`) | Allows the content script to run on all websites | Required because customer service information can appear on any website -- the extension must scan every site to be useful |

## No Remote Code

The extension does not load, execute, or reference any remote code. All JavaScript is bundled locally within the extension package. There are no CDN imports, no external script tags, no eval() calls, no dynamic code loading, and no WebAssembly modules.

## No User Accounts

The extension does not require or support user accounts, login, registration, or authentication of any kind.

## No Cookies

The extension does not create, read, modify, or delete any cookies.

## Children's Privacy

The extension does not knowingly collect any information from anyone, including children under 13 years of age.

## Changes to This Policy

If this privacy policy changes, the updated version will be published in the extension's GitHub repository at https://github.com/MatthewDuke1/find-me-people. The "Last updated" date at the top of this document will be revised accordingly.

## Contact

If you have questions about this privacy policy, you can open an issue on the GitHub repository:
https://github.com/MatthewDuke1/find-me-people/issues

## Open Source

This extension is open source. The complete source code is available for inspection at:
https://github.com/MatthewDuke1/find-me-people

You are encouraged to review the code yourself to verify these privacy claims.
