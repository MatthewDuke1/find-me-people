// Test entry point. Imports every *.test.js under tests/cases/ so they
// register their cases against the runner singleton, then triggers
// runAll().
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runAll } from "./lib/test-runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CASES_DIR = path.join(__dirname, "cases");
const files = fs
  .readdirSync(CASES_DIR)
  .filter((f) => f.endsWith(".test.js"))
  .sort();

for (const f of files) {
  await import(pathToFileURL(path.join(CASES_DIR, f)).href);
}

await runAll();
