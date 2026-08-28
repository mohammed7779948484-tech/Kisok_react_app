#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { planRequest, run } from "./cli.mjs";
import { caseProps, parseFrontMatter } from "./render.mjs";

/**
 * Generator quality gate.
 *
 * A generator whose templates merely "look right" is worthless: every future
 * feature inherits whatever it emits. This proves the real output typechecks,
 * lints without warnings, is formatted, and passes its own generated tests —
 * across FOUR materially different feature shapes — then removes every trace.
 *
 * Run with `pnpm generate:smoke`. CI runs it on every PR.
 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Deliberately different shapes. A generator biased toward one of these
 * produces awkward code for the others, which is exactly what this catches.
 */
const SHAPES = [
  {
    label: "read-heavy (Catalog)",
    request: { capability: "feature", feature: "smoke-read", options: { role: "customer" } },
    expect: [
      "schemas/",
      "api/fetch-",
      "queries/use-",
      "screens/",
      "components/",
      "app/(customer)/",
    ],
  },
  {
    label: "local-state-heavy (Cart)",
    request: {
      capability: "feature",
      feature: "smoke-state",
      options: { role: "customer", with: ["store", "component", "screen"] },
    },
    expect: ["state/", "components/", "screens/"],
    reject: ["api/", "queries/", "app/"],
  },
  {
    label: "mutation-heavy (Checkout)",
    request: {
      capability: "feature",
      feature: "smoke-write",
      options: { role: "customer", with: ["schema", "mutation", "store", "screen", "route"] },
    },
    expect: [
      "api/smoke-write.ts",
      "queries/use-smoke-write-mutation.ts",
      "queries/keys.ts",
      "state/",
    ],
  },
  {
    label: "query + mutation + realtime (Preparation)",
    request: {
      capability: "feature",
      feature: "smoke-live",
      options: {
        role: "preparation",
        with: ["schema", "query", "mutation", "realtime", "screen", "route"],
      },
    },
    expect: ["queries/use-smoke-live-realtime.ts", "app/(preparation)/smoke-live.tsx"],
  },
];

/** Adding a piece to an existing feature must work too, and must not clobber it. */
const FOLLOW_UPS = [
  { capability: "query", feature: "smoke-read", name: "product-detail" },
  { capability: "mutation", feature: "smoke-read", name: "refresh-catalog" },
  { capability: "component", feature: "smoke-read", name: "product-card" },
  { capability: "screen", feature: "smoke-read", name: "search" },
];

const SCRATCH_FEATURES = ["smoke-read", "smoke-state", "smoke-write", "smoke-live"];

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

console.log("\nKISOK generator smoke test\n");

console.log("case conversion");
check("derives every case from a multi-word name", () => {
  const props = caseProps("order-tracking");
  assert.equal(props.pascalCaseName, "OrderTracking");
  assert.equal(props.camelCaseName, "orderTracking");
  assert.equal(props.kebabCaseName, "order-tracking");
  assert.equal(props.snakeCaseName, "order_tracking");
});
check("normalises camelCase and spaced input identically", () => {
  assert.equal(caseProps("orderTracking").kebabCaseName, "order-tracking");
  assert.equal(caseProps("Order Tracking").kebabCaseName, "order-tracking");
});
check("rejects an empty name", () => assert.throws(() => caseProps("   ")));

console.log("\nfront matter");
check("parses keys and strips the block", () => {
  const { attributes, body } = parseFrontMatter(
    "---\ndestinationDir: a/b\nskip: true\n---\nbody\n",
  );
  assert.equal(attributes.destinationDir, "a/b");
  assert.equal(attributes.skip, true);
  assert.equal(body.trim(), "body");
});
check("leaves a file without front matter untouched", () =>
  assert.equal(parseFrontMatter("plain body").body, "plain body"),
);

console.log("\nplanning");
for (const shape of SHAPES) {
  check(`plans ${shape.label}`, () => {
    const destinations = planRequest(shape.request).map((file) => file.destination);
    assert.ok(destinations.length > 0, "planned nothing");

    for (const fragment of shape.expect) {
      assert.ok(
        destinations.some((destination) => destination.includes(fragment)),
        `expected a file matching "${fragment}", got:\n    ${destinations.join("\n    ")}`,
      );
    }
    for (const fragment of shape.reject ?? []) {
      assert.ok(
        !destinations.some((destination) => destination.includes(fragment)),
        `did not expect a file matching "${fragment}"`,
      );
    }
  });
}

