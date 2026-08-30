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
| `feature`   | A WORKSPACE: `index.ts` plus `docs/` — and no implementation code.        |
| `schema`    | A Zod schema validating one payload, plus its test.                       |
| `query`     | A read: an `api/` function, a query hook, and the feature's query keys.   |
| `mutation`  | A write: an `api/` function and a mutation hook with invalidation.        |
| `store`     | A Zustand store for client-owned state, with explicit persistence status. |
| `component` | A presentational, feature-private component.                              |
| `screen`    | A screen composing the feature's hooks, plus its test.                    |
| `realtime`  | A Realtime subscription that invalidates a query.                         |
| `route`     | A thin Expo Router route rendering an EXISTING, named screen.             |

Each is independent and feature-local. `feature` can run several at once via
`--with`; the rest can be added to an existing feature at any time.

**The normal agent workflow is one capability at a time, just-in-time.** The
Lead maps each command to a task in `plan.md` and runs it immediately before
delegating that task. `feature --with=...` stays available for a shape that is
genuinely known and cohesive up front, but bulk-generating a feature's future
tree is not the expected path: it fills the directory with files no plan
justifies yet.

**Generator-first.** If a capability matches, use it. Hand-writing a file a
capability would have produced is how two features end up with different shapes
for the same thing. Manual artifacts are legitimate when no capability fits, the
path and purpose are planned, and the file is inside the task's allowed scope —
domain rules, selectors, state-machine helpers, mappers, predicates, and
behaviour-specific tests.

**Follow-up capabilities do not discover their siblings.** `withSchema`,
`withQuery`, `withStore` and `withScreen` describe what is being generated in
the SAME request. Generating a schema now and a query later produces a neutral
query scaffold — it does not detect and wire itself to the existing schema, and
a later screen does not detect an existing query. The implementation task wires
the planned siblings together. That is deliberate: filesystem introspection
would guess, and a wrong guess is harder to spot than an unwired scaffold. Route
is the exception, because a route cannot be structurally valid without a target
screen, which is why it takes one explicitly.

## Options

| Option                                 | Default                                                   | Effect                                                                                  |
| -------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `--role=customer\|preparation\|shared` | none for `feature`/`route`/`realtime`; `shared` elsewhere | Which experience owns it. Decides the route group.                                      |
| `--with=a,b,c`                         | nothing                                                   | `feature` only: which capabilities to generate alongside it.                            |
| `--screen=<name>`                      | none                                                      | `component`: make it private to that screen. `route`: the screen it renders — REQUIRED. |
| `--dry-run`                            | off                                                       | Print the plan, write nothing.                                                          |
| `--force`                              | off                                                       | Overwrite existing files.                                                               |

### Roles are explicit where they matter

`feature`, `route` and `realtime` **require** `--role`. It used to default to
`shared`, which meant `pnpm generate route x y` silently wrote into top-level
`app/` instead of a role group, and `pnpm generate realtime x y` slipped past
the Realtime guard by not being a customer. A default that is wrong most of the
time is worse than none. Every other capability is role-independent and still
defaults to `shared`.

`realtime` accepts **`preparation` only**. Only `public.orders` is published and
RLS gives everyone else no rows, so `customer` and `shared` are both rejected —
a shared feature can be reached by a customer session, where the subscription
could never fire.

### A route names the screen it renders

```bash
pnpm generate route catalog index --role=customer --screen=catalog-home
#   → app/(customer)/index.tsx rendering CatalogHomeScreen
```

The route file's name is a URL segment; the screen's name says what it shows.
They are named independently, which is what makes
`app/(customer)/index.tsx → CatalogHomeScreen` expressible at all — the route
used to generate its own same-named screen, leaving an unused `IndexScreen`.

Route generation refuses when the target screen does not exist, and
`feature --with=route` refuses unless `screen` is in the same request.

### Screens are private by default

`pnpm generate screen` creates a **feature-private** screen: nothing is added to
`features/<name>/index.ts`. A screen becomes public only when a route renders
it, because a route is the only thing the generator creates that lives outside
the feature. `feature --with=screen` alone does not widen the public API;
`feature --with=screen,route` does, for that screen.

Any other cross-feature export is an explicit, planned decision — not something
the generator does for you.

## Examples

Materially different feature shapes, all first-class:

The workspace first, then one capability per task as the plan calls for it:

```bash
pnpm generate feature catalog --role=customer         # workspace only
# ... research, brief, plan READY ...
pnpm generate schema  catalog catalog-response        # before T01
pnpm generate query   catalog products                # before T02
pnpm generate screen  catalog catalog-home --role=customer   # before T03
pnpm generate route   catalog index --role=customer --screen=catalog-home  # before T04
```

`--with` composes a shape that is genuinely known up front:

```bash
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
pnpm generate screen catalog search --role=customer
pnpm generate component catalog search-filter --screen=search
pnpm generate route catalog search --role=customer --screen=search
```

