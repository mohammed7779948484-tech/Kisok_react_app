#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_LAYERS,
  LAYERS,
  ROLES,
  buildProps,
  planFeature,
  writeFeature,
} from "./generators/feature.mjs";
import { formatFiles } from "./render.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const USAGE = `
KISOK Ignite — feature generator

  pnpm ignite feature <name> [options]

Options
  --role=<${ROLES.join("|")}>   Which experience owns this feature. Default: shared.
  --layers=<a,b,c>              Layers to generate. Default: ${DEFAULT_LAYERS.join(",")}.
                                Available: ${LAYERS.join(", ")}.
  --realtime                    Add a Realtime -> query invalidation hook.
                                Only meaningful for Preparation (orders).
  --no-route                    Do not create an Expo Router route file.
  --dry-run                     Print the plan without writing anything.
  --force                       Overwrite existing files.

Examples
  pnpm ignite feature catalog --role=customer
  pnpm ignite feature cart --role=customer --layers=state,components,screens,tests --no-route
  pnpm ignite feature preparation --role=preparation --realtime

After generating, open features/<name>/TODO.md and work through it.
`;

function parseArgs(argv) {
  const [command, name, ...rest] = argv;
  const options = {
    role: "shared",
    layers: DEFAULT_LAYERS,
    realtime: false,
    route: true,
    dryRun: false,
    force: false,
  };

  for (const arg of rest) {
    if (arg === "--realtime") options.realtime = true;
    else if (arg === "--no-route") options.route = false;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg.startsWith("--role=")) options.role = arg.slice("--role=".length);
    else if (arg.startsWith("--layers="))
      options.layers = arg
        .slice("--layers=".length)
        .split(",")
        .map((layer) => layer.trim())
        .filter(Boolean);
    else throw new Error(`Unknown option "${arg}".`);
  }

  return { command, name, options };
}

/** Exported so the smoke test drives the same entry point a developer does. */
export async function runFeature(name, options, { root = ROOT } = {}) {
  const props = buildProps({
    name,
    role: options.role,
    layers: options.layers,
    realtime: options.realtime,
    route: options.route,
  });

  const files = await formatFiles(planFeature(props));
  const result = writeFeature(files, {
    root,
    force: options.force,
    dryRun: options.dryRun,
  });

  return { props, files, ...result };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`\n${error.message}`);
    console.error(USAGE);
    process.exit(1);
  }

  const { command, name, options } = parsed;

  if (!command || command === "help" || command === "--help") {
    console.log(USAGE);
    return;
  }

  if (command !== "feature") {
    console.error(`\nUnknown command "${command}". Only "feature" is supported today.`);
    console.error(USAGE);
    process.exit(1);
  }

  if (!name || name.startsWith("--")) {
    console.error("\nA feature name is required, e.g. `pnpm ignite feature catalog`.");
    console.error(USAGE);
    process.exit(1);
  }

  let result;
  try {
    result = await runFeature(name, options);
  } catch (error) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }

  const verb = options.dryRun ? "Would create" : "Created";
  console.log(`\n${verb} feature "${result.props.kebabCaseName}" (${result.props.role}):\n`);
  for (const file of result.written) console.log(`  + ${file}`);
  for (const file of result.skipped) console.log(`  = ${file} (exists, use --force to overwrite)`);

  if (!options.dryRun) {
    console.log(`\nNext:`);
    console.log(`  1. Read ${result.props.featureDir}/TODO.md and turn it into a real plan.`);
    console.log(`  2. Write the failing tests first where the behaviour is testable.`);
    console.log(`  3. Run: pnpm verify\n`);
  }
}

// Only run when invoked directly, so the smoke test can import `runFeature`.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
