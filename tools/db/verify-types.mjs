#!/usr/bin/env node
import path from "node:path";
import ts from "typescript";

import { ROOT, postgresAvailable, withMigratedDatabase } from "./with-migrations.mjs";

/**
 * Prove `core/supabase/database.types.ts` matches the schema the migrations
 * actually produce.
 *
 *     pnpm db:verify
 *
 * Supabase's own `supabase gen types` needs either a reachable hosted project or
 * Docker. Where neither is available — CI, a sandbox, an offline clone — this is
 * the next best thing and arguably a stronger guarantee: instead of trusting a
 * file someone generated once, every run applies the real migrations to a
 * throwaway PostgreSQL and compares the committed types against the result.
 *
 * It catches exactly the failure mode that matters: a column, enum value, or RPC
 * argument name that drifted from the schema.
 */
const TYPES_FILE = path.join(ROOT, "core", "supabase", "database.types.ts");

/** Postgres types that map to a TypeScript `number`. */
const NUMERIC = new Set(["smallint", "integer", "bigint", "numeric", "real", "double precision"]);

function readDatabaseType() {
  const program = ts.createProgram([TYPES_FILE], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(TYPES_FILE);
  if (!source) throw new Error(`Could not read ${TYPES_FILE}`);

  let databaseType;
  ts.forEachChild(source, (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === "Database") {
      databaseType = checker.getTypeAtLocation(node.name);
    }
  });
  if (!databaseType) throw new Error("No `Database` type alias found.");

  const publicType = checker.getTypeOfPropertyOfType(databaseType, "public");
  if (!publicType) throw new Error("`Database` has no `public` property.");

  const section = (name) => {
    const type = checker.getTypeOfPropertyOfType(publicType, name);
    if (!type) throw new Error(`\`Database["public"]\` has no \`${name}\` property.`);
    return type;
  };

  const propertyNames = (type) => type.getProperties().map((symbol) => symbol.getName());

  const tables = {};
  const tablesType = section("Tables");
  for (const symbol of tablesType.getProperties()) {
    const tableType = checker.getTypeOfSymbolAtLocation(symbol, source);
    const rowType = checker.getTypeOfPropertyOfType(tableType, "Row");
    if (!rowType) throw new Error(`Table ${symbol.getName()} has no Row type.`);

    tables[symbol.getName()] = Object.fromEntries(
      rowType.getProperties().map((column) => {
        const columnType = checker.getTypeOfSymbolAtLocation(column, source);
        const text = checker.typeToString(columnType);
        return [column.getName(), { nullable: /\bnull\b/.test(text), text }];
      }),
    );
  }

  const enums = {};
  for (const symbol of section("Enums").getProperties()) {
    const enumType = checker.getTypeOfSymbolAtLocation(symbol, source);
    enums[symbol.getName()] = checker
      .typeToString(enumType)
      .split("|")
      .map((value) => value.trim().replace(/^"|"$/g, ""))
      .sort();
  }

  const functions = {};
  for (const symbol of section("Functions").getProperties()) {
    const functionType = checker.getTypeOfSymbolAtLocation(symbol, source);
    const argsType = checker.getTypeOfPropertyOfType(functionType, "Args");
    functions[symbol.getName()] = argsType ? propertyNames(argsType).sort() : [];
  }

  return { tables, enums, functions };
}

async function readSchema() {
  return withMigratedDatabase(async ({ query }) => {
    const columns = query(`
      select json_agg(json_build_object(
        'table', c.table_name, 'column', c.column_name,
        'nullable', c.is_nullable = 'YES', 'type', c.data_type
      ) order by c.table_name, c.column_name)
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    `);

    const enums = query(`
      select json_agg(json_build_object('name', t.typname, 'values', v.values) order by t.typname)
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join lateral (
        select json_agg(e.enumlabel order by e.enumsortorder) as values
        from pg_enum e where e.enumtypid = t.oid
      ) v on true
      where n.nspname = 'public' and t.typtype = 'e'
    `);

    // Only functions the client is actually granted EXECUTE on are part of the
    // contract this file describes.
    // Only IN arguments belong to the call signature. A `returns table(...)`
    // function also lists its output columns in proargnames, which are part of
    // the RETURN shape, not the arguments.
    const functions = query(`
      select json_agg(json_build_object('name', p.proname, 'args', a.args) order by p.proname)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join lateral (
        select coalesce(
          array_agg(name order by ordinality) filter (where mode is null or mode in ('i','b','v')),
          array[]::text[]
        ) as args
        from unnest(
          coalesce(p.proargnames, array[]::text[]),
          coalesce(p.proargmodes, array_fill('i'::\"char\", array[coalesce(array_length(p.proargnames, 1), 0)]))
        ) with ordinality as u(name, mode, ordinality)
      ) a on true
      where n.nspname = 'public'
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    `);

    return { columns, enums, functions };
  });
}

