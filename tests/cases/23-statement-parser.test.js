// Bank statement parser (statement-parser.js): parse CSV / OFX exports and
// detect recurring charges. Pure/DOM-free. The parser must handle the real,
// differing shapes of the major US banks — notably Chase's single signed
// Amount column vs Capital One's split Debit/Credit columns.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "statement-parser.js");

const { parse, detectRecurring, normalizeMerchant } =
  loadModuleApi(SRC, "SulaStatementParser");

// Chase: Details, Posting Date, Description, Amount(signed), Type, Balance
const CHASE = `Details,Posting Date,Description,Amount,Type,Balance
DEBIT,08/01/2026,SPOTIFY USA NEW YORK NY,-11.99,ACH_DEBIT,1500.00
DEBIT,07/01/2026,SPOTIFY USA NEW YORK NY,-11.99,ACH_DEBIT,1600.00
DEBIT,06/01/2026,SPOTIFY USA NEW YORK NY,-10.99,ACH_DEBIT,1700.00
DEBIT,08/05/2026,WHOLEFOODS #123 SEATTLE WA,-84.20,DEBIT,1400.00
CREDIT,08/15/2026,PAYROLL DEPOSIT,2000.00,CREDIT,3400.00`;

// Capital One: split Debit/Credit, no signed Amount column
const CAPONE = `Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
2026-08-02,2026-08-03,1234,NETFLIX.COM,Entertainment,15.49,
2026-07-02,2026-07-03,1234,NETFLIX.COM,Entertainment,15.49,
2026-06-02,2026-06-03,1234,NETFLIX.COM,Entertainment,15.49,
2026-08-10,2026-08-11,1234,PAYMENT THANK YOU,Payment,,200.00`;

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260801<TRNAMT>-9.99<NAME>ADOBE PHOTOSHOP</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260701<TRNAMT>-9.99<NAME>ADOBE PHOTOSHOP</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260601<TRNAMT>-9.99<NAME>ADOBE PHOTOSHOP</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

suite("statement parser — Chase (signed amount)", () => {
  const { transactions } = parse(CHASE, "chase.csv");
  test("parses all 5 rows", () => assertEq(transactions.length, 5));
  const rec = detectRecurring(transactions);
  test("detects Spotify", () => assertTrue(rec.some((r) => r.merchant.includes("SPOTIFY"))));
  test("Spotify is monthly", () => {
    const s = rec.find((r) => r.merchant.includes("SPOTIFY"));
    assertEq(s.cadence, "monthly");
  });
  test("flags the price change 10.99 -> 11.99", () => {
    const s = rec.find((r) => r.merchant.includes("SPOTIFY"));
    assertTrue(s.priceChanged);
  });
  test("one-off grocery is NOT recurring", () =>
    assertFalse(rec.some((r) => r.merchant.includes("WHOLEFOODS"))));
});

suite("statement parser — Capital One (split debit/credit)", () => {
  const { transactions } = parse(CAPONE, "capitalone.csv");
  test("parses all 4 rows", () => assertEq(transactions.length, 4));
  const rec = detectRecurring(transactions);
  test("detects Netflix from the Debit column", () =>
    assertTrue(rec.some((r) => r.merchant.includes("NETFLIX"))));
  test("Netflix amount is 15.49", () => {
    const n = rec.find((r) => r.merchant.includes("NETFLIX"));
    assertEq(n.amount, 15.49);
  });
  test("Netflix annualized is 185.88", () => {
    const n = rec.find((r) => r.merchant.includes("NETFLIX"));
    assertEq(n.annualized, 185.88);
  });
  test("a credit/payment is NOT counted as a charge", () =>
    assertFalse(rec.some((r) => r.merchant.includes("PAYMENT"))));
});

suite("statement parser — OFX", () => {
  const { transactions } = parse(OFX, "stmt.ofx");
  test("parses all 3 STMTTRN blocks", () => assertEq(transactions.length, 3));
  const rec = detectRecurring(transactions);
  test("detects one recurring merchant (Adobe)", () => {
    assertEq(rec.length, 1);
    assertTrue(rec[0].merchant.includes("ADOBE"));
  });
});

suite("statement parser — merchant normalization", () => {
  test("strips transaction-id / city / state noise", () =>
    assertTrue(normalizeMerchant("SPOTIFY P34F9G8 NEW YORK NY").includes("SPOTIFY")));
  test("splits on the * separator", () =>
    assertEq(normalizeMerchant("SPOTIFY*USA"), "SPOTIFY"));
});
