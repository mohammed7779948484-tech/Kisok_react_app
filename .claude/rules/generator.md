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

**The Lead runs these, just-in-time**: each planned command immediately before
the task that needs it, never all of them up front. An implementer does not run
the generator, and does not hand-write a file a capability would have produced.

Writing is atomic: PLAN → RENDER → FORMAT/PARSE → VALIDATE → WRITE. If any
planned file is invalid, nothing is written — and that includes the feature's
own `index.ts`, which is planned as an ordinary file so it shares the same
rollback. A failure leaves the repository exactly as it was.

## How it works

- Templates: `tools/generator/templates/<capability>/*.ejs`, EJS with YAML front
  matter.
- Front-matter keys: `destinationDir` (required), `filename`, `skip`. All three
  render through EJS first, so a template can opt itself out based on options.
- Props: `pascalCaseName`, `camelCaseName`, `kebabCaseName`, `snakeCaseName`,
  `name`, `originalName`, plus `feature`, `featurePascal`, `featureCamel`,
  `featureDir`, `role`, `routeDir`, `targetScreenKebab` / `targetScreenPascal`
  (the screen a route renders), and the `withSchema` / `withQuery` /
  `withStore` / `withScreen` / `withRoute` flags.
- **Those `with*` flags describe the SAME request only.** A query generated
  after a schema does not detect that schema, and a screen generated later does
  not detect an existing query — the scaffold is neutral and the implementation
  task wires the planned siblings. That is deliberate: filesystem introspection
  would guess, and a wrong guess is harder to notice than an unwired scaffold.
  `route` is the exception, because a route cannot be structurally valid without
  a target screen, so it takes one explicitly.
- A capability can declare `also: [...]` to share a template directory — `query`,
  `mutation` and `realtime` share one `keys.ts` template instead of three copies.
- Output is Prettier-formatted before writing, so generated code passes
  `format:check` immediately.
- Existing files are never overwritten without `--force`.

## Rules for changing templates

- **Run `pnpm generate:smoke` after every change.** It generates materially
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
  asserts every generated path is inside the feature or is a route file.
  The single exception is the feature's OWN `index.ts`, appended to so a
  generated route compiles. That file has exactly one owner, so it is not a
  conflict surface.
- **Realtime is Preparation-only, and that includes `shared`.** Only
  `public.orders` is published, and RLS gives a non-Preparation session no rows
  on it. `realtime` accepts `--role=preparation` and rejects both `customer` and
  `shared` — a shared feature can be reached by a customer session, where the
  subscription can never fire.
- **Role-sensitive capabilities require an explicit `--role`**: `feature`,
  `route` and `realtime`. This catches an UNSTATED role, not a contradictory
  one — no feature records its role, so a `shared` feature can still be given a
  Preparation realtime hook. The plan's route table is what keeps a feature
  coherent; RLS is what keeps it safe. It used to default to `shared`, which meant
  `pnpm generate route x y` silently wrote into top-level `app/` instead of a
  role group. A default that is wrong most of the time is worse than none. Every
  other capability is role-independent and still defaults to `shared`.
- **A route targets a named EXISTING screen**: `--screen=<name>`, required. The
  route file's name is a URL segment; the screen's name says what it shows.
  Route generation refuses when the target is missing, and
  `feature --with=route` refuses without `screen` in the same request.
- **Screens are feature-private by default.** `features/<name>/index.ts` only
  gains an export when a route renders that screen, because a route is the one
  thing the generator creates that lives outside the feature. `generate screen`
  alone does not widen the public API.

## Database tooling

`tools/db/` holds the schema tooling:

- `pnpm db:verify` applies the migrations to an ephemeral PostgreSQL and proves
  `core/supabase/database.types.ts` matches the real schema. CI runs it.
- `pnpm db:types` regenerates types from the linked Supabase project.

Never hand-edit `database.types.ts`. If it disagrees with a migration, the
migration is right.

See `docs/generator.md` and `docs/adr/0005-generator.md`.
