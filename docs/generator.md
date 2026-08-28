# The KISOK generator

```bash
pnpm generate <capability> <feature> [name] [options]
```

Scaffolds feature code that already follows this project's architecture. It
exists so implementing a feature never requires re-deriving — or guessing at —
where things go.

It is **composable**: a feature is assembled from independent capabilities, so
the generator fits a read-heavy catalog, a local-state cart, a mutation-heavy
checkout, and a Realtime preparation board equally well.

## Capabilities

| Capability  | Produces                                                                  |
| ----------- | ------------------------------------------------------------------------- |
| `feature`   | The shell: public API and `TODO.md`. Orchestrates the rest via `--with`.  |
| `schema`    | A Zod schema validating one payload, plus its test.                       |
| `query`     | A read: an `api/` function, a query hook, and the feature's query keys.   |
| `mutation`  | A write: an `api/` function and a mutation hook with invalidation.        |
| `store`     | A Zustand store for client-owned state, with explicit persistence status. |
| `component` | A presentational, feature-private component.                              |
| `screen`    | A screen composing the feature's hooks, plus its test.                    |
| `realtime`  | A Realtime subscription that invalidates a query.                         |
| `route`     | A thin Expo Router route.                                                 |

Each is independent and feature-local. `feature` runs several at once; the rest
can be added to an existing feature at any time.

## Options

| Option                                 | Default                               | Effect                                             |
| -------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| `--role=customer\|preparation\|shared` | `shared`                              | Which experience owns it. Decides the route group. |
| `--with=a,b,c`                         | `schema,query,component,screen,route` | `feature` only: which capabilities to generate.    |
| `--dry-run`                            | off                                   | Print the plan, write nothing.                     |
| `--force`                              | off                                   | Overwrite existing files.                          |

## Examples

Four materially different feature shapes, all first-class:

```bash
# Read-heavy — a catalog
pnpm generate feature catalog --role=customer

# Local-state-heavy — a cart, surfaced as a sheet rather than its own route
pnpm generate feature cart --role=customer --with=store,component,screen

# Mutation-heavy — a checkout with its own state machine
pnpm generate feature checkout --role=customer --with=schema,mutation,store,screen,route

# Query + mutation + live updates — the preparation board
pnpm generate feature preparation --role=preparation \
  --with=schema,query,mutation,realtime,screen,route
```

Adding pieces later:

```bash
pnpm generate query catalog product-detail
pnpm generate mutation checkout submit-order
pnpm generate component catalog product-card
pnpm generate screen catalog search
pnpm generate route catalog search --role=customer
```

## What you get

`pnpm generate feature catalog --role=customer`:

```
features/catalog/
├── index.ts                          public API — the only external surface
├── TODO.md                           your working memory for this feature
├── schemas/catalog-schema.ts         Zod validation for one payload
├── api/fetch-catalog.ts              the ONLY place that calls Supabase
├── queries/keys.ts                   feature-local query keys
├── queries/use-catalog.ts            TanStack Query hook
├── components/catalog.tsx            presentational, feature-private
├── screens/catalog-screen.tsx        loading / error / content
└── __tests__/
    ├── catalog-schema.test.ts
    └── catalog-screen.test.tsx
app/(customer)/catalog.tsx            thin route
```

The generated code is not filler. It compiles, lints without warnings, is
Prettier-formatted, and its tests pass immediately — so `pnpm verify` is green
before you have written a line, and stays a meaningful signal while you work.

## No central files to edit

Generating touches **only the feature's own directory plus, for a route, one
Expo Router file**. There is deliberately no feature registry, no global barrel,
no route map, and no shared query-key file — each would be a merge conflict every
time two agents worked at once. Expo Router's file-based routing means adding a
route file _is_ the registration.

The generator also never edits a file it did not create. It will not touch your
`index.ts` to add an export, and re-running a capability skips anything already
on disk unless you pass `--force`.

**If you extend the generator, do not break this.** The smoke test asserts it.

## After generating

1. **Read `features/<feature>/TODO.md`** and expand it into a real plan.
2. **Read the migration** for the contract you are about to use.
3. Replace the placeholder Zod schema with the real payload shape.
4. Write the failing tests, then implement.
5. Export what other features need from `index.ts`.
6. Keep the TODO updated **with evidence**.
7. `pnpm verify`.

See [feature-workflow.md](./feature-workflow.md).

## How it works

- Templates live in `tools/generator/templates/<capability>/*.ejs` — EJS with
  YAML front matter.
- Front-matter keys: `destinationDir` (required), `filename`, `skip`. All three
  are rendered through EJS first, so a template can opt itself out based on the
  options.
- Props available in templates: `pascalCaseName`, `camelCaseName`,
  `kebabCaseName`, `snakeCaseName`, `name`, `originalName`, plus `feature`,
  `featurePascal`, `featureCamel`, `featureDir`, `role`, `routeDir`, and the
  `withSchema` / `withQuery` / `withStore` / `withScreen` flags that let a
  template wire itself to its siblings.
- A capability can declare `also: [...]` to pull in a shared template directory —
  `query`, `mutation` and `realtime` all share one `keys.ts` template rather than
  keeping three copies that drift.
- Output is formatted with the project's own Prettier config before it is written.

These conventions were modelled on Infinite Red's `ignite-cli`, which is a good
design. The implementation is project-owned — see
[adr/0005-generator.md](./adr/0005-generator.md).

## Changing the templates

```bash
pnpm generate:smoke
```

Generates **four materially different feature shapes** plus follow-up
capabilities, then proves the output typechecks, lints with zero warnings, is
formatted, and passes its own tests — and that re-running overwrites nothing.
Then it removes everything.

**Run it after every template change.** A template that merely looks right is
worthless when every future feature inherits its output. CI runs it on every PR.
