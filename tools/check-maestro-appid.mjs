#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Prove every Maestro flow targets the application id this app actually builds.
 *
 *     pnpm check:e2e-appid
 *
 * The flows write the id out rather than interpolating it, because Maestro only
 * substitutes `${VAR}` from values passed with `-e` — a shell environment
 * variable is left as a literal, and the failure looks like "app not installed"
 * long after the build succeeded. Writing it out is deterministic; this guard is
 * what stops it drifting from app.config.ts.
 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FLOWS = path.join(ROOT, ".maestro", "flows");

const config = fs.readFileSync(path.join(ROOT, "app.config.ts"), "utf8");
const bundleId = /const BUNDLE_ID = "([^"]+)"/.exec(config)?.[1];
if (!bundleId) {
  console.error("Could not find BUNDLE_ID in app.config.ts.");
  process.exit(1);
}

/**
 * Recurse and accept both extensions, because `maestro test .maestro/flows`
 * does. A guard narrower than the thing it guards passes while the real run
 * fails, which is worse than no guard at all.
 */
function collectFlows(dir, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? path.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) return collectFlows(path.join(dir, entry.name), relative);
    return /\.ya?ml$/.test(entry.name) ? [relative] : [];
  });
}

const problems = [];
const flows = collectFlows(FLOWS);

// A check that passes because it found nothing to check is the failure mode
// this whole repository is trying to eliminate.
if (flows.length === 0) {
  console.error(`\nNo Maestro flows found under ${path.relative(process.cwd(), FLOWS)}.\n`);
  console.error(`  CI runs \`maestro test .maestro/flows\`, which would fail too. If the`);
  console.error(`  flows moved, update this check; if they were deleted, remove the job.\n`);
  process.exit(1);
}

for (const flow of flows) {
  const source = fs.readFileSync(path.join(FLOWS, flow), "utf8");
  const appId = /^appId:\s*(\S+)/m.exec(source)?.[1];

  if (!appId) problems.push(`${flow} declares no appId.`);
  else if (appId.includes("${"))
    problems.push(
      `${flow} interpolates its appId (${appId}). Maestro only substitutes values ` +
        `passed with -e, so this stays a literal at run time. Write the id out.`,
    );
  else if (appId !== bundleId)
    problems.push(`${flow} targets "${appId}" but app.config.ts builds "${bundleId}".`);
}

if (problems.length > 0) {
  console.error(`\nMaestro flows do not match the app this project builds:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(`Maestro flows target ${bundleId} (${flows.length} flow(s) checked).`);
