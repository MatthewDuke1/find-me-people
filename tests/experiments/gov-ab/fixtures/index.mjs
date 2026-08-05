// Representative .gov page fixtures for the registry-vs-generic A/B experiment.
//
// IMPORTANT: these are HAND-CONSTRUCTED reconstructions of common .gov page
// patterns (buried phone numbers, obfuscated emails, staff directories,
// chatbot walls) — not scraped copies of real pages. They exist to exercise
// Sula's extraction logic against realistic *shapes* of government content
// without fetching or storing anything from a live .gov site.

export const FIXTURES = [
  {
    id: "federal-agency-existing-registry",
    hostname: "irs.gov",
    url: "https://www.irs.gov/help/contact-your-local-irs-office",
    // Already has a SITE_OVERRIDES entry — this fixture is the CONTROL for
    // "registry already covers this," to confirm the registry arm doesn't
    // regress on a known-good case.
    text: `Contact Your Local IRS Office
      If you can't solve your tax issue online, you can find your local IRS
      Tax Assistance Center (TAC), services offered, hours of operation and
      how to schedule an appointment. Live assistance is by appointment only.
      For general questions, use our main phone directory to find the right
      number for your situation. Interpretation services are available.`,
  },
  {
    id: "state-dmv-buried-phone",
    hostname: "dmv.example-state.gov",
    url: "https://dmv.example-state.gov/faq",
    // Common real-world pattern: the phone number is real but buried deep in
    // an FAQ answer paragraph, not near any of the usual "Contact us" anchors.
    text: `Frequently Asked Questions

      Q: How do I renew my license online?
      A: Visit our online services portal and follow the prompts. Most
      renewals are processed within 24 hours.

      Q: What if I have a question about a suspended license?
      A: Suspension and reinstatement questions are handled by our Driver
      Programs unit. If you need to speak with someone directly, their line
      is 512-555-0148 and is staffed Monday through Friday, 8am to 5pm.

      Q: Where can I find a testing location near me?
      A: Use the location finder tool above.`,
  },
  {
    id: "county-clerk-obfuscated-email",
    hostname: "clerk.example-county.gov",
    url: "https://clerk.example-county.gov/records",
    // Common anti-scraper pattern on smaller county sites: email spelled out
    // with " at " / " dot " instead of @ / . to dodge basic scrapers.
    text: `County Clerk — Public Records Division

      Request certified copies of birth, death, and marriage records by mail
      or in person. Processing takes 5-7 business days.

      For records requests, email us at recordsclerk [at] example-county [dot]
      gov or call the front desk. Walk-in hours are Tuesday and Thursday,
      9am-3pm, at the County Administration Building, 2nd floor.`,
  },
  {
    id: "city-hall-chatbot-wall",
    hostname: "www.example-city.gov",
    url: "https://www.example-city.gov/contact",
    // Common pattern flagged in content.js comments: a chatbot widget covers
    // the real contact info, and the actual phone/email sits in a footer or
    // a collapsed accordion the chat widget doesn't replace.
    text: `Contact City Hall

      Have a question? Chat with our virtual assistant using the widget in
      the corner of your screen for instant answers to common questions.

      City Hall main line: (555) 019-4420
      General inquiries: info@example-city.gov
      Hours: Monday-Friday, 8:00am - 4:30pm`,
  },
  {
    id: "school-district-staff-directory",
    hostname: "www.example-isd.gov",
    url: "https://www.example-isd.gov/staff-directory",
    // Common pattern: a large tabular staff directory where the "contact"
    // signal is per-row, not page-level — a harder extraction shape.
    text: `Staff Directory

      Superintendent's Office
      Dr. A. Ramirez, Superintendent — aramirez@example-isd.gov — ext. 1001
      J. Whitfield, Executive Assistant — jwhitfield@example-isd.gov — ext. 1002

      Human Resources
      M. Osei, HR Director — mosei@example-isd.gov — ext. 2010
      Main HR line: (555) 019-2000`,
  },
  {
    id: "state-agency-pdf-only-contact",
    hostname: "agency.example-state.gov",
    url: "https://agency.example-state.gov/about/leadership",
    // Common pattern: the only contact info on the rendered page is a link
    // to a PDF org chart / directory, which a text-based scan can see the
    // LINK to but not the phone/email that lives inside the PDF itself.
    text: `Agency Leadership

      For a full directory of division contacts, download our
      Leadership and Organization Chart (PDF).

      General public inquiries may be directed through our online contact
      form. This office does not accept inquiries by phone.`,
  },
];
