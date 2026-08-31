# 0008 — Verify the database types against the migrations

**Status:** accepted · **Date:** 2026-08

## Context

`core/supabase/database.types.ts` describes the entire data contract. It has to
be correct: a wrong column name or RPC argument surfaces as a runtime failure
deep inside a feature, and every feature agent trusts it.

Supabase's own `supabase gen types typescript` is the right tool, and it needs
either a reachable hosted project or Docker to run `postgres-meta` locally. This
build environment has neither — `api.supabase.com` and the Docker registry are
both blocked by its egress proxy — so the file was originally derived by hand
from the migrations. An external review found three wrong RPC argument names in
it, which is exactly the failure mode you would predict.

"Regenerate it before shipping" is not a control. Nobody re-verifies a file that
looks generated.

**Update.** The types are no longer hand-derived: they were later produced by
Supabase's own generator against the deployed project and committed verbatim.
That did not make this decision obsolete — it confirmed it. The hand-derived
file was missing two RPCs that the migrations define, which the verifier had not
caught because it only compared in one direction. Generation fixes the file;
only the check keeps it correct as migrations change.

## Decision

Keep the checked-in types file, and **prove it matches the schema on every CI
run** rather than trusting whoever last generated it.

`pnpm db:verify` (`tools/db/verify-types.mjs`):

1. starts an ephemeral PostgreSQL cluster,
2. creates the small slice of the Supabase platform the migrations need — roles,
   `auth.users`, `auth.uid()`, the Realtime publication (`supabase-bootstrap.sql`),
3. applies all migrations in order,
4. reads the committed `Database` type with the TypeScript compiler API,
5. compares it against `information_schema` and `pg_catalog`: tables, columns,
   nullability, numeric types, enum values, and the argument names of every
   function `authenticated` may execute.

`pnpm db:types` remains the path to Supabase's own generator when a project is
reachable, and stays authoritative when the deployed schema may differ from what
is committed here.

## Consequences

- The types are provably a function of the migrations, checked continuously
  rather than once. This is arguably a stronger guarantee than a generated file
  nobody re-runs.
- It also proves the **migrations still apply cleanly**, which nothing else did.
- Verified against real failure modes: renaming an RPC argument, flipping a
  column's nullability, and dropping an enum value are each caught.
- Requires PostgreSQL 16 locally. Where it is absent the check skips with a
  message rather than failing, so a contributor without it is not blocked.
- The bootstrap file is a test fixture, not a Supabase reimplementation, and must
  never be applied to a real project.
