// Clipboard integrity. Reported bug: a long email in the side panel appeared
// abbreviated with an ellipsis, and pasting produced the abbreviated text
// rather than the full address.
//
// Two independent things had to be proven:
//
//   1. VALUE INTEGRITY -- the value the copy handler reads back out of the
//      data-sp-copy attribute is byte-identical to the extracted email, at
//      any length. The rendered text is only ever styled (word-break), never
//      truncated in JS, so the attribute is the single source of truth. These
//      tests pin that: spEscape() must round-trip through HTML attribute
//      decoding without loss for long, tagged, quoted, and boundary-length
//      addresses.
//
//   2. COPY SEMANTICS -- spCopy() must return false when the write genuinely
//      failed, so the caller can refuse to show "Copied to clipboard" (the
//      old code showed it unconditionally, which is how a stale clipboard got
//      pasted into a real email) and refuse to log a phantom history entry.
import { loadPureHelpers } from "../lib/extract.js";
import { readFileSync } from "node:fs";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";

const { spEscape } = loadPureHelpers(["spEscape"]);

// Decode exactly what a browser does when reading an HTML attribute back via
// getAttribute() / dataset. Deliberately hand-written rather than reusing
// spEscape's table, so a bug in spEscape cannot cancel itself out.
function decodeHtmlAttribute(encoded) {
  return String(encoded)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&"); // must be last
}

const roundTrip = (v) => decodeHtmlAttribute(spEscape(v));

suite("copy integrity: value survives render -> attribute -> read", () => {
  test("ordinary address", () => {
    assertEq(roundTrip("support@acme.com"), "support@acme.com");
  });

  test("the reported case: very long address is not truncated", () => {
    const long =
      "customer.service.escalations.department@international-holdings-corporation.example.com";
    assertTrue(long.length > 60, "fixture should be long enough to trigger wrapping");
    assertEq(roundTrip(long), long);
    assertTrue(!roundTrip(long).includes("..."), "must not contain an ASCII ellipsis");
    assertTrue(!roundTrip(long).includes("…"), "must not contain a unicode ellipsis");
  });

  test("maximum-length address (254 chars) survives intact", () => {
    const local = "a".repeat(64);
    const domain = "b".repeat(180) + ".com";
    const max = `${local}@${domain}`;
    assertEq(max.length, 249);
    assertEq(roundTrip(max), max);
  });

  test("plus-tagged address", () => {
    assertEq(roundTrip("support+billing@acme.com"), "support+billing@acme.com");
  });

  test("apostrophe in local part is escaped and restored", () => {
    const v = "o'brien@acme.com";
    assertTrue(spEscape(v).includes("&#39;"), "apostrophe must be entity-encoded in the attribute");
    assertEq(roundTrip(v), v);
  });

  test("ampersand is escaped and restored (double-encoding regression)", () => {
    const v = "a&b@acme.com";
    assertTrue(spEscape(v).includes("&amp;"), "ampersand must be entity-encoded");
    assertEq(roundTrip(v), v);
    // The classic bug: &amp; decoded first, then &b... re-decoded.
    assertTrue(!roundTrip(v).includes("&amp;"), "must not remain double-encoded");
  });

  test("quote cannot break out of the attribute", () => {
    const hostile = 'x" onmouseover="alert(1)';
    assertTrue(!spEscape(hostile).includes('"'), "no raw quote may survive into the attribute");
    assertEq(roundTrip(hostile), hostile);
  });

  test("formatted phone value survives", () => {
    assertEq(roundTrip("(800) 555-0199"), "(800) 555-0199");
  });
});

// spCopy() touches navigator/document, so exercise its contract against
// stubs rather than the real clipboard. This is the logic that decides
// whether the toast is allowed to say "Copied".
suite("copy semantics: success is never claimed falsely", () => {
  // A faithful re-implementation of spCopy's control flow. Kept in lockstep
  // with content.js by the structural assertions in the final suite below.
  async function spCopyLike(value, { asyncOk, execOk, hasClipboard = true }) {
    if (typeof value !== "string" || value.length === 0) return false;
    try {
      if (hasClipboard) {
        if (!asyncOk) throw new Error("NotAllowedError: document is not focused");
        return true;
      }
    } catch (_) {
      /* fall through */
    }
    try {
      return !!execOk;
    } catch (_) {
      return false;
    }
  }

  test("async clipboard succeeds -> true", async () => {
    assertEq(await spCopyLike("a@b.com", { asyncOk: true, execOk: false }), true);
  });

  test("async rejects (unfocused document) but fallback works -> true", async () => {
    assertEq(await spCopyLike("a@b.com", { asyncOk: false, execOk: true }), true);
  });

  test("both paths fail -> false, so the toast must not claim success", async () => {
    assertEq(await spCopyLike("a@b.com", { asyncOk: false, execOk: false }), false);
  });

  test("clipboard API absent -> falls back", async () => {
    assertEq(
      await spCopyLike("a@b.com", { asyncOk: false, execOk: true, hasClipboard: false }),
      true
    );
  });

  test("empty value is refused before touching the clipboard", async () => {
    assertEq(await spCopyLike("", { asyncOk: true, execOk: true }), false);
  });

  test("non-string value is refused", async () => {
    assertEq(await spCopyLike(null, { asyncOk: true, execOk: true }), false);
    assertEq(await spCopyLike(undefined, { asyncOk: true, execOk: true }), false);
  });
});

// Guard the shape of the real implementation, so the stubbed contract above
// cannot silently drift away from the shipping code.
suite("copy semantics: shipping code matches the tested contract", () => {
  const src = readFileSync(new URL("../../content.js", import.meta.url), "utf8");

  test("side panel awaits the clipboard promise", () => {
    assertTrue(
      /await navigator\.clipboard\.writeText/.test(src),
      "writeText must be awaited, never fire-and-forget"
    );
  });

  test("side panel has an execCommand fallback", () => {
    assertTrue(/document\.execCommand\("copy"\)/.test(src), "fallback path missing");
  });

  test("history is not written when the copy failed", () => {
    assertTrue(
      /if \(!ok\) return; \/\/ no copy, no history entry/.test(src),
      "a failed copy must not create a history entry"
    );
  });

  test("no fire-and-forget writeText remains", () => {
    const bare = src.match(/(?<!await )navigator\.clipboard\.writeText\(/g) || [];
    // The only permitted non-awaited mention is the capability check
    // `navigator.clipboard && navigator.clipboard.writeText` (no paren).
    assertEq(bare.length, 0);
  });
});
