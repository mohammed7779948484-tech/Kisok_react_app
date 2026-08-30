#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "node:fs";

import {
  CAPABILITIES,
  DEFAULT_WITH,
  FEATURE_CAPABILITIES,
  REALTIME_ROLES,
  ROLE_REQUIRED,
  ROLES,
  buildProps,
  planCapability,
  routeDirForRole,
} from "./capabilities.mjs";
import { GeneratorError, caseProps, formatFiles, validatePlan, writeFiles } from "./render.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const USAGE = `
KISOK generator

  pnpm generate <capability> <feature> [name] [options]

Capabilities
${Object.entries(CAPABILITIES)
  .map(([name, meta]) => `  ${name.padEnd(10)} ${meta.summary}`)
  .join("\n")}

Options
  --role=<${ROLES.join("|")}>   Which experience owns this. Decides the route group.
                                REQUIRED for ${ROLE_REQUIRED.join(", ")}; defaults to
                                shared for everything else.
  --with=<a,b,c>                For \`feature\` only: also generate these.
                                Default: nothing — a workspace, no assumed shape.
                                Available: ${FEATURE_CAPABILITIES.join(", ")}.
  --screen=<name>               For \`component\`: make it private to that screen
                                instead of shared across the feature.
                                For \`route\`: the existing screen the route
                                renders. Required for \`route\`.
  --dry-run                     Print the plan without writing anything.
  --force                       Overwrite existing files.

Feature anatomy

  features/<feature>/
    index.ts        public API — the only thing outsiders may import
    docs/           brief, plan, todo, worklog, review
    model/          types, Zod schemas, pure rules — no IO
    api/            the ONLY place Supabase may be called
    queries/        TanStack Query hooks + key factory
    state/          Zustand stores
    screens/<name>/ the screen, its test, and its own components/
    components/     UI shared by several screens in this feature

Examples
  # Start here. Creates a workspace and nothing else; planning decides the shape.
  pnpm generate feature catalog --role=customer

  # Then add exactly what the plan calls for.
  pnpm generate schema catalog catalog-response
  pnpm generate query  catalog products
  pnpm generate screen catalog product-detail --role=customer
  pnpm generate component catalog availability-badge --screen=product-detail
  pnpm generate route  catalog index --role=customer --screen=catalog-home

  # Or, when the shape is already known, compose it in one go.
  pnpm generate feature cart --role=customer --with=store,component
  pnpm generate feature preparation --role=preparation \\
    --with=schema,query,realtime,screen,route

After generating a feature, fill in docs/brief.md, then docs/plan.md.
`;

function parseArgs(argv) {
  const positional = [];
  // `role: null` means "not stated". The capabilities that depend on it reject
  // that; the rest fall back to `shared`.
  const options = { role: null, with: null, screen: null, dryRun: false, force: false };

  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg.startsWith("--role=")) options.role = arg.slice("--role=".length);
    else if (arg.startsWith("--screen=")) options.screen = arg.slice("--screen=".length);
    else if (arg.startsWith("--with="))
      options.with = arg
        .slice("--with=".length)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    else if (arg.startsWith("--")) throw new Error(`Unknown option "${arg}".`);
    else positional.push(arg);
  }

  const [capability, feature, name] = positional;
  return { capability, feature, name, options };
}

/**
 * Plan every file a request produces.
 *
 * Exported so the smoke test drives exactly the same entry point a developer
 * does — a generator verified through a different path is not verified.
 */
