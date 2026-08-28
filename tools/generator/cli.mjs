#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAPABILITIES,
  DEFAULT_WITH,
  FEATURE_CAPABILITIES,
  ROLES,
  buildProps,
  planCapability,
  routeDirForRole,
} from "./capabilities.mjs";
import {
  GeneratorError,
  ensureFeatureExport,
  formatFiles,
  validatePlan,
  writeFiles,
} from "./render.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const USAGE = `
KISOK generator

  pnpm generate <capability> <feature> [name] [options]

Capabilities
${Object.entries(CAPABILITIES)
  .map(([name, meta]) => `  ${name.padEnd(10)} ${meta.summary}`)
  .join("\n")}

Options
  --role=<${ROLES.join("|")}>   Which experience owns this. Decides the route group. Default: shared.
  --with=<a,b,c>                For \`feature\` only: also generate these.
                                Default: nothing — a workspace, no assumed shape.
                                Available: ${FEATURE_CAPABILITIES.join(", ")}.
  --screen=<name>               For \`component\` only: make it private to that
                                screen instead of shared across the feature.
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
  pnpm generate component catalog price-badge --screen=product-detail
  pnpm generate route  catalog index --role=customer

  # Or, when the shape is already known, compose it in one go.
  pnpm generate feature cart --role=customer --with=store,component
  pnpm generate feature preparation --role=preparation \\
    --with=schema,query,realtime,screen,route

After generating a feature, fill in docs/brief.md, then docs/plan.md.
`;

function parseArgs(argv) {
  const positional = [];
  const options = { role: "shared", with: null, screen: null, dryRun: false, force: false };

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
export function planRequest({ capability, feature, name, options }) {
  if (!CAPABILITIES[capability]) {
    throw new GeneratorError(
      `Unknown capability "${capability}". Available: ${Object.keys(CAPABILITIES).join(", ")}.`,
    );
  }
  if (!feature) throw new GeneratorError(`\`${capability}\` needs a feature name.`);

  if (capability !== "feature" && options.with) {
    throw new GeneratorError("--with only applies to `pnpm generate feature`.");
  }
  if (options.screen && capability !== "component") {
    throw new GeneratorError(
      "--screen only applies to `pnpm generate component`. A screen-local component " +
        "lives beside its screen; everything else is already feature-local.",
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

  if (capabilities.includes("realtime") && options.role === "customer") {
    throw new GeneratorError(
      "Realtime is not available to the customer experience.\n" +
        "Only `public.orders` is published, and RLS gives a customer session no rows on it, " +
        "so the subscription would never fire. Use --role=preparation, or drop `realtime`.",
    );
  }

  // Templates branch on what else is being generated, so a screen created
  // alongside a query wires itself up while one created alone stays neutral.
  const shared = {
    withSchema: capabilities.includes("schema"),
    withQuery: capabilities.includes("query"),
    withStore: capabilities.includes("store"),
    withScreen: capabilities.includes("screen"),
    screen: options.screen,
  };

  const files = [];
  for (const entry of capabilities) {
    const props = buildProps({
      capability: entry,
      feature,
      name,
      role: options.role,
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

  const result = writeFiles(files, {
    root,
    force: request.options.force,
    dryRun: request.options.dryRun,
  });

  // A route renders its screen through the feature's public API, so a screen
  // added to an EXISTING feature has to be exported there or the route will not
  // compile. This is the one file the generator appends to, and it is safe to:
  // `features/<name>/index.ts` belongs to exactly one feature, so it is never a
  // cross-agent conflict the way a shared registry would be.
  const exported = ensureFeatureExport(files, {
    root,
    feature: request.feature,
    dryRun: request.options.dryRun,
    alreadyWritten: result.written,
  });

  return { files, ...result, exported };
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
