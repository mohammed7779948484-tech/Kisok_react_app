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
} from "./capabilities.mjs";
import { ensureFeatureExport, formatFiles, writeFiles } from "./render.mjs";

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
  --with=<a,b,c>                For \`feature\` only: capabilities to generate.
                                Default: ${DEFAULT_WITH.join(",")}.
                                Available: ${FEATURE_CAPABILITIES.join(", ")}.
  --dry-run                     Print the plan without writing anything.
  --force                       Overwrite existing files.

Examples
  # A read-heavy feature
  pnpm generate feature catalog --role=customer

  # Local state only, surfaced as a sheet rather than its own route
  pnpm generate feature cart --role=customer --with=store,component,screen

  # Live operational data
  pnpm generate feature preparation --role=preparation --with=schema,query,realtime,screen,route

  # Add one piece to an existing feature later
  pnpm generate query catalog product-detail
  pnpm generate mutation checkout submit-order
  pnpm generate store cart lines

After generating, open features/<feature>/TODO.md and work through it.
`;

function parseArgs(argv) {
  const positional = [];
  const options = { role: "shared", with: null, dryRun: false, force: false };

  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg.startsWith("--role=")) options.role = arg.slice("--role=".length);
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
    throw new Error(
      `Unknown capability "${capability}". Available: ${Object.keys(CAPABILITIES).join(", ")}.`,
    );
  }
  if (!feature) throw new Error(`\`${capability}\` needs a feature name.`);

  if (capability !== "feature" && options.with) {
    throw new Error("--with only applies to `pnpm generate feature`.");
  }

  const requested = options.with ?? DEFAULT_WITH;
  const unknown = requested.filter((entry) => !FEATURE_CAPABILITIES.includes(entry));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown --with value(s): ${unknown.join(", ")}. Available: ${FEATURE_CAPABILITIES.join(", ")}.`,
    );
  }

  const capabilities = capability === "feature" ? ["feature", ...requested] : [capability];

  if (capabilities.includes("realtime") && options.role === "customer") {
    throw new Error(
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

export async function run(request, { root = ROOT } = {}) {
  const files = await formatFiles(planRequest(request));
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
    console.log(
      `  ${step++}. Read features/${request.feature}/TODO.md and turn it into a real plan.`,
    );
    console.log(`  ${step++}. Write the failing tests first where the behaviour is testable.`);
  } else {
    console.log(`  ${step++}. Update features/${request.feature}/TODO.md.`);
  }

  console.log(`  ${step}. Run: pnpm verify\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