check("every capability is individually generatable", () => {
  for (const capability of [
    "schema",
    "query",
    "mutation",
    "store",
    "component",
    "screen",
    "realtime",
    "route",
  ]) {
    const planned = planRequest({
      capability,
      feature: "solo",
      name: "thing",
      options: { role: "customer" },
    });
    assert.ok(planned.length > 0, `${capability} planned nothing`);
  }
});
check("rejects an unknown capability", () =>
  assert.throws(
    () => planRequest({ capability: "nope", feature: "x", options: {} }),
    /Unknown capability/,
  ),
);
check("rejects an unknown --with value", () =>
  assert.throws(
    () => planRequest({ capability: "feature", feature: "x", options: { with: ["nope"] } }),
    /Unknown --with/,
  ),
);
check("rejects --with on a non-feature capability", () =>
  assert.throws(
    () => planRequest({ capability: "screen", feature: "x", options: { with: ["query"] } }),
    /--with only applies/,
  ),
);
check("rejects an unknown role", () =>
  assert.throws(
    () => planRequest({ capability: "feature", feature: "x", options: { role: "admin" } }),
    /Unknown --role/,
  ),
);
check("always emits a TODO and a public API for a feature", () => {
  const destinations = planRequest({
    capability: "feature",
    feature: "bare",
    options: { role: "shared", with: [] },
  }).map((file) => file.destination);
  assert.deepEqual(destinations.sort(), ["features/bare/TODO.md", "features/bare/index.ts"]);
});
check("leaves no unrendered template syntax and ends every file with a newline", () => {
  for (const shape of SHAPES) {
    for (const file of planRequest(shape.request)) {
      assert.ok(!file.contents.includes("<%"), `${file.destination} still contains EJS syntax`);
      assert.ok(!file.contents.includes("NAME"), `${file.destination} has an unsubstituted NAME`);
      assert.ok(file.contents.endsWith("\n"), `${file.destination} must end with a newline`);
    }
  }
});
check("touches no shared file beyond one route per screen", () => {
  for (const shape of SHAPES) {
    for (const file of planRequest(shape.request)) {
      const inFeature = file.destination.startsWith(`features/${shape.request.feature}/`);
      const isRoute = /^app\/(\([a-z]+\)\/)?[a-z0-9-]+\.tsx$/.test(file.destination);
      assert.ok(
        inFeature || isRoute,
        `${file.destination} is outside the feature and is not a route file`,
      );
    }
  }
});

if (failures > 0) {
  console.error(`\n${failures} generator check(s) failed.\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// End to end: generate all four shapes for real, prove they hold up, clean up.
// ---------------------------------------------------------------------------
console.log("\nend to end (generate -> typecheck -> lint -> format -> test)");

function cleanUp() {
  for (const feature of SCRATCH_FEATURES) {
    fs.rmSync(path.join(ROOT, "features", feature), { recursive: true, force: true });
  }
  for (const dir of ["app", "app/(customer)", "app/(preparation)"]) {
    const absolute = path.join(ROOT, dir);
    if (!fs.existsSync(absolute)) continue;
    for (const entry of fs.readdirSync(absolute)) {
      if (SCRATCH_FEATURES.some((feature) => entry === `${feature}.tsx`)) {
        fs.rmSync(path.join(absolute, entry), { force: true });
      }
    }
  }
}

function shell(command, args) {
  execFileSync(command, args, { cwd: ROOT, stdio: "pipe" });
}

try {
  // A previous run killed mid-flight would leave scratch features behind, and
  // every later `pnpm verify` would fail somewhere confusing. Clear them first.
  cleanUp();

  let total = 0;
  for (const shape of SHAPES) {
    const result = await run(shape.request);
    total += result.written.length;
    console.log(`  generated ${result.written.length} files — ${shape.label}`);
  }

  for (const followUp of FOLLOW_UPS) {
    const result = await run({ ...followUp, options: { role: "customer" } });
    assert.ok(result.written.length > 0, `follow-up ${followUp.capability} wrote nothing`);
  }
  console.log(`  added ${FOLLOW_UPS.length} follow-up capabilities to an existing feature`);

  // Re-running a capability must not clobber work in progress.
  const rerun = await run({ ...FOLLOW_UPS[0], options: { role: "customer" } });
  assert.equal(rerun.written.length, 0, "re-running a capability overwrote existing files");
  assert.ok(rerun.skipped.length > 0, "re-run should have reported skipped files");
  console.log("  ok  re-running a capability overwrites nothing");

  shell("npx", ["tsc", "--noEmit"]);
  console.log(`  ok  all ${total} generated files typecheck`);

  const lintTargets = [
    ...SCRATCH_FEATURES.map((feature) => `features/${feature}`),
    "app/(customer)/smoke-read.tsx",
    "app/(customer)/smoke-write.tsx",
    "app/(preparation)/smoke-live.tsx",
  ];
  // `--max-warnings=0`: a warning in generated code is inherited by every
  // feature built from it.
  shell("npx", ["eslint", "--max-warnings=0", ...lintTargets]);
  console.log("  ok  generated code lints clean (no warnings)");

  shell("npx", [
    "prettier",
    "--check",
    ...SCRATCH_FEATURES.map((feature) => `features/${feature}`),
  ]);
  console.log("  ok  generated code is formatted");

  shell("npx", [
    "jest",
    "--ci",
    "--silent",
    ...SCRATCH_FEATURES.map((feature) => `features/${feature}`),
  ]);
  console.log("  ok  generated tests pass");
} catch (error) {
  const output = [error.stdout?.toString(), error.stderr?.toString(), error.message]
    .filter(Boolean)
    .join("\n");
  console.error(`\n  FAIL end to end\n${output}\n`);
  cleanUp();
  process.exit(1);
}

cleanUp();
console.log("  ok  cleaned up\n\nKISOK generator smoke test passed\n");
