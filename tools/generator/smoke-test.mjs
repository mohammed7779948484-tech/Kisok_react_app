#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { planRequest, publicScreensFor, run } from "./cli.mjs";
import { caseProps, parseFrontMatter, planFeatureExport, writeFiles } from "./render.mjs";

/**
 * Generator quality gate.
 *
 * A generator whose templates merely "look right" is worthless: every future
 * feature inherits whatever it emits. This proves the real output typechecks,
 * lints without warnings, is formatted, and passes its own generated tests —
 * across materially different feature shapes — then removes every trace.
 *
 * Run with `pnpm generate:smoke`. CI runs it on every PR.
 *
 * WHERE IT WRITES. Every unit-level check runs in an `fs.mkdtempSync` root and
 * touches nothing tracked. The end-to-end section is the exception and has to
 * be: typechecking and linting generated output only means something against
 * this project's real config, so it generates `features/smoke-*` and
 * `app/(role)/smoke-*.tsx` into the working tree and removes them. Cleanup runs
 * on the success and failure paths, but a SIGKILL skips both — which is why
 * `.husky/pre-commit` refuses to commit anything matching those names, and why
 * two agents must not run this concurrently.
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
  // The documented "add a route later" flow: the screen already exists (the
  // `search` follow-up above generated it), and the route names it. This is the
  // case the old design could not express — the route file is `detail.tsx` and
  // the screen is `SearchScreen`, which forced a same-named unused screen before.
  //
  // The route is also what makes that screen public: a screen is feature-private
  // until something outside the feature renders it.
  { capability: "route", feature: "smoke-read", name: "detail", screen: "search" },
];

/**
 * Every feature name this file may create in the REAL repository.
 *
 * The end-to-end section has to generate here — typechecking and linting the
 * output only means something against the project's real config. Everything
 * else runs in a temp root. `cleanUp()` walks this list, so a name missing from
 * it survives a killed run; `.husky/pre-commit` refuses to commit anything
 * matching `features/smoke-*` as the backstop.
 */
const SHAPE_FEATURES = [
  "smoke-bare",
  "smoke-model",
  "smoke-read",
  "smoke-state",
  "smoke-write",
  "smoke-live",
];

/**
 * The atomicity and --force sections create these, outside the end-to-end run.
 * They are never typechecked or linted — those sections assert that nothing was
 * written, or restore what was — but `cleanUp()` must still know their names or
 * a killed run leaves them in the working tree.
 */
const TRANSIENT_FEATURES = ["smoke-atomic", "smoke-force"];

/** Everything this file may create in the real repository. */
const SCRATCH_FEATURES = [...SHAPE_FEATURES, ...TRANSIENT_FEATURES];

let failures = 0;

// `fn` may be async (several checks drive `run()`, which formats with
// Prettier). Always awaited, even for a synchronous `fn`, so a rejected
// promise is caught HERE rather than surfacing later as an unhandled
// rejection with no failing-check attribution — which previously let an
// async check's assertion fail silently while this still logged "ok".
async function check(label, fn) {
  try {
    await fn();
    console.log(`  ok  ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${label}\n       ${error.message}`);
  }
}

console.log("\nKISOK generator smoke test\n");

console.log("case conversion");
await check("derives every case from a multi-word name", () => {
  const props = caseProps("order-tracking");
  assert.equal(props.pascalCaseName, "OrderTracking");
  assert.equal(props.camelCaseName, "orderTracking");
  assert.equal(props.kebabCaseName, "order-tracking");
  assert.equal(props.snakeCaseName, "order_tracking");
});
await check("normalises camelCase and spaced input identically", () => {
  assert.equal(caseProps("orderTracking").kebabCaseName, "order-tracking");
  assert.equal(caseProps("Order Tracking").kebabCaseName, "order-tracking");
});
await check("rejects an empty name", () => assert.throws(() => caseProps("   ")));
await check("rejects a name too long to survive nested paths", () => {
  // The name is repeated in features/<n>/screens/<n>/<n>-screen.test.tsx, so a
  // very long one produced files whose imports the resolver could not find —
  // a confusing "cannot find module" in generated code rather than a clear
  // complaint about the name.
  assert.throws(() => caseProps("seg".repeat(80)), /the limit is/);
});
await check("rejects a name that is not a usable directory or import path", () => {
  // Separators are normalised away, so the reachable bad case is a character
  // that survives the split and would end up in a directory name.
  assert.throws(() => caseProps("cart!"), /not a usable name/);
  assert.throws(() => caseProps("order.tracking"), /not a usable name/);
});

