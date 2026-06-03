// Tiny test runner. No npm deps. Each test file registers cases via
// `test(name, fn)` and `assertEq(actual, expected, msg)`; the runner
// collects pass / fail counts and exits non-zero on any failure.

const cases = [];
let currentSuite = "";

export function suite(name, fn) {
  currentSuite = name;
  fn();
  currentSuite = "";
}

export function test(name, fn) {
  cases.push({ suite: currentSuite, name, fn });
}

export function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      (msg ? msg + ": " : "") +
        "expected " + e + " but got " + a
    );
  }
}

export function assertTrue(value, msg) {
  if (!value) throw new Error((msg ? msg + ": " : "") + "expected truthy, got " + JSON.stringify(value));
}

export function assertFalse(value, msg) {
  if (value) throw new Error((msg ? msg + ": " : "") + "expected falsy, got " + JSON.stringify(value));
}

export async function runAll() {
  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const c of cases) {
    try {
      await c.fn();
      pass++;
    } catch (err) {
      fail++;
      failures.push({ suite: c.suite, name: c.name, err });
    }
  }

  const total = pass + fail;
  process.stdout.write(
    "\n" + pass + " / " + total + " passing" + (fail ? ", " + fail + " failing" : "") + "\n"
  );
  if (fail) {
    process.stdout.write("\nFailures:\n");
    for (const f of failures) {
      process.stdout.write("  " + f.suite + " > " + f.name + "\n");
      process.stdout.write("    " + f.err.message + "\n");
    }
    process.exit(1);
  }
}
