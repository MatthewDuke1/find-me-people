// QA SULA-009 / SULA-010 regression: never assert a fact the user did not give.
//
// SULA-009 was the most serious defect in the run. The UI called
//   assessReadiness({ contactedMerchant: true, merchantIgnoredDays: 7 })
// and built a regulatory complaint containing the sentence
//   "I contacted the company and it was not resolved."
// without ever asking. Both outputs therefore told a bank and a complaint
// body that a contact attempt had happened. A user could submit a false
// statement of fact under their own name.
//
// The rule these tests enforce: prior contact is asserted only when the user
// says it occurred, and the wording matches which answer they gave.
import { loadPureHelpers } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue, assertFalse } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "advocacy-ui.js");

const { toContactState, priorAttemptsSentence } =
  loadPureHelpers(["toContactState", "priorAttemptsSentence"], SRC);

suite("SULA-009 — 'not yet contacted' asserts nothing", () => {
  test("default answer does NOT claim contact", () => {
    const st = toContactState("no", "");
    assertFalse(st.contactedMerchant, "must not default to contacted");
  });

  test("no answer at all does NOT claim contact", () => {
    assertFalse(toContactState(undefined, undefined).contactedMerchant);
    assertFalse(toContactState("", "").contactedMerchant);
  });

  test("the complaint sentence is EMPTY when no contact happened", () => {
    // This is the exact fabrication QA found. It must produce nothing, so the
    // letter falls back to prompting the user instead of inventing history.
    assertEq(priorAttemptsSentence(toContactState("no", "")), "");
    assertEq(priorAttemptsSentence({ contactedMerchant: false }), "");
    assertEq(priorAttemptsSentence(null), "");
    assertEq(priorAttemptsSentence(undefined), "");
  });

  test("a stray day count cannot manufacture contact", () => {
    const st = toContactState("no", "30");
    assertFalse(st.contactedMerchant,
      "days typed while 'Not yet' is selected must not imply contact");
    assertEq(priorAttemptsSentence(st), "");
  });
});

suite("SULA-009 — 'contacted, ignored' is stated accurately", () => {
  test("marks contacted, not refused", () => {
    const st = toContactState("ignored", "7");
    assertTrue(st.contactedMerchant);
    assertFalse(st.merchantRespondedNo);
    assertEq(st.merchantIgnoredDays, 7);
  });

  test("sentence reports the day count the user gave", () => {
    const s = priorAttemptsSentence(toContactState("ignored", "7"));
    assertTrue(s.indexOf("7 days ago") !== -1, `expected the real count in: ${s}`);
    assertTrue(s.indexOf("not received a resolution") !== -1);
  });

  test("singular day is not written as '1 days'", () => {
    const s = priorAttemptsSentence(toContactState("ignored", "1"));
    assertTrue(s.indexOf("1 day ago") !== -1, s);
  });

  test("a missing day count does not invent one", () => {
    const s = priorAttemptsSentence(toContactState("ignored", ""));
    assertTrue(s.indexOf("contacted the company") !== -1);
    assertFalse(/\d+ days? ago/.test(s), `must not fabricate a duration: ${s}`);
  });

  test("garbage input does not become a number", () => {
    const st = toContactState("ignored", "abc");
    assertEq(st.merchantIgnoredDays, 0);
    assertFalse(/\d+ days? ago/.test(priorAttemptsSentence(st)));
  });

  test("negative days are ignored, not asserted", () => {
    assertFalse(/-\d/.test(priorAttemptsSentence(toContactState("ignored", "-5"))));
  });
});

suite("SULA-009 — 'contacted, refused' is stated accurately", () => {
  test("marks both contacted and refused", () => {
    const st = toContactState("refused", "");
    assertTrue(st.contactedMerchant);
    assertTrue(st.merchantRespondedNo);
  });

  test("sentence says declined, not ignored", () => {
    const s = priorAttemptsSentence(toContactState("refused", ""));
    assertTrue(s.indexOf("declined to resolve") !== -1, s);
    assertFalse(s.indexOf("not received a resolution") !== -1,
      "a refusal must not be described as silence");
  });
});