export function planRequest({ capability, feature, name, options, root = ROOT }) {
  if (!CAPABILITIES[capability]) {
    throw new GeneratorError(
      `Unknown capability "${capability}". Available: ${Object.keys(CAPABILITIES).join(", ")}.`,
    );
  }
  if (!feature) throw new GeneratorError(`\`${capability}\` needs a feature name.`);

  if (capability !== "feature" && options.with) {
    throw new GeneratorError("--with only applies to `pnpm generate feature`.");
  }
  if (options.screen && capability !== "component" && capability !== "route") {
    throw new GeneratorError(
      "--screen applies to `component` (make it private to that screen) and to " +
        "`route` (name the screen the route renders). Everything else is already " +
        "feature-local.",
    );
  }

  const requested = options.with ?? DEFAULT_WITH;
  const unknown = requested.filter((entry) => !FEATURE_CAPABILITIES.includes(entry));
  if (unknown.length > 0) {
    throw new GeneratorError(
      `Unknown --with value(s): ${unknown.join(", ")}. Available: ${FEATURE_CAPABILITIES.join(", ")}.`,
    );
  }

  const capabilities = capability === "feature" ? ["feature", ...requested] : [capability];

  // Role first: it decides where a route lands and whether realtime is legal, so
  // an unstated role is a silently wrong answer rather than a missing one.
  const needsRole = capabilities.filter((entry) => ROLE_REQUIRED.includes(entry));
  // `== null` deliberately: an omitted flag is `undefined` from a programmatic
  // caller and `null` from parseArgs, and both mean "not stated".
  if (needsRole.length > 0 && options.role == null) {
    throw new GeneratorError(
      `\`${needsRole.join("`, `")}\` needs an explicit --role=<${ROLES.join("|")}>.\n` +
        "It decides which route group a route lands in and whether Realtime can " +
        "receive anything at all, so there is no safe default.",
    );
  }
  const role = options.role ?? "shared";

  if (capabilities.includes("realtime") && !REALTIME_ROLES.includes(role)) {
    throw new GeneratorError(
      `Realtime is ${REALTIME_ROLES.join("/")}-only, and --role=${role} is not that.\n` +
        "Only `public.orders` is published, and RLS gives a non-Preparation session no " +
        "rows on it, so the subscription would never fire. A `shared` feature can be " +
        "reached by a customer session, which is why `shared` is rejected too.\n" +
        "Use --role=preparation, or drop `realtime`.",
    );
  }

  // A route renders a screen through the feature's public API. Without a named
  // target it used to generate its own same-named screen, which cannot express
  // `app/(customer)/index.tsx → CatalogHomeScreen` and left an unused
  // `IndexScreen` exported.
  if (capabilities.includes("route")) {
    const generatedHere = capabilities.includes("screen");

    if (capability === "route" && !options.screen) {
      throw new GeneratorError(
        "`route` needs --screen=<name>: the screen it renders.\n" +
          "  pnpm generate route catalog index --role=customer --screen=catalog-home\n" +
          "The route file is a URL segment; the screen says what it shows. They are " +
          "named independently.",
      );
    }

    if (capability === "feature" && !generatedHere) {
      throw new GeneratorError(
        "`feature --with=route` also needs `screen`: a route renders a screen " +
          "through the feature's public API, and there is none to render.\n" +
          "  --with=screen,route   generate both now\n" +
          "or generate the screen first, then " +
          "`pnpm generate route <feature> <path> --role=<role> --screen=<name>`.",
      );
    }

    // Not generated in this request, so it must already exist. A route whose
    // target is missing compiles to an import of nothing.
    if (!generatedHere) {
      const target = caseProps(options.screen).kebabCaseName;
      const featureDir = caseProps(feature).kebabCaseName;
      const screenFile = path.join(
        root,
        "features",
        featureDir,
        "screens",
        target,
        `${target}-screen.tsx`,
      );
      if (!fs.existsSync(screenFile)) {
        throw new GeneratorError(
          `No screen \`${target}\` in \`features/${featureDir}\`.\n` +
            `Expected: features/${featureDir}/screens/${target}/${target}-screen.tsx\n` +
            `Generate it first: pnpm generate screen ${featureDir} ${target} --role=${role}`,
        );
      }
    }
  }

  // A screen-local component needs its screen to exist, or it lands in a
  // directory nothing renders — usually a sign the tasks are in the wrong order.
  if (capability === "component" && options.screen) {
    const target = caseProps(options.screen).kebabCaseName;
    const featureDir = caseProps(feature).kebabCaseName;
    const screenFile = path.join(
      root,
      "features",
      featureDir,
      "screens",
      target,
      `${target}-screen.tsx`,
    );
    if (!fs.existsSync(screenFile)) {
      throw new GeneratorError(
        `No screen \`${target}\` in \`features/${featureDir}\`, so a screen-local ` +
          `component would have nothing to belong to.\n` +
          `Expected: features/${featureDir}/screens/${target}/${target}-screen.tsx\n` +
          `Generate the screen first, or drop --screen to make the component ` +
          `feature-wide.`,
      );
    }
  }

  // Templates branch on what else is being generated, so a screen created
  // alongside a query wires itself up while one created alone stays neutral.
  //
  // `withRoute` is what decides whether the feature's index.ts exports the
  // screen: a screen is FEATURE-PRIVATE unless something outside the feature
  // renders it, and the only such thing the generator creates is a route.
  const shared = {
    withSchema: capabilities.includes("schema"),
    withQuery: capabilities.includes("query"),
    withStore: capabilities.includes("store"),
    withScreen: capabilities.includes("screen"),
    withRoute: capabilities.includes("route"),
    screen: options.screen,
  };

  const files = [];
  for (const entry of capabilities) {
    const props = buildProps({
      capability: entry,
      feature,
      name,
      role,
      options: shared,
    });
    files.push(...planCapability(entry, props));
  }

  // Two capabilities can legitimately plan the same file — a feature's query and
  // its realtime hook both want keys.ts. First one wins; writeFiles then refuses
  // to overwrite anything already on disk.
  const seen = new Set();
  return files.filter((file) => {
    if (seen.has(file.destination)) return false;
    seen.add(file.destination);
    return true;
  });
}

