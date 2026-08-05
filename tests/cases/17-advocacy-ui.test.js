// advocacy-ui.js load smoke test — the module is DOM/UI (its logic deps are
// tested in cases 11-15), so here we just confirm it loads without throwing and
// exposes render(), catching top-level breakage before it ships.
import { loadModuleApi } from "../lib/extract.js";
import { suite, test, assertTrue } from "../lib/test-runner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "advocacy-ui.js");
suite("advocacy-ui loads", () => {
  test("exposes render()", () => {
    const api = loadModuleApi(SRC, "SulaAdvocacyUI");
    assertTrue(typeof api.render === "function");
  });
});
