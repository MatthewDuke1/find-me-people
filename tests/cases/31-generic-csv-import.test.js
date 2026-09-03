// QA SULA-011 / SULA-012 regression: subscription import and the shared store.
//
// SULA-012: "a valid CSV with Date, Description and Amount columns" was
// rejected as "not a bank CSV/OFX export". The column matchers already
// accepted those names, so the failure was earlier: the tokenizer was
// comma-only and did not strip a UTF-8 BOM. Excel and many bank exports
// prepend a BOM, and "﻿Date" does not match /^date$/ — so the header row
// was never found and the whole file was thrown out.
//
// SULA-011: the manual tracker (Advocacy) writes `company`; the statement
// import writes `name`. Same storage key, two shapes, so each view rendered
// the other's records blank. subName() reads through both.
import { loadModuleApi, loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PARSER = path.join(__dirname, "..", "..", "statement-parser.js");
const SUBS_UI = path.join(__dirname, "..", "..", "subscriptions-ui.js");

const { parse } = loadModuleApi(PARSER, "SulaStatementParser");
const { subName, subSource } = loadPureHelpers(["subName", "subSource"], SUBS_UI);

const GENERIC = `Date,Description,Amount
2026-08-01,NETFLIX.COM,-15.49
2026-07-01,NETFLIX.COM,-15.49
2026-06-01,NETFLIX.COM,-15.49
2026-08-04,CORNER STORE,-12.30`;

suite("SULA-012 — the generic CSV QA was given", () => {
  test("Date/Description/Amount is accepted", () => {
    const r = parse(GENERIC, "export.csv");
    assertEq(r.error, null, `expected no error, got ${r.error}`);
    assertEq(r.transactions.length, 4);
  });

  test("amounts and descriptions survive", () => {
    const t = parse(GENERIC, "export.csv").transactions[0];
    assertEq(t.desc, "NETFLIX.COM");
    assertEq(t.amount, -15.49);
  });
});

suite("SULA-012 — a UTF-8 BOM no longer rejects the file", () => {
  test("BOM-prefixed CSV (Excel's default) parses", () => {
    const r = parse("﻿" + GENERIC, "export.csv");
    assertEq(r.error, null, "a BOM must not make the header unrecognisable");
    assertEq(r.transactions.length, 4);
  });
});

suite("SULA-012 — other real-world delimiters", () => {
  test("semicolon-separated (European exports)", () => {
    const r = parse(GENERIC.replace(/,/g, ";"), "export.csv");
    assertEq(r.error, null);
    assertEq(r.transactions.length, 4);
  });

  test("tab-separated", () => {
    const r = parse(GENERIC.replace(/,/g, "\t"), "export.csv");
    assertEq(r.error, null);
    assertEq(r.transactions.length, 4);
  });

  test("BOM + semicolon together", () => {
    const r = parse("﻿" + GENERIC.replace(/,/g, ";"), "export.csv");
    assertEq(r.error, null);
    assertEq(r.transactions.length, 4);
  });
});

suite("SULA-012 — existing bank shapes still parse (no regression)", () => {
  test("Chase-style signed Amount column", () => {
    const chase = `Details,Posting Date,Description,Amount,Type,Balance
DEBIT,08/01/2026,SPOTIFY USA,-11.99,ACH_DEBIT,1500.00
DEBIT,07/01/2026,SPOTIFY USA,-11.99,ACH_DEBIT,1600.00`;
    const r = parse(chase, "chase.csv");
    assertEq(r.error, null);
    assertEq(r.transactions.length, 2);
  });

  test("Capital One split Debit/Credit", () => {
    const capone = `Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
2026-08-02,2026-08-03,1234,NETFLIX.COM,Entertainment,15.49,
2026-08-10,2026-08-11,1234,PAYMENT,Payment,,200.00`;
    const r = parse(capone, "capone.csv");
    assertEq(r.error, null);
    assertEq(r.transactions.length, 2);
    assertEq(r.transactions[0].amount, -15.49, "a debit must be negative");
  });

  test("genuinely unrecognisable text is still rejected", () => {
    const r = parse("this is not a statement at all\njust prose", "notes.txt");
    assertTrue(r.error !== null, "garbage must still be refused");
  });
});

suite("SULA-011 — one renewal store, read through both shapes", () => {
  test("a manually tracked record (company) resolves", () => {
    assertEq(subName({ company: "QA Streaming" }), "QA Streaming");
  });
  test("an imported record (name) resolves", () => {
    assertEq(subName({ name: "NETFLIX.COM" }), "NETFLIX.COM");
  });
  test("a record carrying both resolves", () => {
    assertEq(subName({ company: "Netflix", name: "NETFLIX.COM" }), "Netflix");
  });
  test("an empty record is safe", () => {
    assertEq(subName({}), "");
    assertEq(subName(null), "");
  });
  test("source is labelled so the two origins are distinguishable", () => {
    assertEq(subSource({ source: "statement-import" }), "imported");
    assertEq(subSource({}), "added manually");
  });
});
