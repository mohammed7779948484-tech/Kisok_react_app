# 0004 — Enforce architecture with ESLint, not convention

**Status:** accepted · **Date:** 2026-08

## Context

Several agents will build features in parallel from this `main`. The architecture
only helps if it actually holds. Documented conventions do not hold: they are
easy to miss, easy to rationalise past, and invisible in review until someone
notices.

The rules that matter are also the ones most likely to be broken innocently:
calling Supabase from a screen because it is two lines shorter, reaching into
another feature's internals because the export is not there yet, adding a
`console.log` during debugging and leaving it.

## Decision

Encode the boundaries in `eslint.config.mjs` with `no-restricted-imports` and
`no-console`, scoped per directory:

| Rule                                    | Scope                                      |
| --------------------------------------- | ------------------------------------------ |
| No Supabase, Zustand, or TanStack Query | `app/**`                                   |
| No Supabase client                      | screens, components, design system         |
| No deep cross-feature imports           | everywhere (pattern `@/features/*/*`)      |
| No `console`                            | everywhere except `core/logging` and tests |
| No tRPC, Drizzle, MySQL, Express, axios | everywhere                                 |

The cross-feature rule works by forbidding the deep-path _pattern_ globally.
Inside a feature, internals are reached relatively — so the rule needs no
per-feature entries and no maintenance as features are added.

Deliberately **not** done: a custom architecture-checking script, a dependency-graph
tool, or a home-grown boundary compiler. The ESLint rules cover the cases that
actually matter, run in the editor, and cost nothing to maintain.

## Consequences

- A violation is a CI failure with a message explaining where the code belongs.
- The fix is always to move the code. **Adding an eslint-disable is not an
  acceptable resolution** — if a rule is genuinely wrong, change the rule in a
  PR that says why.
- Some legitimate-looking code is rejected (a screen that "just needs one query").
  That friction is the point.
