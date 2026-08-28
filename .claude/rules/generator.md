---
paths:
  - "tools/**"
---

# The KISOK generator

`pnpm generate <capability> <feature> [name]` scaffolds feature code. It exists
to stop agents from re-inventing (or hallucinating) the architecture.

Capabilities: `feature` (a minimal workspace — `index.ts` plus `docs/`),
`schema` (into `model/`), `query`, `mutation`, `store`, `component`, `screen`,
`realtime`, `route`. Each is independent and feature-local; `feature --with=a,b,c`
composes them. `feature` alone generates NO implementation code on purpose —
planning decides the shape.

Writing is atomic: PLAN → RENDER → FORMAT/PARSE → VALIDATE → WRITE. If any
planned file is invalid, nothing is written.

## How it works

- Templates: `tools/generator/templates/<capability>/*.ejs`, EJS with YAML front
  matter.
- Front-matter keys: `destinationDir` (required), `filename`, `skip`. All three
  render through EJS first, so a template can opt itself out based on options.
- Props: `pascalCaseName`, `camelCaseName`, `kebabCaseName`, `snakeCaseName`,
  `name`, `originalName`, plus `feature`, `featurePascal`, `featureCamel`,
  `featureDir`, `role`, `routeDir`, and the `withSchema` / `withQuery` /
  `withStore` / `withScreen` flags a template uses to wire itself to siblings.
- A capability can declare `also: [...]` to share a template directory — `query`,
  `mutation` and `realtime` share one `keys.ts` template instead of three copies.
- Output is Prettier-formatted before writing, so generated code passes
  `format:check` immediately.
- Existing files are never overwritten without `--force`.

## Rules for changing templates

- **Run `pnpm generate:smoke` after every change.** It generates six materially
  different feature shapes (workspace-only, pure model, read-heavy,
  local-state-heavy, mutation-heavy, realtime) plus follow-up capabilities, and
  proves the output typechecks, lints with zero warnings, is formatted, and
  passes its own tests. It also corrupts a template deliberately and asserts
  that nothing is written. A template that merely looks right is worthless —
  every future feature inherits its output.
- **Keep templates neutral.** Do not bias them toward one feature shape. A
  capability that only makes sense for a list is the wrong abstraction; the
  generator has to serve a cart and a checkout as well as a catalog.
- Generated code must **encode the architecture**: Supabase only in `api/`,
  query keys feature-local, a public API in `index.ts`, the `docs/` control
  documents always present, tests colocated with their subject.
- Comments in templates should be **precise and few**. They exist to prevent a
  specific mistake, not to narrate. Delete a comment that no longer prevents
  anything.
- **Never make the generator edit a SHARED file.** The moment a capability
  patches a registry, a route map or a global barrel, parallel agents start
  conflicting — the problem this generator exists to avoid. The smoke test
  asserts every generated path is inside the feature or is one route file.
  The single exception is the feature's OWN `index.ts`, appended to so a
  generated route compiles. That file has exactly one owner, so it is not a
  conflict surface.
- **Realtime is Preparation-only.** Only `public.orders` is published and RLS
  gives a customer session no rows, so the generator refuses
  `realtime --role=customer` rather than emitting a subscription that can never
  fire.

## Database tooling

`tools/db/` holds the schema tooling:

- `pnpm db:verify` applies the migrations to an ephemeral PostgreSQL and proves
  `core/supabase/database.types.ts` matches the real schema. CI runs it.
- `pnpm db:types` regenerates types from the linked Supabase project.

Never hand-edit `database.types.ts`. If it disagrees with a migration, the
migration is right.

See `docs/generator.md` and `docs/adr/0005-generator.md`.