## What you get

`pnpm generate feature catalog --role=customer` creates a **workspace**, and
nothing else:

```
features/catalog/
├── index.ts        public API — the only external surface
└── docs/
    ├── brief.md    WHAT: objective, acceptance criteria, scope
    ├── plan.md     HOW: contracts, decisions, rounds and tasks
    ├── todo.md     execution state and gates
    ├── worklog.md  evidence per task
    └── review.md   independent review findings
```

This is deliberate. The old default generated a schema, a query, a component, a
screen and a route — which quietly assumed every feature is a read-heavy routed
screen. Cart is local state, Checkout is a mutation state machine, and a
domain-only feature has no UI at all; each of those began by deleting files.

Plan first, then generate what the plan calls for:

```bash
pnpm generate schema catalog catalog-response
pnpm generate query  catalog products
pnpm generate screen catalog product-detail --role=customer
pnpm generate component catalog availability-badge --screen=product-detail
pnpm generate route  catalog index --role=customer
```

Which fills in the anatomy:

```
features/catalog/
├── index.ts
├── docs/
├── model/                            pure domain: types, schemas, rules — no IO
│   ├── catalog-response.schema.ts
│   └── catalog-response.schema.test.ts
├── api/fetch-products.ts             the ONLY place that calls Supabase
├── queries/
│   ├── keys.ts                       feature-local query keys
│   └── use-products.ts               TanStack Query hook
├── state/                            Zustand stores, when the feature owns state
├── screens/product-detail/           a screen owns a directory
│   ├── product-detail-screen.tsx
│   ├── product-detail-screen.test.tsx
│   └── components/availability-badge.tsx  private to THIS screen
└── components/                       shared by several screens in this feature
app/(customer)/index.tsx              thin route
```

Tests sit beside the code they protect, not in a `__tests__` bucket — a
colocated test gets updated when its subject changes; a distant one rots.

The generated code is not filler. It compiles, lints without warnings, is
Prettier-formatted, and its tests pass immediately — so `pnpm verify` is green
before you have written a line, and stays a meaningful signal while you work.

## Where a component belongs

Ownership follows the nearest stable consumer, and the generator can put it
there directly rather than making you move it afterwards:

| Used by                        | Command                                                                      | Lands in                             |
| ------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------ |
| One screen                     | `pnpm generate component catalog availability-badge --screen=product-detail` | `screens/product-detail/components/` |
| Several screens in the feature | `pnpm generate component catalog product-card`                               | `features/catalog/components/`       |
| Several features               | not generated — see `kisok-design-system` before promoting                   | `components/`                        |

## No central files to edit

Generating touches **only the feature's own directory plus, for a route, one
Expo Router file per route**. There is deliberately no feature registry, no global barrel,
no route map, and no shared query-key file — each would be a merge conflict every
time two agents worked at once. Expo Router's file-based routing means adding a
route file _is_ the registration.

The generator writes new files and, in exactly one case, appends to the
feature's own `index.ts`: when a `route` targets a screen in an existing
feature, that screen's export is appended so the route compiles. A screen
generated without a route does not touch it. That file belongs to a
single feature, so unlike a shared registry it is never a cross-agent conflict.
It appends only when the export is missing, never reorders, and never rewrites
existing lines — and reports it:

```
  + features/catalog/screens/search/search-screen.tsx
  + app/(customer)/search.tsx
  ~ features/catalog/index.ts — added SearchScreen
```

Nothing else is ever modified. Re-running a capability skips anything already on
disk unless you pass `--force`.

**If you extend the generator, do not break this.** The smoke test asserts it.

## Nothing is written unless everything is valid

The generator runs PLAN → RENDER → FORMAT/PARSE → VALIDATE → WRITE, and it is
all-or-nothing. A template whose output cannot be parsed aborts the request; a
plan that would write outside the feature is rejected; a write that fails
part-way is rolled back, directories included.

A half-generated feature that does not compile, mixed in with files that do, is
the worst possible outcome — there is no clean way back from it. The smoke test
corrupts a real template and asserts nothing reaches disk.

## After generating

1. **Fill in `features/<feature>/docs/brief.md`** — what, and how you will know
   it is done.
2. **Read the migration** for the contract you are about to use.
3. Write `features/<feature>/docs/plan.md` with the `kisok-feature-plan` skill.
4. Replace the placeholder Zod schema with the real payload shape.
5. Write the failing test, then implement — one atomic task at a time.
6. Keep the feature's `docs/todo.md` and `docs/worklog.md` current, **with
   evidence**.
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

Generates every shape in its shape table plus follow-up
capabilities, then proves the output typechecks, lints with zero warnings, is
formatted, and passes its own tests — and that re-running overwrites nothing.
Then it removes everything.

**Run it after every template change.** A template that merely looks right is
worthless when every future feature inherits its output. CI runs it on every PR.
