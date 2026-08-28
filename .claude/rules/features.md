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
├── index.ts        Public API — the only thing importable from outside
├── docs/           brief, plan, todo, worklog, review
├── model/          Types, Zod schemas, pure rules — no IO
├── api/            The ONLY place that calls Supabase
├── queries/        TanStack Query hooks and query keys
├── state/          Zustand store, client-owned state only
├── screens/<name>/ A screen, its test, and its own components/
└── components/     UI shared by several screens in this feature
```

Tests live beside what they protect. Generate only what the feature needs.

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
