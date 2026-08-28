// Sula — Bank statement parser (Pro). Pure logic, no DOM, no storage, no I/O.
//
// The anti-Rocket-Money way to find your subscriptions: the user exports their
// OWN statement from their OWN bank (CSV / OFX / QFX) and hands the file to
// Sula, which parses it ENTIRELY in the browser and never sends it anywhere.
// Sula never touches the bank — no Plaid, no aggregation, no credentials — so
// none of the GLBA / data-aggregator regulatory burden attaches. It's the same
// legal posture as the user opening the file themselves.
//
// This file is the pure parser + recurring-charge detector, mirroring
// subscription-guardian.js's pure-model design: deterministic, unit-testable,
// takes `now` explicitly. The UI layer reads the file and feeds text in here.
//
// Handles the real shapes of the major US banks, which differ:
//   - Chase:       Details, Posting Date, Description, Amount(signed), ...
//   - Capital One: Transaction Date, Posted Date, Card No., Description,
//                  Category, Debit, Credit   (SPLIT debit/credit, no signed col)
//   - Wells Fargo / Amex / others: assorted header names, signed or split.
// So columns are detected by header semantics, not fixed positions.
//
// window.SulaStatementParser — parseCsv, parseOfx, parse, detectRecurring.

(() => {
  "use strict";

  // ---- CSV: tokenizer that respects quoted fields (commas, quotes inside) ----
  function parseCsvRows(text) {
    const rows = [];
    let row = [], field = "", i = 0, inQuotes = false;
    const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    while (i < s.length) {
      const c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((f) => f.trim() !== ""));
  }

  // Header-name matchers for the columns we care about. Order = priority.
  const COL = {
    date: [/^trans(action)?\s*date$/i, /^posting\s*date$/i, /^posted\s*date$/i, /^date$/i],
    desc: [/^description$/i, /^details$/i, /^memo$/i, /^name$/i, /^payee$/i, /^merchant$/i],
    amount: [/^amount$/i, /^amt$/i],
    debit: [/^debit$/i, /^withdrawal(s)?$/i, /^charges?$/i],
    credit: [/^credit$/i, /^deposit(s)?$/i, /^payments?$/i],
  };

  function matchCol(header, matchers) {
    for (let p = 0; p < matchers.length; p++) {
      for (let c = 0; c < header.length; c++) {
        if (matchers[p].test(String(header[c]).trim())) return c;
      }
    }
    return -1;
  }

  function toNumber(raw) {
    if (raw == null) return NaN;
    let s = String(raw).trim();
    if (s === "") return NaN;
    const neg = /^\(.*\)$/.test(s); // (12.34) = negative
    s = s.replace(/[()$,\s]/g, "");
    const n = parseFloat(s);
    if (!isFinite(n)) return NaN;
    return neg ? -n : n;
  }

  function toDateMs(raw) {
    if (!raw) return NaN;
    const s = String(raw).trim();
    // ISO first
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    // US M/D/Y or M-D-Y (2- or 4-digit year)
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      let y = +m[3]; if (y < 100) y += 2000;
      return Date.UTC(y, +m[1] - 1, +m[2]);
    }
    const t = Date.parse(s);
    return isNaN(t) ? NaN : t;
  }

  // Parse a CSV bank export into normalized transactions:
  //   { dateMs, desc, amount }  (amount negative = money out / a charge)
  function parseCsv(text) {
    const rows = parseCsvRows(text);
    if (rows.length < 2) return { transactions: [], error: "no_rows" };

    // Find the header row: the first row where we can locate a date + desc.
    let headerIdx = -1, header = null;
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const h = rows[r];
      if (matchCol(h, COL.date) !== -1 && matchCol(h, COL.desc) !== -1) {
        headerIdx = r; header = h; break;
      }
    }
    if (headerIdx === -1) return { transactions: [], error: "no_header" };

    const di = matchCol(header, COL.date);
    const desci = matchCol(header, COL.desc);
    const ai = matchCol(header, COL.amount);
    const debiti = matchCol(header, COL.debit);
    const crediti = matchCol(header, COL.credit);

    const txns = [];
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const dateMs = toDateMs(row[di]);
      const desc = String(row[desci] || "").trim();
      if (isNaN(dateMs) || !desc) continue;

      let amount = NaN;
      if (ai !== -1 && String(row[ai] || "").trim() !== "") {
        amount = toNumber(row[ai]);
      } else if (debiti !== -1 || crediti !== -1) {
        // Split debit/credit (Capital One shape). Debit = money out (negative).
        const deb = debiti !== -1 ? toNumber(row[debiti]) : NaN;
        const cred = crediti !== -1 ? toNumber(row[crediti]) : NaN;
        if (isFinite(deb) && deb !== 0) amount = -Math.abs(deb);
        else if (isFinite(cred) && cred !== 0) amount = Math.abs(cred);
      }
      if (!isFinite(amount)) continue;
      txns.push({ dateMs, desc, amount });
    }
    return { transactions: txns, error: txns.length ? null : "no_transactions" };
  }

  // ---- OFX / QFX (SGML-ish; same <STMTTRN> blocks) ----
  function parseOfx(text) {
    const txns = [];
    const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ||
                   text.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>)/gi) || [];
    const tag = (block, name) => {
      const m = block.match(new RegExp("<" + name + ">([^<\\n\\r]*)", "i"));
      return m ? m[1].trim() : "";
    };
    for (const b of blocks) {
      const dtRaw = tag(b, "DTPOSTED");
      const amtRaw = tag(b, "TRNAMT");
      const name = tag(b, "NAME") || tag(b, "MEMO");
      // OFX date: YYYYMMDD[hhmmss]
      let dateMs = NaN;
      const dm = dtRaw.match(/^(\d{4})(\d{2})(\d{2})/);
      if (dm) dateMs = Date.UTC(+dm[1], +dm[2] - 1, +dm[3]);
      const amount = toNumber(amtRaw);
      if (isNaN(dateMs) || !isFinite(amount) || !name) continue;
      txns.push({ dateMs, desc: name, amount });
    }
    return { transactions: txns, error: txns.length ? null : "no_transactions" };
  }

  // Route by content sniff.
  function parse(text, filenameHint) {
    const t = String(text || "");
    const looksOfx = /<OFX>|<STMTTRN>|OFXHEADER/i.test(t);
    const isOfxName = /\.(ofx|qfx)$/i.test(filenameHint || "");
    if (looksOfx || isOfxName) return parseOfx(t);
    return parseCsv(t);
  }

  // ---- Merchant normalization: collapse the noise banks add ----
  // "SPOTIFY P34F9G8 NEW YORK NY" / "SPOTIFY*USA" -> "SPOTIFY"
  function normalizeMerchant(desc) {
    let s = String(desc).toUpperCase();
    s = s.replace(/\b(RECURRING|PAYMENT|PURCHASE|POS|DEBIT|ACH|AUTOPAY|WEB)\b/g, " ");
    s = s.split(/[*#]/)[0];                 // "SPOTIFY*USA" -> "SPOTIFY"
    s = s.replace(/\b[A-Z]{2}\b\s*$/,"");   // trailing state code
    s = s.replace(/\b\d[\dA-Z-]{3,}\b/g, " "); // transaction ids
    s = s.replace(/\b(NEW YORK|SAN FRANCISCO|SEATTLE|LOS ANGELES)\b/g, " ");
    s = s.replace(/[^A-Z0-9 &.-]/g, " ").replace(/\s+/g, " ").trim();
    // keep first 3 significant words
    return s.split(" ").slice(0, 3).join(" ").trim() || String(desc).trim();
  }

  const DAY = 24 * 60 * 60 * 1000;

  // Given normalized transactions, find recurring charges. A merchant is
  // recurring if it has >= 2 similar-amount charges (money out) spaced at a
  // roughly regular cadence.
  function detectRecurring(transactions, nowMs) {
    const now = nowMs || Date.now();
    // charges only (money out)
    const charges = transactions.filter((t) => t.amount < 0);
    const byMerchant = new Map();
    for (const t of charges) {
      const key = normalizeMerchant(t.desc);
      if (!byMerchant.has(key)) byMerchant.set(key, []);
      byMerchant.get(key).push({ dateMs: t.dateMs, amount: Math.abs(t.amount), desc: t.desc });
    }

    const results = [];
    for (const [merchant, list] of byMerchant) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.dateMs - b.dateMs);

      // gaps between consecutive charges
      const gaps = [];
      for (let i = 1; i < list.length; i++) gaps.push((list[i].dateMs - list[i - 1].dateMs) / DAY);
      const medGap = median(gaps);
      const cadence = classifyCadence(medGap);
      if (!cadence) continue; // gaps too irregular / not a recognizable cycle

      const amounts = list.map((x) => x.amount);
      const typical = median(amounts);
      const lastDateMs = list[list.length - 1].dateMs;
      const priceChanged = Math.max(...amounts) - Math.min(...amounts) > 0.5;

      results.push({
        merchant,
        cadence,                       // "weekly" | "monthly" | "quarterly" | "annual"
        amount: round2(typical),
        count: list.length,
        lastChargeMs: lastDateMs,
        annualized: round2(typical * cadenceMultiplier(cadence)),
        priceChanged,
        sampleDesc: list[list.length - 1].desc,
      });
    }
    // biggest annual cost first
    results.sort((a, b) => b.annualized - a.annualized);
    return results;
  }

  function classifyCadence(days) {
    if (days >= 5 && days <= 9) return "weekly";
    if (days >= 24 && days <= 38) return "monthly";
    if (days >= 80 && days <= 100) return "quarterly";
    if (days >= 330 && days <= 400) return "annual";
    return null;
  }
  function cadenceMultiplier(c) {
    return c === "weekly" ? 52 : c === "monthly" ? 12 : c === "quarterly" ? 4 : 1;
  }
  function median(arr) {
    if (!arr.length) return 0;
    const a = [...arr].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  window.SulaStatementParser = {
    parse, parseCsv, parseOfx, detectRecurring, normalizeMerchant,
    _internals: { classifyCadence, median, toNumber, toDateMs },
  };
})();