/**
 * The screens this request must make public, and only those.
 *
 * A screen is feature-private by default. `features/<name>/index.ts` is the
 * boundary other features and routes import through, so exporting every screen
 * that happens to be generated widens the public surface for no reason and
 * makes "keep index.ts minimal" a rule the generator itself breaks.
 *
 * A route is the one thing the generator creates that lives OUTSIDE the feature
 * and renders a screen, so it is the only reason to export one.
 */
export function publicScreensFor({ capability, feature, name, options }) {
  const capabilities =
    capability === "feature" ? ["feature", ...(options.with ?? DEFAULT_WITH)] : [capability];
  if (!capabilities.includes("route")) return [];

  // `feature --with=screen,route` names both after the feature; a standalone
  // route names its target with --screen.
  return [caseProps(options.screen ?? name ?? feature).kebabCaseName];
}

/**
 * PLAN → RENDER → FORMAT/PARSE → VALIDATE → WRITE.
 *
 * Nothing reaches the repository until every planned file has rendered, parsed
 * and passed validation. A failure at any step throws, and the working tree is
 * exactly as it was.
 */
export async function run(request, { root = ROOT } = {}) {
  const planned = planRequest(request);
  const formatted = await formatFiles(planned);
  const files = validatePlan(formatted, {
    feature: request.feature,
    routeDir: routeDirForRole(request.options.role),
  });

  // A route renders its screen through the feature's public API, so a screen a
  // route targets has to be exported there or the route will not compile. This
  // is the one file the generator appends to, and it is safe to:
  // `features/<name>/index.ts` belongs to exactly one feature, so it is never a
  // cross-agent conflict the way a shared registry would be.
  //
  // It is handed to writeFiles rather than applied afterwards so it is INSIDE
  // the same rollback. Patching it after a successful write meant a failure
  // there left index.ts modified while every generated file had been removed —
  // the one case where "the repository is unchanged" was false.
  const result = writeFiles(files, {
    root,
    force: request.options.force,
    dryRun: request.options.dryRun,
    exportScreens: publicScreensFor(request),
    feature: request.feature,
  });

  return { files, ...result };
}

async function main() {
  let request;
  try {
    request = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`\n${error.message}`);
    console.error(USAGE);
    process.exit(1);
  }

  if (!request.capability || request.capability === "help" || request.capability === "--help") {
    console.log(USAGE);
    return;
  }

  let result;
  try {
    result = await run(request);
  } catch (error) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }

  const verb = request.options.dryRun ? "Would create" : "Created";
  console.log(`\n${verb} ${request.capability} "${request.name ?? request.feature}":\n`);
  for (const file of result.written) console.log(`  + ${file}`);
  for (const file of result.skipped) console.log(`  = ${file} (exists, use --force to overwrite)`);

  for (const line of result.exported) console.log(`  ~ ${line}`);

  if (request.options.dryRun) return;

  console.log(`\nNext:`);
  let step = 1;

  if (request.capability === "feature") {
    console.log(`  ${step++}. Fill in features/${request.feature}/docs/brief.md — what and why.`);
    console.log(
      `  ${step++}. Research, then write docs/plan.md with the kisok-feature-plan skill.`,
    );
    console.log(`  ${step++}. Generate the capabilities that plan calls for.`);
  } else {
    console.log(`  ${step++}. Update features/${request.feature}/docs/todo.md.`);
    console.log(`  ${step++}. Write the failing test first where the behaviour is testable.`);
  }

  console.log(`  ${step}. Run: pnpm verify\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