console.log("\nfront matter");
await check("parses keys and strips the block", () => {
  const { attributes, body } = parseFrontMatter(
    "---\ndestinationDir: a/b\nskip: true\n---\nbody\n",
  );
  assert.equal(attributes.destinationDir, "a/b");
  assert.equal(attributes.skip, true);
  assert.equal(body.trim(), "body");
});
await check("leaves a file without front matter untouched", () =>
  assert.equal(parseFrontMatter("plain body").body, "plain body"),
);

console.log("\nplanning");
for (const shape of SHAPES) {
  await check(`plans ${shape.label}`, () => {
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

await check("every capability is individually generatable", () => {
  for (const capability of ["schema", "query", "mutation", "store", "component", "screen"]) {
    const planned = planRequest({
      capability,
      feature: "solo",
      name: "thing",
      options: { role: "customer" },
    });
    assert.ok(planned.length > 0, `${capability} planned nothing`);
  }

  // `route` and screen-local `component` both need a target screen on disk, so
  // they are exercised against a real one — in a TEMP root, never the working
  // tree. A test that plants fixtures in the repository leaves them behind the
  // moment it is killed.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kisok-caps-"));
  const featureRoot = path.join(scratch, "features", "solo-target");
  try {
    fs.mkdirSync(path.join(featureRoot, "screens", "catalog-home"), { recursive: true });
    fs.writeFileSync(
      path.join(featureRoot, "screens", "catalog-home", "catalog-home-screen.tsx"),
      "export function CatalogHomeScreen() {\n  return null;\n}\n",
      "utf8",
    );

    const route = planRequest({
      capability: "route",
      feature: "solo-target",
      name: "index",
      options: { role: "customer", screen: "catalog-home" },
      root: scratch,
    });
    assert.ok(route.length > 0, "route planned nothing");

    const component = planRequest({
      capability: "component",
      feature: "solo-target",
      name: "chip",
      options: { role: "customer", screen: "catalog-home" },
      root: scratch,
    });
    assert.ok(component.length > 0, "screen-local component planned nothing");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
await check("a route renders a NAMED existing screen and generates nothing else", () => {
  // A route used to imply `also: ["screen"]`, forcing the route file and the
  // screen to share a name. That cannot express
  // `app/(customer)/index.tsx → CatalogHomeScreen`: it generated an unused
  // `IndexScreen` instead. The route now targets a screen explicitly.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kisok-route-"));
  const featureRoot = path.join(scratch, "features", "solo-route");
  try {
    fs.mkdirSync(path.join(featureRoot, "screens", "catalog-home"), { recursive: true });
    fs.writeFileSync(
      path.join(featureRoot, "screens", "catalog-home", "catalog-home-screen.tsx"),
      "export function CatalogHomeScreen() {\n  return null;\n}\n",
      "utf8",
    );

    const planned = planRequest({
      capability: "route",
      feature: "solo-route",
      name: "index",
      options: { role: "customer", screen: "catalog-home" },
      root: scratch,
    });
    const destinations = planned.map((file) => file.destination);

    assert.deepEqual(destinations, ["app/(customer)/index.tsx"], "a route is ONE file");
    assert.match(
      planned[0].contents,
      /CatalogHomeScreen/,
      "the route must render the screen it was pointed at",
    );
    assert.doesNotMatch(planned[0].contents, /IndexScreen/, "no screen named after the route file");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

// The first real feature in each experience REPLACES the foundation placeholder
// at app/(role)/index.tsx. That is a deliberate overwrite of a tracked file, so
// it must work — otherwise the documented first step of the first feature is
// "the generator refuses; work around it by hand".
//
// Exercised entirely in a TEMP root, against a COPY of the real placeholder. An
// earlier version overwrote the tracked files and restored them in a `finally`,
// which a SIGKILL or an OOM would skip — leaving a route in the working tree
// importing a feature that does not exist.
//
// The tracked file is the natural fixture while the experience still ships its
// placeholder — but the first real feature CONSUMES it (that is the documented
// one-time --force step). After that, asserting the tracked file still contains
// a placeholder would make every post-first-feature run (and CI) red, so the
// check falls back to a faithful copy of the placeholder's shape and keeps
// guarding the replacement mechanics forever.
const PLACEHOLDER_FIXTURE = [
  'import { FoundationPlaceholder } from "@/components/app/foundation-placeholder";',
  "",
  "export default function HomeRoute() {",
  "  return (",
  "    <FoundationPlaceholder",
  '      experience="Experience"',
  '      nextFeature="feature"',
  '      surfaces={["One surface"]}',
  "    />",
  "  );",
  "}",
  "",
].join("\n");

for (const [role, group] of [
  ["customer", "(customer)"],
  ["preparation", "(preparation)"],
]) {
  await check(`replaces the ${role} index.tsx placeholder deliberately`, async () => {
    const trackedRoute = path.join(ROOT, "app", group, "index.tsx");
    const tracked = fs.readFileSync(trackedRoute, "utf8");
    // While the placeholder is live, exercise the real tracked content; once
    // the one-time replacement has shipped, guard the transition against the
    // faithful copy above.
    const original = /FoundationPlaceholder/.test(tracked) ? tracked : PLACEHOLDER_FIXTURE;

    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `kisok-${role}-`));
    try {
      const routePath = path.join(scratch, "app", group, "index.tsx");
      fs.mkdirSync(path.dirname(routePath), { recursive: true });
      fs.writeFileSync(routePath, original, "utf8");

      const featureRoot = path.join(scratch, "features", `smoke-${role}-home`);
      fs.mkdirSync(path.join(featureRoot, "screens", "home"), { recursive: true });
      fs.writeFileSync(
        path.join(featureRoot, "screens", "home", "home-screen.tsx"),
        "export function HomeScreen() {\n  return null;\n}\n",
        "utf8",
      );
      // The screen is feature-private until a route actually renders it — the
      // fixture matches that: index.ts starts with the neutral placeholder a
      // real feature workspace carries.
      const indexPath = path.join(featureRoot, "index.ts");
      fs.writeFileSync(indexPath, "export {};\n", "utf8");

      const request = {
        capability: "route",
        feature: `smoke-${role}-home`,
        name: "index",
        options: { role, screen: "home" },
      };

      // Driven through `run()` — the normal execution path a `pnpm generate`
      // invocation takes — not `writeFiles` called by hand, so this exercises
      // the same plan → format → validate → write sequence a real command does.
      //
      // Without --force the existing placeholder is preserved, not clobbered —
      // and the screen must NOT be exported either. A route write and its
      // screen's export are one semantic operation: exporting a screen whose
      // route was just SKIPPED would widen the feature's public API for a
      // screen nothing actually renders yet.
      const guarded = await run(request, { root: scratch });
      assert.deepEqual(guarded.written, [], "an existing route must not be overwritten silently");
      assert.deepEqual(guarded.skipped, [`app/${group}/index.tsx`]);
      assert.deepEqual(
        guarded.exported,
        [],
        "a skipped route must not still export the screen it would have rendered",
      );
      assert.equal(fs.readFileSync(routePath, "utf8"), original, "placeholder was modified");
      assert.equal(
        fs.readFileSync(indexPath, "utf8"),
        "export {};\n",
        "the feature's public API widened for a screen nothing renders yet",
      );

      // With --force it is replaced, which is the intended one-time step, and
      // the screen becomes public in the SAME call — the write and the export
      // are one operation, not two independently-timed ones.
      const forced = await run(
        { ...request, options: { ...request.options, force: true } },
        { root: scratch },
      );
      assert.deepEqual(forced.written, [`app/${group}/index.tsx`]);
      assert.match(fs.readFileSync(routePath, "utf8"), /HomeScreen/);
      assert.deepEqual(forced.exported, [`features/smoke-${role}-home/index.ts — exported home`]);
      assert.match(fs.readFileSync(indexPath, "utf8"), /HomeScreen/);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }

    // The tracked file was never a participant.
    assert.equal(fs.readFileSync(trackedRoute, "utf8"), tracked, "the repository was written to");
  });
}

// Composing onto an EXISTING workspace is the documented first sequence:
// `feature x --role=…` creates the workspace, then the shape is generated once
// the plan is READY. On that second run index.ts is SKIPPED because it already
// exists — and the export patch has to notice, or the route imports a screen
// the public API does not export and typecheck fails with TS2305.
// The command sequences in docs/generator.md and `pnpm generate --help` are
// what an agent copies. Two of them did not run: one omitted the now-required
// --screen on `route`, the other named a screen its own preceding examples
// never created. Prose is not executable, so this executes it.
await check("the documented command sequence runs end to end", async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kisok-docseq-"));
  try {
    const sequence = [
      { capability: "feature", feature: "catalog", options: { role: "customer" } },
      { capability: "schema", feature: "catalog", name: "catalog-response", options: {} },
      { capability: "query", feature: "catalog", name: "products", options: {} },
      { capability: "screen", feature: "catalog", name: "product-detail", options: {} },
      {
        capability: "component",
        feature: "catalog",
        name: "availability-badge",
        options: { screen: "product-detail" },
      },
      {
        capability: "route",
        feature: "catalog",
        name: "index",
        options: { role: "customer", screen: "product-detail" },
      },
    ];

    for (const request of sequence) {
      await run(request, { root: scratch });
    }

    const index = fs.readFileSync(path.join(scratch, "features", "catalog", "index.ts"), "utf8");
    assert.match(index, /ProductDetailScreen/, "the routed screen must end up public");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

await check("composing onto an existing workspace still exports the routed screen", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kisok-compose-"));
  try {
    const index = path.join(scratch, "features", "shopfront", "index.ts");
    fs.mkdirSync(path.dirname(index), { recursive: true });
    fs.writeFileSync(index, "/** doc */\nexport {};\n", "utf8");

    const request = {
      capability: "feature",
      feature: "shopfront",
      options: { role: "customer", with: ["screen", "route"] },
      root: scratch,
    };

    const result = writeFiles(planRequest(request), {
      root: scratch,
      exportScreens: publicScreensFor(request),
      feature: "shopfront",
    });

    assert.ok(
      result.skipped.includes("features/shopfront/index.ts"),
      "expected the existing index.ts to be skipped",
    );
    assert.match(
      fs.readFileSync(index, "utf8"),
      /ShopfrontScreen/,
      "the routed screen was not exported, so the generated route cannot compile",
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

await check("a route whose target screen does not exist is refused", () => {
  assert.throws(
    () =>
      planRequest({
        capability: "route",
        feature: "solo",
        name: "index",
        options: { role: "customer", screen: "not-generated-yet" },
      }),
    /No screen `not-generated-yet`/,
  );
});

await check("a route with no target screen is refused", () =>
  assert.throws(
    () =>
      planRequest({
        capability: "route",
        feature: "solo",
        name: "index",
        options: { role: "customer" },
      }),
    /needs --screen=/,
  ),
);

await check("a screen-local component whose screen does not exist is refused", () =>
  assert.throws(
    () =>
      planRequest({
        capability: "component",
        feature: "solo",
        name: "chip",
        options: { role: "customer", screen: "no-such-screen" },
      }),
    /No screen `no-such-screen`/,
  ),
);

await check("a camelCase feature name is normalised end to end", async () => {
  // Destinations always went through caseProps, but validatePlan and the export
  // patch built their paths from the RAW name — so `generate feature
  // orderHistory` planned features/order-history/... and was then rejected for
  // being "outside features/orderHistory/".
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kisok-name-"));
  try {
    const result = await run(
      { capability: "feature", feature: "orderHistory", options: { role: "customer" } },
      { root: scratch },
    );
    assert.equal(result.feature, "order-history");
    assert.ok(
      result.written.every((file) => file.startsWith("features/order-history/")),
      `wrote outside the normalised directory: ${result.written.join(", ")}`,
    );
    assert.ok(fs.existsSync(path.join(scratch, "features", "order-history", "index.ts")));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

await check("role-sensitive capabilities refuse to guess a role", () => {
  for (const capability of ["feature", "route", "realtime"]) {
    assert.throws(
      () => planRequest({ capability, feature: "solo", name: "thing", options: {} }),
      /needs an explicit --role=/,
      `${capability} accepted an unstated role`,
    );
  }

  // The rest are role-independent and still default to shared.
  assert.ok(
    planRequest({ capability: "schema", feature: "solo", name: "thing", options: {} }).length > 0,
  );
});

await check("realtime accepts preparation only", () => {
  for (const role of ["customer", "shared"]) {
    assert.throws(
      () =>
        planRequest({ capability: "realtime", feature: "solo", name: "live", options: { role } }),
      /preparation-only/,
      `realtime accepted --role=${role}`,
    );
  }

  assert.ok(
    planRequest({
      capability: "realtime",
      feature: "solo",
      name: "live",
      options: { role: "preparation" },
    }).length > 0,
  );
});

await check("feature --with=route requires a screen in the same request", () => {
  assert.throws(
    () =>
      planRequest({
        capability: "feature",
        feature: "solo",
        options: { role: "customer", with: ["route"] },
      }),
    /also needs `screen`/,
  );

  assert.ok(
    planRequest({
      capability: "feature",
      feature: "solo",
      options: { role: "customer", with: ["screen", "route"] },
    }).length > 0,
  );
});
await check("rejects an unknown capability", () =>
  assert.throws(
    () => planRequest({ capability: "nope", feature: "x", options: {} }),
    /Unknown capability/,
  ),
);
await check("rejects an unknown --with value", () =>
  assert.throws(
    () => planRequest({ capability: "feature", feature: "x", options: { with: ["nope"] } }),
    /Unknown --with/,
  ),
);
await check("rejects --with on a non-feature capability", () =>
  assert.throws(
    () => planRequest({ capability: "screen", feature: "x", options: { with: ["query"] } }),
    /--with only applies/,
  ),
);
await check("refuses realtime for the customer experience", () =>
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
    /preparation-only/,
  ),
);
await check("rejects an unknown role", () =>
  assert.throws(
    () => planRequest({ capability: "feature", feature: "x", options: { role: "admin" } }),
    /Unknown --role/,
  ),
);
await check("a feature is a workspace by default: public API plus control documents", () => {
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
// The control documents are the workflow a feature agent actually follows. If
// one of them keeps an older shape — a bare RED heading with no mode, say —
// every future feature inherits the contradiction the harness exists to remove.
await check("every control document teaches the same five verification modes", () => {
  const MODES = ["behavior", "bug", "behavior-change", "refactor", "config"];
  const rendered = planRequest({
    capability: "feature",
    feature: "modes",
    options: { role: "shared" },
  }).filter((file) => /docs\/(plan|todo|worklog)\.md$/.test(file.destination));

  assert.equal(rendered.length, 3, "expected plan, todo and worklog templates");

  for (const file of rendered) {
    const missing = MODES.filter((mode) => !file.contents.includes(mode));
    assert.deepEqual(missing, [], `${file.destination} never names: ${missing.join(", ")}`);
  }
});
// Template CONTRACTS that no generated-output check can catch, because these
// live in comments. `check:docs` cannot see them either — it scans .md and
// .md.ejs, not .ts.ejs. A wrong example in a template is copied by every future
// feature, so it is worth asserting the text directly.
await check("no template teaches a zero-argument RPC with an argument object", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ejs")) {
        const source = fs.readFileSync(full, "utf8");
        // `callRpc("name", {}, schema)` — Supabase types a zero-argument RPC as
        // `Args: never`, which `{}` does not satisfy, so this cannot compile.
        if (/callRpc\([^)]*,\s*\{\s*\}\s*,/.test(source)) {
          offenders.push(path.relative(ROOT, full));
        }
      }
    }
  };
  walk(path.join(ROOT, "tools", "generator", "templates"));

  assert.deepEqual(
    offenders,
    [],
    "a zero-argument RPC is called as callRpc(name, schema); these still pass {}",
  );
});

await check("no template repeats the false 'every RPC returns jsonb' contract", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ejs")) {
        const source = fs.readFileSync(full, "utf8");
        if (/every\s+RPC\s+returns\s+`?jsonb/i.test(source)) {
          offenders.push(path.relative(ROOT, full));
        }
      }
    }
  };
  walk(path.join(ROOT, "tools", "generator", "templates"));

  assert.deepEqual(
    offenders,
    [],
    "current_active_profile() is table-returning; not every RPC returns jsonb",
  );
});

await check("a component is feature-wide by default and screen-local with --screen", () => {
  const wide = planRequest({
    capability: "component",
    feature: "solo",
    name: "chip",
    options: { role: "customer" },
  }).map((file) => file.destination);
  assert.deepEqual(wide, ["features/solo/components/chip.tsx"]);

  // A screen-local component needs its screen to exist — otherwise it lands in a
  // directory nothing renders, which is usually a sign the tasks ran out of order.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kisok-component-"));
  const featureRoot = path.join(scratch, "features", "solo");
  try {
    fs.mkdirSync(path.join(featureRoot, "screens", "detail"), { recursive: true });
    fs.writeFileSync(
      path.join(featureRoot, "screens", "detail", "detail-screen.tsx"),
      "export function DetailScreen() {\n  return null;\n}\n",
      "utf8",
    );

    const local = planRequest({
      capability: "component",
      feature: "solo",
      name: "chip",
      options: { role: "customer", screen: "detail" },
      root: scratch,
    }).map((file) => file.destination);
    assert.deepEqual(local, ["features/solo/screens/detail/components/chip.tsx"]);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
await check("rejects --screen on anything but a component", () =>
  assert.throws(
    () =>
      planRequest({
        capability: "screen",
        feature: "x",
        name: "y",
        options: { role: "customer", screen: "z" },
      }),
    /--screen applies to `component`/,
  ),
);
await check("tests are colocated with the code they protect", () => {
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
await check("leaves no unrendered template syntax and ends every file with a newline", () => {
  for (const shape of SHAPES) {
    for (const file of planRequest(shape.request)) {
      assert.ok(!file.contents.includes("<%"), `${file.destination} still contains EJS syntax`);
      assert.ok(!file.contents.includes("NAME"), `${file.destination} has an unsubstituted NAME`);
      assert.ok(file.contents.endsWith("\n"), `${file.destination} must end with a newline`);
    }
  }
});
await check("touches no shared file beyond one route per screen", () => {
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
// End to end: generate every shape for real, prove they hold up, clean up.
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
    indexAfter.includes("SearchScreen"),
    "a follow-up route must export the screen it TARGETS from the public API",
  );

  // The other half of the contract, and the assertion that was missing: a
  // screen generated WITHOUT a route stays feature-private. `product-detail`
  // and `search-filter` were follow-ups too; only `search` got a route.
  // A duplicate of the line above used to sit here carrying a message that
  // claimed the opposite, so a regression in either direction went unnoticed.
  assert.ok(
    !indexAfter.includes("ProductDetailScreen"),
    "a screen with no route must stay feature-private",
  );
  console.log("  ok  a routed screen is exported; an unrouted one stays private");

  const rerun = await run({ ...FOLLOW_UPS[0], options: { role: "customer" } });
  assert.equal(rerun.written.length, 0, "re-running a capability overwrote existing files");
  assert.ok(rerun.skipped.length > 0, "re-run should have reported skipped files");
  console.log("  ok  re-running a capability overwrites nothing");

  shell("npx", ["tsc", "--noEmit"]);
  console.log(`  ok  all ${total} generated files typecheck`);

  const lintTargets = [
    ...SHAPE_FEATURES.map((feature) => `features/${feature}`),
    "app/(customer)/smoke-read.tsx",
    "app/(customer)/smoke-write.tsx",
    "app/(preparation)/smoke-live.tsx",
  ];
  // `--max-warnings=0`: a warning in generated code is inherited by every
  // feature built from it.
  shell("npx", ["eslint", "--max-warnings=0", ...lintTargets]);
  console.log("  ok  generated code lints clean (no warnings)");

  shell("npx", ["prettier", "--check", ...SHAPE_FEATURES.map((feature) => `features/${feature}`)]);
  console.log("  ok  generated code is formatted");

  shell("npx", [
    "jest",
    "--ci",
    "--silent",
    ...SHAPE_FEATURES.map((feature) => `features/${feature}`),
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

const BROKEN_FEATURE = "smoke-atomic"; // in SCRATCH_FEATURES
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

  await check("a template that produces invalid syntax aborts the request", () => {
    assert.ok(threw, "the generator accepted a template that produces invalid syntax");
    assert.match(threw.message, /NOTHING was written/);
  });

  await check("no partial feature is left behind", () => {
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

await check("the template was restored", () =>
  assert.equal(fs.readFileSync(brokenTemplate, "utf8"), originalTemplate),
);

// ---------------------------------------------------------------------------
// --force rollback: an OVERWRITTEN file must come back byte-for-byte.
//
// Rolling back by deleting only newly created files would leave the earlier
// ones clobbered with generated content and no way back — worse than not
// rolling back at all, and `--force` on an existing feature is a normal thing
// to run.
// ---------------------------------------------------------------------------
console.log("\nforce rollback");

const FORCE_FEATURE = "smoke-force"; // in SCRATCH_FEATURES
const forceDir = path.join(ROOT, "features", FORCE_FEATURE);

try {
  await run({
    capability: "feature",
    feature: FORCE_FEATURE,
    options: { role: "shared", with: ["schema"] },
  });

  // Make every generated file recognisably the developer's own work.
  const targets = [];
  const collect = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else targets.push(full);
    }
  };
  collect(forceDir);

  const before = new Map();
  for (const target of targets) {
    const edited = `${fs.readFileSync(target, "utf8")}\n// hand-written work that must survive\n`;
    fs.writeFileSync(target, edited, "utf8");
    before.set(target, edited);
  }

  // Force a mid-write failure: one planned destination becomes a DIRECTORY, so
  // writeFileSync throws EISDIR after earlier files have already been rewritten.
  const planned = planRequest({
    capability: "feature",
    feature: FORCE_FEATURE,
    options: { role: "shared", with: ["schema"] },
  }).map((file) => path.join(ROOT, file.destination));

  const saboteur = planned[planned.length - 1];
  fs.rmSync(saboteur, { force: true });
  fs.mkdirSync(saboteur, { recursive: true });
  before.delete(saboteur);

  let threw = null;
  try {
    await run({
      capability: "feature",
      feature: FORCE_FEATURE,
      options: { role: "shared", with: ["schema"], force: true },
    });
  } catch (error) {
    threw = error;
  }

  await check("a failed --force run reports the failure", () => {
    assert.ok(threw, "the generator reported success despite an unwritable target");
    assert.match(threw.message, /rolled back/i);
  });

  await check("every overwritten file is restored byte-for-byte", () => {
    const clobbered = [];
    for (const [target, expected] of before) {
      const actual = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "(missing)";
      if (actual !== expected) clobbered.push(path.relative(ROOT, target));
    }
    assert.deepEqual(clobbered, [], `these files were not restored: ${clobbered.join(", ")}`);
  });
} finally {
  fs.rmSync(forceDir, { recursive: true, force: true });
}

await check("the force fixture was cleaned up", () => assert.ok(!fs.existsSync(forceDir)));

// ---------------------------------------------------------------------------
// The feature's index.ts export must be INSIDE the rollback.
//
// It used to be patched after a successful write, so a later failure left
// index.ts modified while every generated file had been removed — the one case
// where "the repository is unchanged" was false.
// ---------------------------------------------------------------------------
console.log("\nexport rollback");

// The placeholder check gets its OWN root. It used to sit between the failing
// write and the restore assertion, and its last statement rewrote index.ts —
// so the restore assertion passed whether or not the rollback worked. Two
// checks sharing one mutable file is how a test launders its own evidence.
{
  const placeholderRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kisok-placeholder-"));
  try {
    const index = path.join(placeholderRoot, "features", "smoke-export", "index.ts");
    fs.mkdirSync(path.dirname(index), { recursive: true });

    await check("the workspace placeholder is replaced, not left beside a real export", () => {
      // `export {}` is what a workspace-only feature carries. A real export must
      // replace it; leaving both is valid TypeScript and reads as an oversight.
      // The semicolon is optional because a hand-edited file may not be formatted.
      for (const placeholder of ["export {};\n", "export {}\n", "export { };\n"]) {
        fs.writeFileSync(index, `/** doc */\n${placeholder}`, "utf8");
        const patch = planFeatureExport({
          root: placeholderRoot,
          feature: "smoke-export",
          screens: ["home"],
          alreadyPlanned: new Set(),
        });
        assert.doesNotMatch(patch.contents, /export\s*\{\s*\}/, placeholder);
        assert.match(patch.contents, /HomeScreen/);
      }

      // ...and an existing REAL export is kept, not swallowed.
      fs.writeFileSync(index, 'export { OneScreen } from "./screens/one/one-screen";\n', "utf8");
      const appended = planFeatureExport({
        root: placeholderRoot,
        feature: "smoke-export",
        screens: ["two"],
        alreadyPlanned: new Set(),
      });
      assert.match(appended.contents, /OneScreen/);
      assert.match(appended.contents, /TwoScreen/);
    });
  } finally {
    fs.rmSync(placeholderRoot, { recursive: true, force: true });
  }
}

const exportRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kisok-export-"));
const realWriteForExport = fs.writeFileSync;

try {
  const featureIndex = path.join(exportRoot, "features", "smoke-export", "index.ts");
  fs.mkdirSync(path.dirname(featureIndex), { recursive: true });
  fs.writeFileSync(featureIndex, "export {};\n", "utf8");
  const before = fs.readFileSync(featureIndex, "utf8");

  // The patch is appended LAST, so a failure on any EARLIER file aborts before
  // it is ever written — and "index.ts is unchanged" would then pass because
  // nothing touched it, not because the rollback worked.
  //
  // So the failure happens DURING the patch write, after its bytes have landed.
  // That is the state the rollback has to undo, and the only state that proves
  // the patch is inside the transaction rather than beside it.
  fs.writeFileSync = (target, data, ...rest) => {
    const result = realWriteForExport.call(fs, target, data, ...rest);
    if (String(target) === featureIndex) {
      throw Object.assign(new Error("EIO: simulated"), { code: "EIO" });
    }
    return result;
  };

  let threw = null;
  try {
    writeFiles(
      [{ destination: "app/(customer)/index.tsx", contents: "export default function R() {}\n" }],
      { root: exportRoot, feature: "smoke-export", exportScreens: ["home"] },
    );
  } catch (error) {
    threw = error;
  }

  fs.writeFileSync = realWriteForExport;

  // Nothing may touch featureIndex between the failure and this assertion.
  const afterRollback = fs.readFileSync(featureIndex, "utf8");

  await check("a failure during the export patch reports the failure", () => {
    assert.ok(threw, "writeFiles reported success despite a failed write");
    assert.match(threw.message, /rolled back/i);
  });

  await check("the feature index.ts is restored byte-for-byte", () =>
    assert.equal(
      afterRollback,
      before,
      "index.ts kept an export for a feature whose files were all rolled back",
    ),
  );

  await check("the created route file is removed too", () =>
    assert.ok(!fs.existsSync(path.join(exportRoot, "app", "(customer)", "index.tsx"))),
  );
} finally {
  fs.writeFileSync = realWriteForExport;
  fs.rmSync(exportRoot, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// A write that fails PART-WAY THROUGH A NEW FILE must leave nothing behind.
//
// The --force case above sabotages an existing destination, so the throw comes
// from the pre-read. This one fails inside writeFileSync itself, after bytes
// have already landed — the case where "the repository is unchanged" is
// easiest to claim falsely.
// ---------------------------------------------------------------------------
console.log("\npartial-write rollback");

const partialRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kisok-partial-"));
const realWriteFileSync = fs.writeFileSync;

try {
  let writes = 0;
  fs.writeFileSync = (target, data, ...rest) => {
    writes += 1;
    if (writes === 2) {
      // Land bytes first, then fail: a truncated file, not an absent one.
      realWriteFileSync.call(fs, target, "PARTIAL", "utf8");
      const error = new Error("ENOSPC: no space left on device");
      error.code = "ENOSPC";
      throw error;
    }
    return realWriteFileSync.call(fs, target, data, ...rest);
  };

  let threw = null;
  try {
    writeFiles(
      [
        { destination: "features/smoke-partial/a.ts", contents: "export const a = 1;\n" },
        { destination: "features/smoke-partial/b.ts", contents: "export const b = 2;\n" },
      ],
      { root: partialRoot },
    );
  } catch (error) {
    threw = error;
  }

  fs.writeFileSync = realWriteFileSync;

  await check("a partial write reports the failure", () => {
    assert.ok(threw, "writeFiles reported success despite a failed write");
    assert.match(threw.message, /rolled back/i);
  });

  await check("the truncated file is removed", () =>
    assert.ok(
      !fs.existsSync(path.join(partialRoot, "features/smoke-partial/b.ts")),
      "a half-written file survived the rollback",
    ),
  );

  await check("the earlier file is removed too", () =>
    assert.ok(
      !fs.existsSync(path.join(partialRoot, "features/smoke-partial/a.ts")),
      "a file written before the failure survived the rollback",
    ),
  );

  await check("no scaffolding directory is left behind", () =>
    assert.ok(
      !fs.existsSync(path.join(partialRoot, "features/smoke-partial")),
      "an empty generated directory survived the rollback",
    ),
  );
} finally {
  fs.writeFileSync = realWriteFileSync;
  fs.rmSync(partialRoot, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} generator check(s) failed.\n`);
  process.exit(1);
}

console.log("\nKISOK generator smoke test passed\n");
