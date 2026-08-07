// Autofill DOM layer (autofill.js): scanFields traversal.
//
// Regression guard for the iCIMS failure — an application form rendered inside
// an iframe reported "Filled 0 of 0 recognized fields" because scanFields only
// queried the top document. These tests drive the traversal with a minimal fake
// DOM (no jsdom): same-origin iframes, open shadow roots, dedup, the
// skip-types/visibility filter, and the ancestor-text label fallback.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "autofill.js");

// --- Minimal fake DOM -------------------------------------------------------
// Only what scanFields/fieldMeta touch: querySelectorAll, attributes, labels,
// closest, getRootNode, shadowRoot, contentDocument, visibility probes.

class FakeEl {
  constructor(tag, attrs = {}, opts = {}) {
    this.tagName = tag.toUpperCase();
    this._attrs = { ...attrs };
    this.id = attrs.id || "";
    this.disabled = !!opts.disabled;
    this.readOnly = !!opts.readOnly;
    this.labels = opts.labels || null;
    this.shadowRoot = opts.shadowRoot || null;
    this.contentDocument = opts.contentDocument || null;
    this._closest = opts.closest || null;
    this._root = null;
    // visible by default; hidden fields emulate offsetParent === null + no rects
    this._visible = opts.visible !== false;
    this.offsetParent = this._visible ? {} : null;
    this.style = {};
  }
  getAttribute(n) { return this._attrs[n] != null ? this._attrs[n] : null; }
  getClientRects() { return this._visible ? [{}] : []; }
  closest(sel) { return this._closest ? this._closest(sel) : null; }
  getRootNode() { return this._root || null; }
  querySelectorAll() { return []; }
}

// A container that can answer querySelectorAll for the selectors scanFields uses.
class FakeRoot {
  constructor(nodes = []) {
    this.nodes = nodes; // flat list of FakeEl in this root
    nodes.forEach((n) => { n._root = this; });
  }
  querySelectorAll(sel) {
    const s = String(sel);
    if (s === "input, textarea, select") {
      return this.nodes.filter((n) => ["INPUT", "TEXTAREA", "SELECT"].includes(n.tagName));
    }
    if (s === "iframe, frame") {
      return this.nodes.filter((n) => ["IFRAME", "FRAME"].includes(n.tagName));
    }
    if (s === "*") return this.nodes;
    return [];
  }
  getElementById(id) { return this.nodes.find((n) => n.id === id) || null; }
}

function apiWithDocument(doc) {
  // Re-evaluate the module per test with a fresh fake document in scope.
  const api = loadModuleApi(SRC, "SulaAutofill");
  globalThis.document = doc;
  return api;
}

const input = (attrs, opts) => new FakeEl("input", attrs, opts);

suite("scanFields — same-origin iframe traversal (the iCIMS bug)", () => {
  test("finds a field that lives inside an iframe, not the top document", () => {
    const inner = new FakeRoot([input({ type: "email", name: "email" })]);
    const iframe = new FakeEl("iframe", {}, { contentDocument: inner });
    const doc = new FakeRoot([iframe]);
    const api = apiWithDocument(doc);
    const found = api.scanFields();
    assertEq(found.length, 1);
    assertEq(found[0].key, "email");
  });

  test("finds fields across BOTH the top document and a nested iframe", () => {
    const deep = new FakeRoot([input({ type: "text", name: "city" })]);
    const midIframe = new FakeEl("iframe", {}, { contentDocument: deep });
    const mid = new FakeRoot([midIframe, input({ type: "tel", name: "phone" })]);
    const topIframe = new FakeEl("iframe", {}, { contentDocument: mid });
    const doc = new FakeRoot([topIframe, input({ type: "email", name: "email" })]);
    const api = apiWithDocument(doc);
    const keys = api.scanFields().map((f) => f.key).sort();
    assertEq(keys, ["city", "email", "phone"]);
  });

  test("a cross-origin iframe (contentDocument throws) is skipped, not fatal", () => {
    const hostile = new FakeEl("iframe", {});
    Object.defineProperty(hostile, "contentDocument", {
      get() { throw new Error("SecurityError: cross-origin"); },
    });
    const doc = new FakeRoot([hostile, input({ type: "email", name: "email" })]);
    const api = apiWithDocument(doc);
    const found = api.scanFields();
    assertEq(found.length, 1);
    assertEq(found[0].key, "email");
  });
});

suite("scanFields — shadow DOM traversal", () => {
  test("finds a field inside an open shadow root", () => {
    const shadow = new FakeRoot([input({ type: "email", name: "email" })]);
    const hostEl = new FakeEl("div", {}, { shadowRoot: shadow });
    const doc = new FakeRoot([hostEl]);
    const api = apiWithDocument(doc);
    assertEq(api.scanFields().map((f) => f.key), ["email"]);
  });
});

suite("scanFields — filtering", () => {
  test("skips hidden, password, file, submit, checkbox and radio inputs", () => {
    const doc = new FakeRoot([
      input({ type: "hidden", name: "email" }),
      input({ type: "password", name: "email" }),
      input({ type: "file", name: "email" }),
      input({ type: "submit", name: "email" }),
      input({ type: "checkbox", name: "email" }),
      input({ type: "radio", name: "email" }),
    ]);
    const api = apiWithDocument(doc);
    assertEq(api.scanFields().length, 0);
  });

  test("skips disabled and readonly fields", () => {
    const doc = new FakeRoot([
      input({ type: "email", name: "email" }, { disabled: true }),
      input({ type: "tel", name: "phone" }, { readOnly: true }),
    ]);
    const api = apiWithDocument(doc);
    assertEq(api.scanFields().length, 0);
  });

  test("skips fields that are not visible (collapsed wizard steps)", () => {
    const doc = new FakeRoot([input({ type: "email", name: "email" }, { visible: false })]);
    const api = apiWithDocument(doc);
    assertEq(api.scanFields().length, 0);
  });

  test("does not double-count an element reachable twice", () => {
    const shared = input({ type: "email", name: "email" });
    const inner = new FakeRoot([shared]);
    const frameA = new FakeEl("iframe", {}, { contentDocument: inner });
    const frameB = new FakeEl("iframe", {}, { contentDocument: inner });
    const doc = new FakeRoot([frameA, frameB]);
    const api = apiWithDocument(doc);
    assertEq(api.scanFields().length, 1);
  });
});

suite("classifyField — ATS label shapes seen in the wild", () => {
  const api = loadModuleApi(SRC, "SulaAutofill");
  test("iCIMS-style 'Email' label maps to email", () => {
    assertEq(api.classifyField({ label: "Email" }), "email");
  });
  test("bare type=email still wins with no label at all", () => {
    assertEq(api.classifyField({ type: "email" }), "email");
  });
  test("unrelated field stays unmapped (no wrong-field fills)", () => {
    assertEq(api.classifyField({ label: "How did you hear about us?" }), null);
  });
});
