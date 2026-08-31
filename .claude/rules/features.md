---
paths:
  - "features/**"
---

# Working inside a feature

A feature is a self-contained vertical slice. The goal is that implementing it
touches **only this directory plus its explicitly planned route file(s)** — so
parallel work does not
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

**Exception: `features/auth` does not match this anatomy — it predates the
generator, has a flat `schemas/` and flat `screens/*.tsx`, and owns only the
sign-in SCREEN (`core/auth` owns the actual session/role logic).** It is a
Foundation exception left alone deliberately, not a shape to copy. Every new
feature follows the layout above.

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
- **Update `features/<feature>/docs/todo.md` as you work.** It is the execution
  state — current task, stage, gate — and after a compaction or a handoff it is
  what tells the next agent where the work stopped. Do not tick a box without
  evidence: a test name, a command you ran, or a screen state you looked at.
  Evidence itself goes in the feature's `docs/worklog.md`.
- **No implementation task starts while the feature's `docs/plan.md` is
  `DRAFT`.** The Lead
  sets it `READY`, and the Lead runs each planned generator command immediately
  before delegating the task that needs it — never in bulk up front.

## Before you finish

`pnpm verify`, then check the Definition of Done in `AGENTS.md`.
