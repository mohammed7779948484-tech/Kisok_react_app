#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Prove every `pnpm <name>` in a GitHub workflow really runs this project's
 * script.
 *
 *     pnpm check:ci-scripts
 *
 * pnpm has its own subcommands, and a subcommand SHADOWS a package script of
 * the same name. `pnpm doctor` ran pnpm's built-in installation check and
 * exited 0 without ever executing `tools/doctor.mjs` — a whole CI job that
 * could not fail, and would have stayed green if the script were deleted. The
 * failure is silent by construction: the command succeeds, so nothing looks
 * wrong.
 *
 * Two things are checked:
 *
 *  1. A workflow must not invoke a script whose name pnpm also owns, except
 *     through `pnpm run <name>`.
 *  2. A workflow must not invoke a `pnpm <name>` that is not a script at all —
 *     which is what a rename leaves behind.
 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = path.join(ROOT, ".github", "workflows");

const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts ?? {};

/**
 * Is `name` a pnpm subcommand?
 *
 * Probed rather than hard-coded, so the answer cannot go stale when pnpm adds
 * one. In a directory with no package.json a script name fails with
 * ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND; a subcommand does something else. The
 * empty directory is what makes this safe — the script itself can never run.
 *
 * The environment must be scrubbed of npm/pnpm variables. When this check runs
 * from inside `pnpm verify`, the inherited `npm_config_*` values point pnpm back
 * at THIS project's manifest, the missing-manifest error never appears, and
 * every script looks like a subcommand. That is exactly how this file first
 * behaved, and it is the same class of silent-wrong-answer the check exists to
 * catch.
 */
const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !/^(npm_|NPM_|PNPM_)/.test(key)),
);

function isPnpmSubcommand(name) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kisok-pnpm-probe-"));
  try {
    let output = "";
    try {
      output = execFileSync("pnpm", [name, "--help"], {
        cwd: scratch,
        env: CLEAN_ENV,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }
    return !output.includes("ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

// Prove the probe still discriminates before trusting a word it says. A name
// pnpm cannot possibly own must come back as "not a subcommand", and one it
// certainly owns must come back as "subcommand". If either is wrong the probe
// is broken, and a broken probe would otherwise report every script as shadowed
// or none of them.
if (isPnpmSubcommand("kisok-probe-canary-not-a-command")) {
  console.error(
    `\nThe pnpm subcommand probe is not working: a name pnpm cannot own was\n` +
      `reported as a subcommand, so every result would be wrong. Not guessing.\n`,
  );
  process.exit(1);
}
if (!isPnpmSubcommand("install")) {
  console.error(
    `\nThe pnpm subcommand probe is not working: \`pnpm install\` was reported as\n` +
      `NOT a subcommand, so a genuinely shadowed script would slip through.\n`,
  );
  process.exit(1);
}

const problems = [];
const checked = new Set();

const files = fs.existsSync(WORKFLOWS)
  ? fs.readdirSync(WORKFLOWS).filter((file) => /\.ya?ml$/.test(file))
  : [];

for (const file of files) {
  const lines = fs.readFileSync(path.join(WORKFLOWS, file), "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    // A comment explaining the rule is not a violation of it.
    if (/^\s*#/.test(line)) return;

    // `pnpm <name>` where <name> is not already `run`, `exec` or a flag.
    const match = /\bpnpm\s+(?!run\b|exec\b|dlx\b|-)([a-z][a-z0-9:._-]*)/.exec(line);
    if (!match) return;

    const name = String(match[1]);
    const where = `${file}:${index + 1}`;

    if (!(name in scripts)) {
      // Not ours — pnpm's own (install, exec…). Only flag a name that LOOKS
      // like one of our scripts, which is what survives a rename.
      if (name.includes(":")) {
        problems.push(
          `${where}\n    ${line.trim()}\n` +
            `    → "${name}" is not a script in package.json. It was probably renamed or removed.`,
        );
      }
      return;
    }

    if (checked.has(name)) return;
    checked.add(name);

    if (isPnpmSubcommand(name)) {
      problems.push(
        `${where}\n    ${line.trim()}\n` +
          `    → pnpm has a built-in "${name}" command, which SHADOWS the package script.\n` +
          `      This runs pnpm's own command and exits 0 without ever running\n` +
          `      "${scripts[name]}". Write \`pnpm run ${name}\`.`,
      );
    }
  });
}

// ---------------------------------------------------------------------------
// `pnpm verify` must be exactly what the CI `verify` job runs.
//
// Four documents used to describe `pnpm verify` in three different ways, and
// all of them were wrong, because the list is maintained by hand in two places
// that nothing compares. "Run pnpm verify before opening a PR" is only useful
// advice if it is the same set of checks CI will run.
// ---------------------------------------------------------------------------
const scriptNames = (command) =>
  [...command.matchAll(/\bpnpm\s+(?:run\s+)?([a-z][a-z0-9:._-]*)/g)].map((match) =>
    String(match[1]),
  );

const verifyScript = new Set(scriptNames(scripts.verify ?? ""));

const ciPath = path.join(WORKFLOWS, "ci.yml");
const ciJobVerify = new Set();
if (fs.existsSync(ciPath)) {
  const ci = fs.readFileSync(ciPath, "utf8");
  // The verify job ends where the next top-level job begins.
  const job = /\n {2}verify:\n([\s\S]*?)(?=\n {2}[a-z][a-z0-9-]*:\n)/.exec(ci)?.[1] ?? "";
  for (const line of job.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    for (const name of scriptNames(line)) {
      if (name in scripts && name !== "install" && name !== "verify") ciJobVerify.add(name);
    }
  }
}

const onlyLocal = [...verifyScript].filter((name) => !ciJobVerify.has(name)).sort();
const onlyCi = [...ciJobVerify].filter((name) => !verifyScript.has(name)).sort();

if (onlyLocal.length > 0 || onlyCi.length > 0) {
  problems.push(
    `package.json "verify" and the CI verify job do not run the same checks\n` +
      (onlyLocal.length ? `    → only in \`pnpm verify\`: ${onlyLocal.join(", ")}\n` : "") +
      (onlyCi.length ? `    → only in ci.yml: ${onlyCi.join(", ")}\n` : "") +
      `      Every document tells agents \`pnpm verify\` runs what CI runs. Make that true.`,
  );
}

if (problems.length > 0) {
  console.error(`\nCI and this project's scripts do not agree:\n`);
  for (const problem of problems) console.error(`  ${problem}\n`);
  process.exit(1);
}

console.log(
  `Workflow scripts resolve correctly and \`pnpm verify\` matches the CI verify job ` +
    `(${files.length} workflows, ${verifyScript.size} checks).`,
);