function compare(declared, actual) {
  const problems = [];

  const actualTables = {};
  for (const row of actual.columns ?? []) {
    (actualTables[row.table] ??= {})[row.column] = row;
  }

  for (const table of Object.keys(actualTables)) {
    if (!declared.tables[table])
      problems.push(`Table "${table}" exists in the schema but not in the types.`);
  }
  for (const table of Object.keys(declared.tables)) {
    if (!actualTables[table])
      problems.push(`Table "${table}" is declared in the types but not in the schema.`);
  }

  for (const [table, columns] of Object.entries(actualTables)) {
    const declaredColumns = declared.tables[table];
    if (!declaredColumns) continue;

    for (const [column, info] of Object.entries(columns)) {
      const declaredColumn = declaredColumns[column];
      if (!declaredColumn) {
        problems.push(`${table}.${column} exists in the schema but not in the types.`);
        continue;
      }
      if (declaredColumn.nullable !== info.nullable) {
        problems.push(
          `${table}.${column} is ${info.nullable ? "nullable" : "NOT NULL"} in the schema but typed as ${declaredColumn.text}.`,
        );
      }
      const expectsNumber = NUMERIC.has(info.type);
      const declaresNumber = /\bnumber\b/.test(declaredColumn.text);
      if (expectsNumber && !declaresNumber) {
        problems.push(`${table}.${column} is ${info.type} but typed as ${declaredColumn.text}.`);
      }
    }
    for (const column of Object.keys(declaredColumns)) {
      if (!columns[column])
        problems.push(`${table}.${column} is declared in the types but not in the schema.`);
    }
  }

  for (const entry of actual.enums ?? []) {
    const declaredValues = declared.enums[entry.name];
    if (!declaredValues) {
      problems.push(`Enum "${entry.name}" exists in the schema but not in the types.`);
      continue;
    }
    const actualValues = [...entry.values].sort();
    if (JSON.stringify(declaredValues) !== JSON.stringify(actualValues)) {
      problems.push(
        `Enum "${entry.name}" values differ.\n    schema: ${actualValues.join(", ")}\n    types:  ${declaredValues.join(", ")}`,
      );
    }
  }

  for (const entry of actual.functions ?? []) {
    const declaredArgs = declared.functions[entry.name];
    if (!declaredArgs) {
      problems.push(
        `Function "${entry.name}" is executable by \`authenticated\` but missing from the types.`,
      );
      continue;
    }
    const actualArgs = [...entry.args].sort();
    if (JSON.stringify(declaredArgs) !== JSON.stringify(actualArgs)) {
      problems.push(
        `Function "${entry.name}" arguments differ.\n    schema: ${actualArgs.join(", ") || "(none)"}\n    types:  ${declaredArgs.join(", ") || "(none)"}`,
      );
    }
  }

  return problems;
}

if (!postgresAvailable()) {
  console.log("PostgreSQL is unavailable; skipping the database type check.");
  console.log("Install PostgreSQL 16 (or set KISOK_PG_BIN) to run it.");
  process.exit(0);
}

const declared = readDatabaseType();
const actual = await readSchema();
const problems = compare(declared, actual);

if (problems.length > 0) {
  console.error(`\ncore/supabase/database.types.ts does not match supabase/migrations:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    `\nThe MIGRATIONS are the source of truth. Update the types to match — never the other way round.\n`,
  );
  process.exit(1);
}

console.log(
  `Database types match the migrations (${Object.keys(declared.tables).length} tables, ` +
    `${Object.keys(declared.enums).length} enums, ${Object.keys(declared.functions).length} functions).`,
);
