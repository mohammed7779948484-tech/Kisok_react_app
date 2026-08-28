# Ignite — the KISOK feature generator

```bash
pnpm ignite feature <name> [options]
```

Scaffolds a complete feature vertical slice: directory structure, working
starter code, a public API, and a `TODO.md` to work through. It exists so that
implementing a feature never requires re-deriving — or guessing at — the
project's architecture.

## Options

| Option                                 | Default                                        | Effect                                                                                                       |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--role=customer\|preparation\|shared` | `shared`                                       | Which experience owns it. Decides the route group.                                                           |
| `--layers=a,b,c`                       | `api,queries,schemas,components,screens,tests` | Which layers to generate. Available: `api`, `queries`, `state`, `schemas`, `components`, `screens`, `tests`. |
| `--realtime`                           | off                                            | Adds a Realtime → query invalidation hook. Requires `queries`.                                               |
| `--no-route`                           | off                                            | Skip the Expo Router route file.                                                                             |
| `--dry-run`                            | off                                            | Print the plan, write nothing.                                                                               |
| `--force`                              | off                                            | Overwrite existing files.                                                                                    |

A feature generates only what it needs. A read-only screen has no business
carrying an empty `state/` directory for the next reader to wonder about.

## Examples

```bash
# Customer catalog: server data, screens, tests, and a route
pnpm ignite feature catalog --role=customer

# Cart: local state only, surfaced as a sheet rather than its own route
pnpm ignite feature cart --role=customer --layers=state,components,screens,tests --no-route

# Preparation board: needs live order updates
pnpm ignite feature preparation --role=preparation --realtime

# See what would happen
pnpm ignite feature search --role=customer --dry-run
```

## What you get

`pnpm ignite feature catalog --role=customer` produces:

```
features/catalog/
├── index.ts                              public API — the only external surface
├── TODO.md                               your working memory for this feature
├── api/catalog-api.ts                    the ONLY place that calls Supabase
├── queries/keys.ts                       feature-local query keys
├── queries/use-catalog-list.ts           TanStack Query hook
├── schemas/catalog-schema.ts             Zod validation for the RPC payload
├── components/catalog-list.tsx           presentational, feature-private
├── screens/catalog-screen.tsx            loading / error / empty / data
└── __tests__/
    ├── catalog-schema.test.ts
    └── catalog-screen.test.tsx
app/(customer)/catalog.tsx                thin route
```

Adding `--layers=…,state` adds `state/catalog-store.ts` with the persistence
pattern; `--realtime` adds `queries/use-catalog-realtime.ts`.

The generated code is not filler. It compiles, lints, is Prettier-formatted, and
its tests pass immediately — so `pnpm verify` is green before you have written a
line, and stays a meaningful signal while you work.

## No central files to edit

Generating a feature touches **only that feature's directory plus one route
file**. There is deliberately no feature registry, no global barrel, no route
map, and no shared query-key file — each of those would be a merge conflict every
time two agents worked at once. Expo Router's file-based routing means adding a
route file _is_ the registration.

**If you extend the generator, do not break this.** The moment a feature has to
register itself somewhere central, the property this generator exists to protect
is gone.

## After generating

1. **Read `features/<name>/TODO.md`** and expand it into a real plan.
2. **Read the migration** for the contract you are about to use.
3. Replace the placeholder Zod schema with the real payload shape.
4. Write the failing tests, then implement.
5. Keep the TODO updated **with evidence**.
6. `pnpm verify`.

See [`docs/feature-workflow.md`](./docs/feature-workflow.md).

## How it works

- Templates live in `ignite/templates/feature/*.ejs` — EJS with YAML front matter.
- Front-matter keys: `destinationDir` (required), `filename`, `skip`. All three
  are rendered through EJS first, so they can depend on the options — which is
  how a layer opts itself out.
- Props available in templates: `pascalCaseName`, `camelCaseName`,
  `kebabCaseName`, `snakeCaseName`, `name`, `originalName`, plus `role`,
  `layers`, `realtime`, `route`, `routeDir`, `featureDir`.
- Output is formatted with the project's own Prettier config before being
  written.
- Existing files are never overwritten without `--force`.

These conventions follow Infinite Red's `ignite-cli` deliberately, so they
transfer. The generator is implemented locally rather than using that package —
see [`docs/adr/0005-generator.md`](./docs/adr/0005-generator.md) for why (the
short version: ignite-cli cannot pass custom options into templates, and its
route generator prompts interactively, which would hang CI).

## Changing the templates

```bash
pnpm ignite:smoke
```

Generates a real feature, proves it typechecks, lints, formats, and passes its
own tests, then removes it. **Run it after every template change** — a template
that merely looks right is worthless when every future feature inherits its
output. CI runs it on every PR.
