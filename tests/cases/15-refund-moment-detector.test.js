// Refund-moment detector (refund-moment-detector.js): the pure page classifier
// (the DOM/location wrapper is browser-only). Deterministic — inputs passed in.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "refund-moment-detector.js");
const { classifyPage } = loadModuleApi(SRC, "SulaRefundMoment");

suite("classifyPage - order pages", () => {
  test("order URL fires 'order'", () => {
    assertEq(classifyPage({ url: "https://shop.com/order-confirmation/123" }).moment, "order");
  });
  test("order-confirmation text fires 'order'", () => {
    const r = classifyPage({ url: "https://shop.com/x", bodyText: "Thank you for your order! Order number 123, order total $40." });
    assertEq(r.moment, "order");
    assertTrue(r.confidence > 0);
  });
});

suite("classifyPage - subscription pages", () => {
  test("billing URL fires 'subscription'", () => {
    assertEq(classifyPage({ url: "https://app.com/account/billing" }).moment, "subscription");
  });
  test("next-billing-date text fires 'subscription'", () => {
    const r = classifyPage({ url: "https://app.com/x", bodyText: "Your next billing date is Sep 1. Manage your subscription here." });
    assertEq(r.moment, "subscription");
  });
});

suite("classifyPage - negatives & thresholds", () => {
  test("random page is 'none'", () => {
    assertEq(classifyPage({ url: "https://news.com/article", bodyText: "Some news story about returns to normalcy." }).moment, "none");
  });
  test("single weak signal alone does not fire", () => {
    // "membership" is weight 1; needs >=2 to fire
    assertEq(classifyPage({ url: "https://x.com", bodyText: "our membership community" }).moment, "none");
  });
  test("empty input is 'none', never throws", () => {
    assertEq(classifyPage().moment, "none");
    assertEq(classifyPage({}).moment, "none");
  });
  test("strong URL + text stack confidence", () => {
    const r = classifyPage({
      url: "https://shop.com/orders/123",
      bodyText: "Order confirmation. Thank you for your order.",
    });
    assertEq(r.moment, "order");
    assertTrue(r.confidence >= 0.75);
  });
});
