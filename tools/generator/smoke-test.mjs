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
    // The new default: a workspace and nothing else. No API, no UI, no route.
    label: "workspace only (the default)",
    request: { capability: "feature", feature: "smoke-bare", options: { role: "shared" } },
    expect: ["features/smoke-bare/index.ts", "docs/brief.md", "docs/plan.md", "docs/todo.md"],
    reject: ["api/", "queries/", "screens/", "state/", "model/", "app/"],
  },
  {
    // Domain only: rules and contracts, no IO and no screen.
    label: "pure model (domain-only)",
    request: {
      capability: "feature",
      feature: "smoke-model",
      options: { role: "shared", with: ["schema"] },
    },
    expect: ["model/smoke-model.schema.ts", "model/smoke-model.schema.test.ts"],
    reject: ["api/", "queries/", "screens/", "app/"],
  },
  {
    label: "read-heavy (Catalog)",
    request: {
      capability: "feature",
      feature: "smoke-read",
      options: {
        role: "customer",
        with: ["schema", "query", "component", "screen", "route"],
      },
    },
    expect: [
      "model/smoke-read.schema.ts",
      "api/fetch-",
      "queries/use-",
      "screens/smoke-read/smoke-read-screen.tsx",
      "screens/smoke-read/smoke-read-screen.test.tsx",
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
    expect: ["state/", "components/", "screens/smoke-state/smoke-state-screen.tsx"],
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
  // Feature-wide component: reused by more than one screen in this feature.
  { capability: "component", feature: "smoke-read", name: "product-card" },
  { capability: "screen", feature: "smoke-read", name: "search" },
  // Screen-local component: private to one screen, generated in place rather
  // than created at feature level and moved by hand afterwards.
  {
    capability: "component",
    feature: "smoke-read",
    name: "search-filter",
    screen: "search",
  },
  // The documented "add a route later" flow. Its screen must be generated AND
  // exported from the feature's public API, or the route will not compile.
  { capability: "route", feature: "smoke-read", name: "detail" },
];

const SCRATCH_FEATURES = [
  "smoke-bare",
  "smoke-model",
  "smoke-read",
  "smoke-state",
  "smoke-write",
  "smoke-live",
];

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
check("a route also brings the screen it renders", () => {
  // A route imports its screen through the feature's public API, so emitting a
  // route without a screen would reference something that does not exist.
  const destinations = planRequest({
    capability: "route",
    feature: "solo",
    name: "detail",
    options: { role: "customer" },
  }).map((file) => file.destination);

  assert.ok(destinations.some((d) => d.includes("screens/detail/detail-screen.tsx")));
  assert.ok(destinations.includes("app/(customer)/detail.tsx"));
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
check("refuses realtime for the customer experience", () =>
  // Only `public.orders` is published and RLS gives a customer no rows, so the
  // subscription could never fire — generating it would be dead code.
  assert.throws(
    () =>
      planRequest({
        capability: "realtime",
        feature: "x",
        name: "live",
        options: { role: "customer" },
      }),
    /not available to the customer experience/,
  ),
);
check("rejects an unknown role", () =>
  assert.throws(
    () => planRequest({ capability: "feature", feature: "x", options: { role: "admin" } }),
    /Unknown --role/,
  ),
);
check("a feature is a workspace by default: public API plus control documents", () => {
  const destinations = planRequest({
    capability: "feature",
    feature: "bare",
    options: { role: "shared" },
  }).map((file) => file.destination);

  assert.deepEqual(destinations.sort(), [
    "features/bare/docs/brief.md",
    "features/bare/docs/plan.md",
    "features/bare/docs/review.md",
    "features/bare/docs/todo.md",
    "features/bare/docs/worklog.md",
    "features/bare/index.ts",
  ]);
});
check("a component is feature-wide by default and screen-local with --screen", () => {
  const wide = planRequest({
    capability: "component",
    feature: "solo",
    name: "chip",
    options: { role: "customer" },
  }).map((file) => file.destination);
  assert.deepEqual(wide, ["features/solo/components/chip.tsx"]);

  const local = planRequest({
    capability: "component",
    feature: "solo",
    name: "chip",
    options: { role: "customer", screen: "detail" },
  }).map((file) => file.destination);
  assert.deepEqual(local, ["features/solo/screens/detail/components/chip.tsx"]);
});
check("rejects --screen on anything but a component", () =>
  assert.throws(
    () =>
      planRequest({
        capability: "screen",
        feature: "x",
        name: "y",
        options: { role: "customer", screen: "z" },
      }),
    /--screen only applies/,
  ),
);
check("tests are colocated with the code they protect", () => {
  const destinations = planRequest({
    capability: "feature",
    feature: "colo",
    options: { role: "customer", with: ["schema", "query", "screen"] },
  }).map((file) => file.destination);

  for (const test of destinations.filter((d) => /\.test\.tsx?$/.test(d))) {
    assert.ok(
      !test.includes("__tests__"),
      `${test} is in a __tests__ bucket instead of beside its subject`,
    );
    const subject = test.replace(/\.test\.(tsx?)$/, ".$1");
    assert.ok(
      destinations.includes(subject),
      `${test} has no colocated subject (expected ${subject})`,
    );
  }
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
        !/^(components|core|app)\/.*(index|registry|keys)\.ts$/.test(file.destination),
        `${file.destination} looks like a shared registry edit`,
      );
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

/** Every path the run has written, so cleanup never has to guess a filename. */
const writtenPaths = new Set();

function cleanUp() {
  for (const relative of writtenPaths) {
    fs.rmSync(path.join(ROOT, relative), { force: true });
  }
  writtenPaths.clear();

  for (const feature of SCRATCH_FEATURES) {
    fs.rmSync(path.join(ROOT, "features", feature), { recursive: true, force: true });
  }

  // Belt and braces for a previous run that was killed before it could clean up.
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
    for (const file of result.written) writtenPaths.add(file);
    total += result.written.length;
    console.log(`  generated ${result.written.length} files — ${shape.label}`);
  }

  for (const { screen, ...followUp } of FOLLOW_UPS) {
    const result = await run({ ...followUp, options: { role: "customer", screen } });
    for (const file of result.written) writtenPaths.add(file);
    assert.ok(result.written.length > 0, `follow-up ${followUp.capability} wrote nothing`);
  }
  console.log(`  added ${FOLLOW_UPS.length} follow-up capabilities to an existing feature`);

  // Re-running a capability must not clobber work in progress.
  const indexPath = path.join(ROOT, "features", "smoke-read", "index.ts");
  const indexAfter = fs.readFileSync(indexPath, "utf8");
  assert.ok(
    indexAfter.includes("DetailScreen"),
    "a follow-up route must export its screen from the feature's public API",
  );
  assert.ok(
    indexAfter.includes("SearchScreen"),
    "a follow-up screen must export itself from the feature's public API",
  );
  console.log("  ok  follow-up screens are exported from the feature's public API");

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
console.log("  ok  cleaned up");

// ---------------------------------------------------------------------------
// Atomicity: a broken template must leave the repository EXACTLY as it was.
//
// This is the failure mode that used to be tolerated — a template that produced
// unparseable output was warned about and written anyway, leaving a feature
// directory half generated and not compiling, with no clean way back.
// ---------------------------------------------------------------------------
console.log("\natomicity");

const BROKEN_FEATURE = "smoke-atomic";
const brokenTemplate = path.join(ROOT, "tools/generator/templates/model/schema.ts.ejs");
const originalTemplate = fs.readFileSync(brokenTemplate, "utf8");

try {
  // Valid EJS, invalid TypeScript: it renders fine and then cannot be parsed.
  fs.writeFileSync(brokenTemplate, `${originalTemplate}\nexport const = ;;; broken(\n`, "utf8");

  let threw = null;
  try {
    await run({
      capability: "feature",
      feature: BROKEN_FEATURE,
      options: { role: "shared", with: ["schema"] },
    });
  } catch (error) {
    threw = error;
  }

  check("a template that produces invalid syntax aborts the request", () => {
    assert.ok(threw, "the generator accepted a template that produces invalid syntax");
    assert.match(threw.message, /NOTHING was written/);
  });

  check("no partial feature is left behind", () => {
    const featureDir = path.join(ROOT, "features", BROKEN_FEATURE);
    assert.ok(
      !fs.existsSync(featureDir),
      `${featureDir} exists — a failed generation wrote a partial feature`,
    );
  });
} finally {
  fs.writeFileSync(brokenTemplate, originalTemplate, "utf8");
  fs.rmSync(path.join(ROOT, "features", BROKEN_FEATURE), { recursive: true, force: true });
}

check("the template was restored", () =>
  assert.equal(fs.readFileSync(brokenTemplate, "utf8"), originalTemplate),
);

if (failures > 0) {
  console.error(`\n${failures} generator check(s) failed.\n`);
  process.exit(1);
}

console.log("\nKISOK generator smoke test passed\n");
