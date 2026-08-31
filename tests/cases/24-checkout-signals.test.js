// Checkout signals (checkout-signals.js): decide if a page is a *pre-purchase*
// checkout, scan for auto-renewal, and surface return-policy catches. Pure /
// DOM-free. The critical property: checkout must NOT fire on an order-
// confirmation (post-purchase) page — that belongs to refund-moment-detector.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "checkout-signals.js");

const { classifyCheckout, scanAutoRenew, scanFlags, CHECKOUT_THRESHOLD } =
  loadModuleApi(SRC, "SulaCheckoutSignals");

const page = (url, title, bodyText) => ({ url, title: title || "", bodyText: bodyText || "" });

suite("checkout classification — real checkout pages fire", () => {
  test("Shopify-style /checkout URL + order-summary text", () => {
    const r = classifyCheckout(page(
      "https://shop.example.com/checkout",
      "Checkout",
      "Order summary. Payment method. Billing address. Place your order."
    ));
    assertTrue(r.isCheckout, "should classify as checkout");
    assertTrue(r.score >= CHECKOUT_THRESHOLD, "score meets threshold");
    assertFalse(r.vetoed, "not vetoed");
  });

  test("Amazon-style /gp/buy/... payment page via text alone", () => {
    const r = classifyCheckout(page(
      "https://www.example.com/gp/buy/spc/handlers/display.html",
      "Place Your Order",
      "Review your order. By placing your order, you agree to the terms. Order total: $42.00"
    ));
    assertTrue(r.isCheckout, "text signals carry it even without a checkout URL");
  });

  test("payment page with card fields", () => {
    const r = classifyCheckout(page(
      "https://store.example.com/payment",
      "Payment",
      "Card number. Complete your purchase. You will be charged $19.99 today."
    ));
    assertTrue(r.isCheckout);
  });

  test("free-trial signup checkout still classifies", () => {
    const r = classifyCheckout(page(
      "https://app.example.com/checkout",
      "Start your trial",
      "Proceed to payment. Free trial, then $12/mo. Billing address required."
    ));
    assertTrue(r.isCheckout);
  });
});

suite("checkout classification — post-purchase pages are VETOED", () => {
  test("order-confirmation URL does not fire even with checkout-ish text", () => {
    const r = classifyCheckout(page(
      "https://shop.example.com/order-confirmation",
      "Thank you",
      "Thank you for your order. Order summary. Payment method ending 4242."
    ));
    assertFalse(r.isCheckout, "confirmation page must not be a checkout");
    assertTrue(r.vetoed, "veto flag set");
  });

  test("'thank you for your purchase' text vetoes", () => {
    const r = classifyCheckout(page(
      "https://shop.example.com/receipt",
      "Receipt",
      "Thank you for your purchase! Your order number is 100294. Order total $88."
    ));
    assertFalse(r.isCheckout);
    assertTrue(r.vetoed);
  });

  test("'your order has been placed' vetoes", () => {
    const r = classifyCheckout(page(
      "https://shop.example.com/checkout/success",
      "Order placed",
      "Your order has been placed. Payment method saved. Order total."
    ));
    assertFalse(r.isCheckout);
  });

  test("order number pattern vetoes a lookalike", () => {
    const r = classifyCheckout(page(
      "https://shop.example.com/account/order/55831",
      "Order #55831",
      "Order confirmation. Order total: $12."
    ));
    assertFalse(r.isCheckout);
  });
});

suite("checkout classification — non-checkout pages do not fire", () => {
  test("a product page is not checkout", () => {
    const r = classifyCheckout(page(
      "https://shop.example.com/products/blue-shirt",
      "Blue Shirt",
      "A comfortable blue shirt. Add to cart. Free shipping over $50. Reviews."
    ));
    assertFalse(r.isCheckout);
  });

  test("a blog/article page is not checkout", () => {
    const r = classifyCheckout(page(
      "https://blog.example.com/how-to-return-items",
      "How to return items",
      "This guide explains our return policy and payment method options in general."
    ));
    // "return policy" / "payment method" are weak single hits — below threshold.
    assertFalse(r.isCheckout);
  });

  test("a bare cart page (weak) does not fire on its own", () => {
    const r = classifyCheckout(page(
      "https://shop.example.com/cart",
      "Cart",
      "Your cart. Continue shopping."
    ));
    // /cart is weight 1; nothing else — below the threshold of 2.
    assertFalse(r.isCheckout, "cart alone is pre-checkout, shouldn't trigger the guard");
  });

  test("cart page WITH checkout text does fire", () => {
    const r = classifyCheckout(page(
      "https://shop.example.com/cart",
      "Cart",
      "Your cart. Order total $30. Proceed to checkout."
    ));
    assertTrue(r.isCheckout, "cart + a strong text signal crosses the threshold");
  });
});

suite("checkout classification — edge cases", () => {
  test("empty input does not throw or fire", () => {
    const r = classifyCheckout({});
    assertFalse(r.isCheckout);
    assertEq(r.score, 0);
  });

  test("null-ish fields are tolerated", () => {
    const r = classifyCheckout({ url: null, title: undefined, bodyText: null });
    assertFalse(r.isCheckout);
  });

  test("case-insensitive matching", () => {
    const r = classifyCheckout(page(
      "https://shop.example.com/CHECKOUT",
      "CHECKOUT",
      "PLACE YOUR ORDER. ORDER TOTAL: $10."
    ));
    assertTrue(r.isCheckout);
  });
});

suite("auto-renew scan", () => {
  const cases_pos = [
    "This subscription will auto-renew every month.",
    "Free trial, then $9.99/mo.",
    "Renews automatically until you cancel.",
    "Recurring billing of $20 annually.",
    "Cancel anytime. Your plan renews yearly.",
    "After your trial, you'll be charged.",
  ];
  for (const txt of cases_pos) {
    test(`detects: "${txt.slice(0, 32)}..."`, () => {
      const r = scanAutoRenew(txt);
      assertTrue(r.autoRenew, "should flag auto-renew");
      assertTrue(r.phrase.length > 0, "returns a phrase snippet");
    });
  }

  const cases_neg = [
    "One-time purchase. No subscription.",
    "This blue shirt costs $30.",
    "Free shipping on all orders.",
    "",
  ];
  for (const txt of cases_neg) {
    test(`does NOT flag: "${txt.slice(0, 32)}"`, () => {
      assertFalse(scanAutoRenew(txt).autoRenew);
    });
  }
});

suite("return-policy flag scan", () => {
  test("restocking fee flagged", () => {
    assertTrue(scanFlags("A 15% restocking fee applies to returns.").includes("Restocking fee"));
  });
  test("final sale flagged", () => {
    assertTrue(scanFlags("All clearance items are final sale.").includes("Final sale — no returns"));
  });
  test("non-refundable flagged", () => {
    const flags = scanFlags("This deposit is non-refundable.");
    assertTrue(flags.includes("Non-refundable"));
  });
  test("clean policy yields no flags", () => {
    assertEq(scanFlags("30-day free returns, no questions asked.").length, 0);
  });
  test("multiple flags de-duplicated and collected", () => {
    const flags = scanFlags("Final sale. A restocking fee may apply. Store credit only.");
    assertTrue(flags.length >= 2, "collects several distinct flags");
  });
  test("empty text is safe", () => {
    assertEq(scanFlags("").length, 0);
  });
});
