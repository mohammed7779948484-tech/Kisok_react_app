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
  {
    // The old pipeline made a failing test look mandatory for every task,
    // including config and docs work, where it produces a fabricated test.
    pattern: /RED\s*→\s*IMPLEMENT/,
    fix: "The task pipeline is `CLASSIFY → RED / BASELINE → IMPLEMENT → GREEN → AFFECTED CHECKS → DIFF REVIEW → GATE`. A task declares a verification mode first; only the behaviour-bearing modes need a failing test.",
  },
  {
    pattern: /\b44\s*[x×]\s*44\b|\b44dp\b/,
    fix: "The minimum touch target is 48dp — the `touch` token in tailwind.config.js. Say 48dp.",
  },
  {
    // KISOK has no pricing UI at all; an example that implies one teaches a
    // future agent to build forbidden product behaviour.
    pattern: /price-badge|pricing-rules/,
    fix: "KISOK has no pricing. Use a real KISOK concept: availability-badge, stock-status, variant-summary, option-selector, catalog-filter, order-status.",
  },
  {
    pattern:
      /\b(?:two|three|four|five|six|seven|eight|\d+)\s+(?:materially\s+)?different\s+feature\s+shapes/i,
    fix: "Do not hard-code the number of generator smoke shapes; say 'the generator smoke shapes'.",
  },
  {
    // The narrower `features/…/TODO.md` pattern missed a bare `TODO.md` in an
    // anatomy listing, which is exactly where it did survive.
    pattern: /^[\s│├└─]*TODO\.md\b/,
    fix: "A feature's working memory is `features/<name>/docs/todo.md`. There is no feature-root TODO.md.",
  },
  {
    // Same blind spot for the old test-bucket convention.
    pattern: /^[\s│├└─]*__tests__\//,
    fix: "Feature tests sit directly beside their subject — `catalog.schema.test.ts` next to `catalog.schema.ts`. Foundation and core/ suites keep their existing __tests__/.",
  },
  {
    // The generator's old populated default. `feature` now creates a workspace
    // and nothing else, so prose promising these files is an instruction to
    // expect code that will not be there.
    pattern: /schema,\s*query,\s*component,\s*screen,\s*route/,
    fix: "`pnpm generate feature` defaults to NOTHING — a workspace. Capabilities are generated one at a time as the plan calls for them.",
  },
  {
    // Expo does publish official skills, at github.com/expo/skills.
    pattern: /Expo\s+publishes\s+no\s+agent\s+skills|no\s+official\s+Expo\s+skills/i,
    fix: "Expo publishes official skills at github.com/expo/skills, under plugins/expo/skills/. expo-router and expo-dev-client are vendored here.",
  },
  {
    // `route` no longer implies a screen; it targets one by name.
    pattern: /route\s+(?:also\s+)?(?:brings|generates|creates)\s+(?:its|the)\s+screen/i,
    fix: "A route renders an EXISTING screen named with --screen=<name>. It generates only the route file.",
  },
  {
    // The five control documents live in features/<name>/docs/. A bare
    // `docs/plan.md` in a root document reads as THIS repository's docs/, and
    // an agent following it literally writes a feature's control document into
    // shared documentation — the merge-conflict hotspot everything else here is
    // shaped to avoid.
    pattern: /`docs\/(brief|plan|todo|worklog|review)\.md`/,
    unless: /features\/|feature's|the feature|docs\/…/,
    fix: 'Write `features/<name>/docs/<doc>.md`, or say "the feature\'s `docs/<doc>.md`" — the control documents are feature-local.',
  },
  {
    // A debug APK has no embedded JS bundle, so the E2E job could never have
    // reached the app. Prose that still says it assembles one teaches the
    // reasoning the release-APK change exists to refute.
    pattern: /assembles?\s+a\s+debug\s+APK/i,
    fix: 'The Android E2E job assembles a RELEASE APK. A debug APK carries no JS bundle (`debuggableVariants` defaults to ["debug"]) and would need Metro.',
  },
  {
    // `generate feature` creates a workspace, not an implementation. Describing
    // it as scaffolding a slice is what the neutral default exists to undo.
    pattern: /generate feature[^\n]*#[^\n]*(scaffold|slice|vertical)/i,
    fix: "`pnpm generate feature` creates a WORKSPACE — index.ts plus docs/ — and no implementation code.",
  },
  {
    // "One route file" was an assumption baked into the architectural headline
    // itself: a multi-screen feature legitimately owns several routes, each
    // explicitly planned in plan.md. This is the exact stale form that
    // survived a prior sweep because it read as prose, not a code example.
    pattern: /plus\s+(?:one\s+new\s+route\s+file|a\s+route\s+file)\b/i,
    fix: 'Say "plus its explicitly planned route file(s)" — a feature may own several, each named in plan.md.',
  },
];

/**
 * Documentation that describes how to work in this repository.
 *
 * `tools/generator/templates` and `features` are here because the documents a
 * feature is actually born from — the generated brief, plan, todo and worklog —
 * are documentation too. A stale pipeline in a `.md.ejs` template is worse than
 * one in `docs/`: it is copied into every future feature.
 */
const ROOTS = [
  "docs",
  ".claude",
  ".github",
  "features",
  "tools/generator/templates",
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "todo.md",
  "design.md",
];

/** Markdown, and the EJS templates that render markdown. */
const isDocument = (file) => file.endsWith(".md") || file.endsWith(".md.ejs");

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

/**
 * Directories we deliberately do not police, and why.
 *
 * The exclusion is NARROW on purpose. A previous version skipped any directory
 * named `skills`, which silently excluded all of `.claude/skills` — our own
 * workflow instructions, and the single most dangerous place for stale guidance.
 * A contradiction lived there undetected precisely because of that.
 *
 * `.agents/skills` holds skills installed from an external source
 * (`npx skills add ...`); their wording is not ours to change, and it is
 * symlinked into `.claude/skills`, so skipping the real directory also avoids
 * scanning the same file twice through the link.
 */
const VENDORED = [path.join(ROOT, ".agents", "skills")];

function isVendored(absolute) {
  const real = fs.existsSync(absolute) ? fs.realpathSync(absolute) : absolute;
  return VENDORED.some((dir) => real === dir || real.startsWith(dir + path.sep));
}

function walk(target) {
  const absolute = path.join(ROOT, target);
  if (!fs.existsSync(absolute)) return [];
  // Resolves symlinks, so a vendored skill linked into .claude/skills is
  // recognised as vendored rather than scanned as if it were ours.
  if (isVendored(absolute)) return [];
  if (fs.statSync(absolute).isFile()) return isDocument(absolute) ? [absolute] : [];

  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => (entry.name === "node_modules" ? [] : walk(path.join(target, entry.name))));
}

const files = ROOTS.flatMap(walk);
const problems = [];

for (const file of files) {
  const relative = path.relative(ROOT, file);
  if (ALLOWED.includes(relative)) continue;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { pattern, unless, fix } of OBSOLETE) {
      if (pattern.test(line) && !(unless && unless.test(line))) {
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
