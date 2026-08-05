# Sula → CRM templates (Zapier & Make)

Sula's **Save to CRM** (Pro) POSTs the page's contacts as JSON to a webhook URL
you save in the extension. These templates make that webhook land cleanly in a
CRM without you hand-mapping JSON.

No Sula backend is involved — the POST goes straight from the extension to the
endpoint you control. Zapier/Make sit in the middle only because they own the
connectors to 6,000+ CRMs, so Sula maintains **one** integration (this payload)
and the automation layer handles the CRM-specific part.

---

## The payload contract

Every Save-to-CRM click sends exactly this shape (from `buildWebhookPayload` in
`popup.js`):

```json
{
  "source": "Sula",
  "hostname": "example.com",
  "exportedAt": "2026-07-28T12:00:00.000Z",
  "count": 2,
  "contacts": [
    { "type": "email", "value": "info@example.com", "score": 0.92, "confidence": "High",   "hostname": "example.com", "foundAt": "" },
    { "type": "phone", "value": "(281) 816-5935",   "score": 0.70, "confidence": "Medium", "hostname": "example.com", "foundAt": "" }
  ]
}
```

Note: one POST carries an **array** of contacts. Both templates below fan that
array out to one CRM record per contact.

> **Recommended enhancement:** add a "one record per contact" toggle to Sula that
> POSTs each contact as its own request. That removes the loop/iterator step
> entirely and makes every CRM a 1:1 field map — the single biggest seamlessness
> win. Templates below cover the current batch shape.

---

## Zapier template (recipe)

Zapier end-user templates must be published from a live Zap, so here is the
5-minute build. Anyone can reproduce it exactly:

1. **Trigger — Webhooks by Zapier → Catch Hook.** Copy the custom webhook URL
   Zapier gives you.
2. **Paste that URL into Sula** (Save to CRM → paste URL) and click Send once on
   any page with contacts. Zapier's "Test trigger" now sees a real sample.
3. **Action — Looping by Zapier → Create Loop From Line Items.** Set the loop
   input to the `contacts` array. This runs the next steps once per contact.
4. **Action — your CRM's "Create/Update Contact"** (HubSpot, Pipedrive,
   Salesforce, Airtable, Google Sheets, Notion — all native Zapier apps). Map:

   | CRM field | Zapier value (inside the loop) |
   |---|---|
   | Email / Phone | `Loop → value` |
   | Type | `Loop → type` |
   | Confidence | `Loop → confidence` |
   | Source URL | `Catch Hook → hostname` |
   | Lead source | literal `Sula` |

5. Turn the Zap on. Done — one apply/scan → contacts flow into the CRM.

**Publish it as a shareable template:** once live, Zapier → *Share this Zap →
Create template* gives a one-click link you can put on trysula.com.

---

## Make template (importable blueprint)

Make supports importable scenario blueprints. See
[`sula-make-blueprint.json`](./sula-make-blueprint.json) — import it via
**Make → Create a new scenario → ⋯ → Import Blueprint**.

The blueprint wires:

1. **Custom webhook** (trigger) — Make generates the URL; paste it into Sula.
2. **Iterator** over `contacts[]` — one bundle per contact.
3. **Placeholder module** — replace with your CRM's "Create a Record" module
   (Airtable, HubSpot, Pipedrive, Google Sheets, Notion are all native Make
   apps) and map the iterator's `value` / `type` / `confidence` fields.

> Verify on import: Make blueprints are version-sensitive. If a module fails to
> load, delete the placeholder and drop in your CRM module after the Iterator —
> the webhook + iterator core is what matters.

---

## Which CRMs work directly vs. via the automation layer

| Receives Sula's webhook directly | Needs Zapier/Make in between |
|---|---|
| Make.com, Zapier Catch Hook, Airtable (automation webhook), Pipedrive, Google Sheets (Apps Script webhook), Notion (API) | HubSpot, Salesforce, Close, Copper, monday.com, Zoho |

For **Airtable** and **Google Sheets** you can also skip the automation layer
entirely with a user-pasted personal access token (backend-free) — the highest-
value "my CRM is a spreadsheet" path, worth a first-class direct integration
later.
