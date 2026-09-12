// Order-fact extraction for the passive ledger.
//
// The failure that matters is not "missed a purchase" — it is "recorded the
// wrong number". A ledger with gaps is usable; a ledger that confidently says
// you paid $9.99 when you paid $109.99 is worse than no ledger, because the
// user stops trusting the entries that are right.
//
// So most of what is pinned here is refusal: the subtotal that must not win,
// the tax line that must not win, the order ref that is really a year, and the
// card number that must abort the whole capture.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "ledger-extract.js");
const {
  parseAmount, extractAmount, extractOrderRef, extractMerchant,
  extractDate, looksLikePaymentData, extractOrderFacts,
} = loadModuleApi(SRC, "SulaLedgerExtract");

suite("amount parsing: formats", () => {
  test("plain", () => assertEq(parseAmount("42.99"), 42.99));
  test("thousands separator", () => assertEq(parseAmount("1,234.56"), 1234.56));
  test("european 1.234,56", () => assertEq(parseAmount("1.234,56"), 1234.56));
  test("european comma decimal", () => assertEq(parseAmount("9,99"), 9.99));
  test("currency symbol stripped", () => assertEq(parseAmount("$1,099.00"), 1099));
  test("zero is not an amount", () => assertEq(parseAmount("0.00"), null));
  test("negative is not an amount", () => assertEq(parseAmount("-5.00"), null));
  test("absurd totals refused", () => assertEq(parseAmount("99999999.00"), null));
  test("non-string refused", () => assertEq(parseAmount(null), null));
});

suite("amount: the total must beat every other line", () => {
  const page = `
    Subtotal $89.00
    Shipping $7.50
    Tax $8.01
    Order total $104.51
  `;
  test("picks the order total, not the largest-looking line", () => {
    assertEq(extractAmount(page).value, 104.51);
  });

  test("subtotal alone yields nothing", () => {
    assertEq(extractAmount("Subtotal $89.00\nShipping $7.50"), null);
  });

  test("tax alone yields nothing", () => {
    assertEq(extractAmount("Tax $8.01"), null);
  });

  test("a page with no labelled total yields nothing", () => {
    assertEq(extractAmount("Nice hoodie $60.00 — free returns"), null);
  });

  test("specific label outranks bare total", () => {
    const t = "Total $10.00 ... Order total $95.00";
    assertEq(extractAmount(t).value, 95);
  });

  test("total charged is recognised", () => {
    assertEq(extractAmount("Total charged: $31.40").value, 31.4);
  });

  test("you were charged is recognised", () => {
    assertEq(extractAmount("You were charged $12.00 today").value, 12);
  });

  test("currency detected alongside", () => {
    assertEq(extractAmount("Order total £58.20").currency, "GBP");
  });
});

suite("order reference: narrow on purpose", () => {
  test("order number", () => assertEq(extractOrderRef("Order #ORD-88213 confirmed"), "ORD-88213"));
  test("confirmation number", () => assertEq(extractOrderRef("Confirmation number: A1B2C3D4"), "A1B2C3D4"));
  test("invoice", () => assertEq(extractOrderRef("Invoice no. INV-99120"), "INV-99120"));

  test("a bare year is not an order ref", () => {
    assertEq(extractOrderRef("Order placed 2026"), null);
  });
  test("short all-digit strings refused", () => {
    assertEq(extractOrderRef("Order #4821"), null);
  });
  test("long all-digit refs accepted", () => {
    assertEq(extractOrderRef("Order #114829371"), "114829371");
  });
  test("unlabelled codes are not refs", () => {
    assertEq(extractOrderRef("SKU AB-99213 in stock"), null);
  });
});

suite("merchant: the processor must not become the merchant", () => {
  test("ordinary domain", () => {
    assertEq(extractMerchant({ topDomain: "www.acme.com" }).domain, "acme.com");
  });
  test("stripe is refused as a merchant", () => {
    const m = extractMerchant({ topDomain: "checkout.stripe.com", siteName: "Acme" });
    assertEq(m.domain, null);
    assertTrue(m.onProcessor, "should be flagged as a processor");
  });
  test("paypal is refused", () => {
    assertTrue(extractMerchant({ topDomain: "www.paypal.com" }).onProcessor, "paypal not flagged");
  });
  test("site name beats a title", () => {
    assertEq(extractMerchant({ topDomain: "a.com", siteName: "Acme", title: "Checkout | Acme" }).name, "Acme");
  });
  test("title is split at the separator", () => {
    assertEq(extractMerchant({ topDomain: "a.com", title: "Acme Store | Checkout" }).name, "Acme Store");
  });
});

suite("dates", () => {
  test("iso", () => assertTrue(extractDate("Ordered 2026-09-12") > 0, "iso not parsed"));
  test("long form", () => assertTrue(extractDate("September 12, 2026") > 0, "long form not parsed"));
  test("slashed", () => assertTrue(extractDate("9/12/2026") > 0, "slashed not parsed"));
  test("implausible years refused", () => assertEq(extractDate("1823-01-01"), null));
  test("no date yields null", () => assertEq(extractDate("thanks for your order"), null));
});

suite("payment data aborts the capture entirely", () => {
  test("a card number is detected", () => {
    assertTrue(looksLikePaymentData("4111 1111 1111 1111"), "PAN not caught");
  });
  test("hyphenated card number is detected", () => {
    assertTrue(looksLikePaymentData("4111-1111-1111-1111"), "hyphenated PAN not caught");
  });
  test("a CVV label is enough", () => {
    assertTrue(looksLikePaymentData("Enter your CVV"), "CVV label not caught");
  });
  test("an order total is not payment data", () => {
    assertTrue(!looksLikePaymentData("Order total $42.99"), "false positive on a total");
  });
  test("capture refuses rather than scrubbing", () => {
    const r = extractOrderFacts({ bodyText: "Card number 4111111111111111 Order total $10.00", topDomain: "a.com" });
    assertEq(r.refused, "payment-data-present");
    assertTrue(!r.amount, "amount must not survive a refused capture");
  });
});

suite("extractOrderFacts: whole-page behaviour", () => {
  const page = {
    url: "https://acme.com/orders/88213",
    title: "Order confirmation | Acme",
    siteName: "Acme",
    topDomain: "acme.com",
    bodyText: "Thank you for your order. Order #ORD-88213 placed 2026-09-12. Subtotal $89.00 Tax $8.01 Order total $104.51",
  };

  test("pulls every field", () => {
    const f = extractOrderFacts(page);
    assertEq(f.merchant.domain, "acme.com");
    assertEq(f.amount.value, 104.51);
    assertEq(f.orderRef, "ORD-88213");
    assertTrue(f.occurredAt > 0, "no date");
  });

  test("records provenance for every field it found", () => {
    const f = extractOrderFacts(page);
    assertTrue(f.provenance.amount.indexOf("label:") === 0, "amount provenance missing");
    assertEq(f.provenance.orderRef, "labelled-reference");
    assertEq(f.provenance.merchant, "top-level-domain");
  });

  test("full identification scores high confidence", () => {
    assertTrue(extractOrderFacts(page).confidence >= 0.9, "confidence too low for a complete record");
  });

  test("a bare page scores low and invents nothing", () => {
    const f = extractOrderFacts({ topDomain: "acme.com", bodyText: "Thanks!" });
    assertEq(f.amount, null);
    assertEq(f.orderRef, null);
    assertTrue(f.confidence <= 0.4, "confidence too high for an empty page");
  });
});
