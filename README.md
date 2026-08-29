# KISOK

A private in-store catalog and ordering app for store-owned Android tablets.
React Native · Expo · Supabase.

Two experiences share one client: **Customer** (browse, cart, order) and
**Preparation** (fulfil orders). Admin is a separate web application.

## Quick start

```bash
pnpm install
cp .env.example .env.local     # add your Supabase URL and publishable key
pnpm web                       # browser preview — open /ui-lab to see the design system
pnpm android                   # Android device or emulator
```

## Commands

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint, including the architecture boundaries
pnpm format:check   # prettier
pnpm test           # jest + @testing-library/react-native
pnpm verify         # everything CI runs

pnpm generate feature <name> --role=customer   # a feature WORKSPACE (index + docs)
pnpm generate query <feature> <name>          # add one capability once planned
pnpm db:verify                                # types vs. migrations
pnpm db:types                                 # regenerate from the linked project
```

## Layout

```
app/          Expo Router routes — thin, routing only
features/     Vertical slices; each owns its data, state, UI, and tests
core/         Shared foundation: supabase, query, auth, errors, logging, storage
components/   Design system and shared UX states
tools/        The generator and database tooling
supabase/     Database migrations — the data contract
docs/         Documentation and decision records
```

## Working here

**Read [`AGENTS.md`](./AGENTS.md) first.** It covers the architecture, the
Supabase rules, the product boundaries, and the Definition of Done.

Then, depending on what you are doing:

- Building a feature → [`docs/feature-workflow.md`](./docs/feature-workflow.md)
- Writing data code → [`docs/data-and-supabase.md`](./docs/data-and-supabase.md)
- Building UI → [`docs/design-system.md`](./docs/design-system.md)
- Writing tests → [`docs/testing.md`](./docs/testing.md)
- Everything else → [`docs/`](./docs/README.md)

Two things to know before you write any data code:

1. **`supabase/migrations/*.sql` is the only source of truth** for the schema,
   RPCs, and RLS.
2. **The Flutter reference targets an older database.** Use it for product
   behaviour, never for data contracts.
