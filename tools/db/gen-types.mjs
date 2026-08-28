#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regenerate `core/supabase/database.types.ts` from the real database.
 *
 *   pnpm db:types                          # uses the linked project
 *   SUPABASE_PROJECT_ID=abc pnpm db:types  # or name one explicitly
 *   pnpm db:types --local                  # a local `supabase start` stack
 *
 * The checked-in types file exists so typecheck and CI work without database
 * credentials. It is NOT authoritative — `supabase/migrations/*.sql` is. Run
 * this against the real project before shipping, and never hand-edit the output.
 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUTPUT = path.join(ROOT, "core", "supabase", "database.types.ts");

const HEADER = `/**
 * Supabase database types for the KISOK Lean V2 schema.
 *
 * GENERATED FILE — do not hand-edit. Regenerate with:
 *
 *     pnpm db:types
 *
 * If this disagrees with supabase/migrations/*.sql, the MIGRATIONS ARE CORRECT.
 * See docs/data-and-supabase.md.
 */
`;

const args = process.argv.slice(2);
const useLocal = args.includes("--local");
const projectId = process.env.SUPABASE_PROJECT_ID;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// `supabase` is not a project dependency — it is a developer CLI, and pinning it
// here would put a large native toolchain in every install for a command most
// contributors never run.
try {
  execFileSync("npx", ["--yes", "supabase", "--version"], { stdio: "pipe" });
} catch {
  fail(
    "The Supabase CLI is not available.\n" +
      "Install it (https://supabase.com/docs/guides/local-development/cli/getting-started), " +
      "then run `supabase link` or set SUPABASE_PROJECT_ID.",
  );
}

const target = useLocal ? ["--local"] : projectId ? ["--project-id", projectId] : ["--linked"];

console.log(`Generating types (${target.join(" ")})…`);

let output;
try {
  output = execFileSync(
    "npx",
    ["--yes", "supabase", "gen", "types", "typescript", ...target, "--schema", "public"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
} catch (error) {
  const detail = [error.stderr?.toString(), error.stdout?.toString()].filter(Boolean).join("\n");
  fail(
    `Type generation failed.\n${detail}\n\n` +
      "If the project is not linked, run `supabase link --project-ref <ref>` " +
      "or set SUPABASE_PROJECT_ID. For a local stack, run `supabase start` and pass --local.",
  );
}

if (!output.includes("export type Database")) {
  fail("The CLI produced no Database type. Nothing was written; the existing file is unchanged.");
}

fs.writeFileSync(OUTPUT, `${HEADER}\n${output.trimStart()}`, "utf8");
console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
console.log(
  "Now run `pnpm typecheck` — a schema change may have broken a Zod schema or an api module.",
);
