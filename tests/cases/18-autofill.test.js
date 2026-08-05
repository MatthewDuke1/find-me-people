// Autofill engine (autofill.js): the pure brain — classifyField + buildFillPlan.
// The DOM layer (scan/fill/highlight) is browser-only.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertEq, assertTrue } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "autofill.js");
const { classifyField, buildFillPlan } = loadModuleApi(SRC, "SulaAutofill");

suite("classifyField - autocomplete wins (most reliable)", () => {
  test("given-name -> firstName", () => assertEq(classifyField({ autocomplete: "given-name" }), "firstName"));
  test("family-name -> lastName", () => assertEq(classifyField({ autocomplete: "family-name" }), "lastName"));
  test("email autocomplete -> email", () => assertEq(classifyField({ autocomplete: "email" }), "email"));
  test("organization -> currentCompany", () => assertEq(classifyField({ autocomplete: "organization" }), "currentCompany"));
});

suite("classifyField - input type", () => {
  test("type=email -> email", () => assertEq(classifyField({ type: "email" }), "email"));
  test("type=tel -> phone", () => assertEq(classifyField({ type: "tel" }), "phone"));
});

suite("classifyField - label/name keyword heuristics", () => {
  test("First Name label", () => assertEq(classifyField({ label: "First Name" }), "firstName"));
  test("last_name id", () => assertEq(classifyField({ id: "last_name" }), "lastName"));
  test("LinkedIn Profile", () => assertEq(classifyField({ label: "LinkedIn Profile URL" }), "linkedin"));
  test("GitHub", () => assertEq(classifyField({ placeholder: "github.com/you" }), "github"));
  test("Phone number", () => assertEq(classifyField({ label: "Phone number" }), "phone"));
  test("Zip / Postal code", () => assertEq(classifyField({ label: "Postal code" }), "zip"));
  test("Current employer", () => assertEq(classifyField({ label: "Current employer" }), "currentCompany"));
  test("Years of experience", () => assertEq(classifyField({ label: "Years of experience" }), "yearsExperience"));
  test("first name beats generic 'name'", () => assertEq(classifyField({ name: "first_name" }), "firstName"));
  test("bare 'Name' -> fullName", () => assertEq(classifyField({ label: "Name" }), "fullName"));
  test("unknown field -> null", () => assertEq(classifyField({ label: "Favorite color" }), null));
  test("empty meta -> null", () => assertEq(classifyField({}), null));
});

suite("buildFillPlan", () => {
  const profile = { firstName: "Matt", lastName: "Duke", email: "m@x.com", phone: "555" };
  test("maps known keys to values", () => {
    const plan = buildFillPlan([{ idx: 0, key: "firstName" }, { idx: 1, key: "email" }], profile);
    assertEq(plan.length, 2);
    assertEq(plan[0].value, "Matt");
    assertEq(plan[1].value, "m@x.com");
  });
  test("derives fullName from first+last when no dedicated value", () => {
    const plan = buildFillPlan([{ idx: 0, key: "fullName" }], profile);
    assertEq(plan[0].value, "Matt Duke");
  });
  test("skips keys with no profile value (never fills blanks)", () => {
    const plan = buildFillPlan([{ idx: 0, key: "github" }], profile);
    assertEq(plan.length, 0);
  });
  test("empty inputs never throw", () => {
    assertEq(buildFillPlan([], {}).length, 0);
    assertEq(buildFillPlan(null, null).length, 0);
  });
});
