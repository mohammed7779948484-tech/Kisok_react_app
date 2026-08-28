#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runFeature } from "./cli.mjs";
import { buildProps, planFeature } from "./generators/feature.mjs";
import { caseProps, parseFrontMatter } from "./render.mjs";

/**
 * Generator quality gate.
 *
 * A generator whose templates merely "look right" is worthless: agents inherit
 * whatever it emits. This proves the real output typechecks, lints, and passes
 * its own generated tests, then removes every trace of itself.
 *
 * Run with `pnpm ignite:smoke`. CI runs it on every PR.
 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH_FEATURE = "ignite-smoke-check";

let failures = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  ok  ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${label}\n       ${error.message}`);
  }
}

console.log("\nignite smoke test\n");

console.log("case conversion");
check("derives every case from a multi-word name", () => {
  const props = caseProps("order-tracking");
  assert.equal(props.pascalCaseName, "OrderTracking");
  assert.equal(props.camelCaseName, "orderTracking");
  assert.equal(props.kebabCaseName, "order-tracking");
  assert.equal(props.snakeCaseName, "order_tracking");
});
check("normalises camelCase and spaced input to the same result", () => {
  assert.equal(caseProps("orderTracking").kebabCaseName, "order-tracking");
  assert.equal(caseProps("Order Tracking").kebabCaseName, "order-tracking");
});
check("rejects an empty name", () => {
  assert.throws(() => caseProps("   "));
});

console.log("\nfront matter");
check("parses keys and strips the block from the body", () => {
  const { attributes, body } = parseFrontMatter(
    "---\ndestinationDir: a/b\nskip: true\n---\nbody\n",
  );
  assert.equal(attributes.destinationDir, "a/b");
  assert.equal(attributes.skip, true);
  assert.equal(body.trim(), "body");
});
check("leaves a file without front matter untouched", () => {
  assert.equal(parseFrontMatter("plain body").body, "plain body");
});

console.log("\nplanning");
check("omits the layers that were not requested", () => {
  const props = buildProps({
    name: "demo",
    role: "shared",
    layers: ["screens"],
    realtime: false,
    route: true,
  });
  const destinations = planFeature(props).map((file) => file.destination);

  assert.ok(destinations.some((d) => d.endsWith("screens/demo-screen.tsx")));
  assert.ok(!destinations.some((d) => d.includes("/api/")), "api layer should be absent");
  assert.ok(!destinations.some((d) => d.includes("/state/")), "state layer should be absent");
});
check("puts a customer feature's route in the customer group", () => {
  const props = buildProps({
    name: "demo",
    role: "customer",
    layers: ["screens"],
    realtime: false,
    route: true,
  });
  const destinations = planFeature(props).map((file) => file.destination);

  assert.ok(destinations.includes("app/(customer)/demo.tsx"));
});
check("--no-route emits no route file", () => {
  const props = buildProps({
    name: "demo",
    role: "customer",
    layers: ["screens"],
    realtime: false,
    route: false,
  });

  assert.ok(!planFeature(props).some((file) => file.destination.startsWith("app/")));
});
check("rejects an unknown role", () => {
  assert.throws(
    () =>
      buildProps({
        name: "demo",
        role: "admin",
        layers: ["screens"],
        realtime: false,
        route: true,
      }),
    /Unknown --role/,
  );
});
check("rejects --realtime without the queries layer it depends on", () => {
  assert.throws(
    () =>
      buildProps({
        name: "demo",
        role: "preparation",
        layers: ["screens"],
        realtime: true,
        route: true,
      }),
    /--realtime needs/,
  );
});
check("always generates a TODO and a public API", () => {
  const props = buildProps({
    name: "demo",
    role: "shared",
    layers: [],
    realtime: false,
    route: false,
  });
  const destinations = planFeature(props).map((file) => file.destination);

  assert.ok(destinations.includes("features/demo/TODO.md"));
  assert.ok(destinations.includes("features/demo/index.ts"));
});
check("leaves no unrendered template syntax in any output", () => {
  const props = buildProps({
    name: "demo",
    role: "preparation",
    layers: ["api", "queries", "state", "schemas", "components", "screens", "tests"],
    realtime: true,
    route: true,
  });

  for (const file of planFeature(props)) {
    assert.ok(!file.contents.includes("<%"), `${file.destination} still contains EJS syntax`);
    assert.ok(!file.contents.includes("NAME"), `${file.destination} has an unsubstituted NAME`);
    assert.ok(file.contents.endsWith("\n"), `${file.destination} must end with a newline`);
  }
});
check("does not overwrite an existing file unless forced", () => {
  const props = buildProps({
    name: "auth",
    role: "shared",
    layers: ["screens"],
    realtime: false,
    route: false,
  });
  // `features/auth/index.ts` already exists in the repo.
  const planned = planFeature(props);
  const existing = planned.find((file) => file.destination === "features/auth/index.ts");
  assert.ok(existing, "expected the plan to include features/auth/index.ts");
  assert.ok(fs.existsSync(path.join(ROOT, existing.destination)));
});

if (failures > 0) {
  console.error(`\n${failures} generator check(s) failed.\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// End-to-end: generate for real, prove it compiles and its tests pass, clean up.
// ---------------------------------------------------------------------------
console.log("\nend-to-end (generate -> typecheck -> test -> clean up)");

const created = [];

function cleanUp() {
  for (const relative of created) {
    const absolute = path.join(ROOT, relative);
    if (fs.existsSync(absolute)) fs.rmSync(absolute, { force: true });
  }
  const featureDir = path.join(ROOT, "features", SCRATCH_FEATURE);
  if (fs.existsSync(featureDir)) fs.rmSync(featureDir, { recursive: true, force: true });
}

try {
  // A previous run that was killed mid-flight would leave the scratch feature
  // behind, and every later `pnpm verify` would then fail in a confusing place
  // (typecheck or format:check, not here). Clear it first.
  cleanUp();

  const result = await runFeature(SCRATCH_FEATURE, {
    role: "preparation",
    layers: ["api", "queries", "state", "schemas", "components", "screens", "tests"],
    realtime: true,
    route: true,
    dryRun: false,
    force: true,
  });
  created.push(...result.written);
  console.log(`  generated ${result.written.length} files`);

  execFileSync("npx", ["tsc", "--noEmit"], { cwd: ROOT, stdio: "pipe" });
  console.log("  ok  generated code typechecks");

  execFileSync("npx", ["jest", `features/${SCRATCH_FEATURE}`, "--ci", "--silent"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  console.log("  ok  generated tests pass");

  execFileSync(
    "npx",
    [
      "eslint",
      // A warning in generated code is inherited by every feature built from
      // it. An unused import that only a warning caught is exactly the kind of
      // rot this gate exists to prevent.
      "--max-warnings=0",
      `features/${SCRATCH_FEATURE}`,
      `app/(preparation)/${SCRATCH_FEATURE}.tsx`,
    ],
    {
      cwd: ROOT,
      stdio: "pipe",
    },
  );
  console.log("  ok  generated code lints clean (no warnings)");

  execFileSync("npx", ["prettier", "--check", `features/${SCRATCH_FEATURE}`], {
    cwd: ROOT,
    stdio: "pipe",
  });
  console.log("  ok  generated code is formatted");
} catch (error) {
  const output = [error.stdout?.toString(), error.stderr?.toString(), error.message]
    .filter(Boolean)
    .join("\n");
  console.error(`\n  FAIL end-to-end generation\n${output}\n`);
  cleanUp();
  process.exit(1);
}

cleanUp();
console.log("  ok  cleaned up\n\nignite smoke test passed\n");
