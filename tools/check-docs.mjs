#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Fail when documentation describes a workflow the repository no longer has.
 *
 *     pnpm check:docs
 *
 * Stale instructions are worse than missing ones. An agent that reads
 * `pnpm generate feature x --layers=...` will run it, get an error, and then
 * improvise — which is exactly the freelancing the agent harness exists to
 * prevent. Prose drifts silently because nothing executes it, so this is the
 * only thing standing between a rename and a document that lies for months.
 *
 * Add a pattern here whenever you rename a command, move a directory, or change
 * a workflow. Each one needs a `fix` explaining what to write instead.
 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const OBSOLETE = [
  {
    pattern: /pnpm\s+ignite\b|ignite:smoke/i,
    fix: "The generator is `pnpm generate <capability> <feature> [name]`.",
  },
  {
    pattern: /--layers=/,
    fix: "`--layers` was replaced by `--with=`. See `pnpm generate --help`.",
  },
  {
    pattern: /--no-route\b/,
    fix: "`--no-route` is gone: a route is a capability, so simply omit `route` from --with.",
  },
  {
    pattern: /features\/[^\s`)]*\/TODO\.md|features\/<[^>]+>\/TODO\.md/,
    fix: "Feature control documents live in `features/<name>/docs/` — todo.md, brief.md, plan.md, worklog.md, review.md.",
  },
  {
    pattern: /features\/[^\s`)]*\/schemas\/|^\s*├──\s*schemas\//m,
    fix: "Zod schemas live in the feature's `model/` directory, named `<name>.schema.ts`.",
  },
  {
    pattern: /screens\/[a-z0-9-]+-screen\.tsx/,
    fix: "A screen owns a directory: `screens/<name>/<name>-screen.tsx`, with its test and its own components/ beside it.",
  },
  {
    pattern: /features\/[^\s`)]*\/__tests__|^\s*├──\s*__tests__\//m,
    fix: "Feature tests are colocated with their subject, not in a __tests__ bucket.",
  },
  {
    pattern: /\b\d+\s+tests?\s+across\s+\d+\s+suites?\b/i,
    fix: "Do not hard-code a test count in prose; it is stale the next time anyone adds a test.",
  },
  {
    pattern: /callRpc\([^)]*\{\s*\}\s*,/,
    fix: "A zero-argument RPC is typed `Args: never`; call it as `callRpc(name, schema)` with no argument object.",
  },
];

/** Documentation that describes how to work in this repository. */
const ROOTS = ["docs", ".claude", "AGENTS.md", "CLAUDE.md", "README.md", "todo.md", "design.md"];

/**
 * Deliberate exceptions, with a reason. A historical record is allowed to
 * describe what things used to be called — that is its job.
 */
const ALLOWED = [
  // Explains why the generator is project-owned rather than the ignite package.
  "docs/adr/0005-generator.md",
  "docs/adr/README.md",
  // Records the anatomy change itself, including the names it replaced.
  "docs/adr/0009-feature-anatomy.md",
];

function walk(target) {
  const absolute = path.join(ROOT, target);
  if (!fs.existsSync(absolute)) return [];
  if (fs.statSync(absolute).isFile()) return absolute.endsWith(".md") ? [absolute] : [];

  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) =>
    // Skills installed from an external source are not ours to police.
    entry.name === "node_modules" || entry.name === "skills"
      ? []
      : walk(path.join(target, entry.name)),
  );
}

const files = ROOTS.flatMap(walk);
const problems = [];

for (const file of files) {
  const relative = path.relative(ROOT, file);
  if (ALLOWED.includes(relative)) continue;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { pattern, fix } of OBSOLETE) {
      if (pattern.test(line)) {
        problems.push(`${relative}:${index + 1}\n    ${line.trim()}\n    → ${fix}`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error(`\nDocumentation describes a workflow this repository no longer has:\n`);
  for (const problem of problems) console.error(`  ${problem}\n`);
  console.error(
    `Update the prose. If a mention is deliberate — an ADR recording what changed —\n` +
      `add the file to ALLOWED in tools/check-docs.mjs with the reason.\n`,
  );
  process.exit(1);
}

console.log(`Documentation matches the current workflow (${files.length} files checked).`);
