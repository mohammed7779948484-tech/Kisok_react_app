---
paths:
  - "features/**"
---

# Working inside a feature

A feature is a self-contained vertical slice. The goal is that implementing it
touches **only this directory plus one route file** — so parallel work does not
conflict.

## Layout

```
features/<name>/
├── index.ts     Public API — the only thing importable from outside
├── TODO.md      Working memory: plan, progress, evidence
├── api/         The ONLY place that calls Supabase
├── queries/     TanStack Query hooks and query keys
├── state/       Zustand store, client-owned state only
├── schemas/     Zod schemas for RPC payloads
├── components/  Presentational, feature-private
├── screens/     Composed screens
└── __tests__/   Colocated tests
```

## Rules

- **Import other features only via `@/features/<name>`.** Deep imports are a lint
  error. Inside this feature, use relative imports (`../api/…`).
- **Screens and components must not import Supabase.** Data access goes in
  `api/`, surfaced through a query hook.
- **Server state → TanStack Query. Client state → Zustand.** Never copy query
  data into a store; you will create two truths that drift.
- **Query keys stay local**, in `queries/keys.ts`. There is no central registry
  on purpose.
- Keep `index.ts` small. A wide public API defeats the boundary.
- **Update `TODO.md` as you work.** Do not tick a box without evidence: a test
  name, a command you ran, or a screen state you actually looked at.

## Before you finish

`pnpm verify`, then check the Definition of Done in `AGENTS.md`.
