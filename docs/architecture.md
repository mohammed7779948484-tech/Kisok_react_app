# Architecture

## The problem this solves

Several coding agents will implement KISOK features **in parallel** from the same
`main`. Every shared file they must edit is a merge conflict and a chance to
destabilise someone else's work. So the primary architectural goal is:

> Implementing a feature should touch **only that feature's directory, plus one
> new route file.**

Everything below follows from that.

## Layers

```
app/            Expo Router routes. Thin: routing and composition only.
features/       Vertical slices. Each owns its data access, state, UI, and tests.
core/           Shared foundation with no feature knowledge.
components/     Shared design system and UX state components.
tools/          The generator and database tooling.
supabase/       Database migrations — the data contract.
```

## The one shared surface to coordinate on

Feature work is designed to touch only its own directory plus a route file, and
the lint rules keep it that way. There is one honest exception worth naming
before it surprises anyone:

**The customer shell.** Home, product discovery, search, the cart badge, and the
long-press entry into hidden maintenance all live in one navigation chrome that
several features appear in. Whoever builds it first owns
`app/(customer)/_layout.tsx` and should say so on their PR; everyone else
consumes it. Treat it as shared infrastructure from that point, and add to it
additively rather than restructuring it.

`app/(customer)/index.tsx` and `app/(preparation)/index.tsx` currently render a
placeholder. The catalog and preparation features respectively replace them —
one file each, no coordination needed beyond knowing it is coming.

### `app/` — routes

A route file renders a feature's screen and passes route params. Nothing else.
Access is declared with `<Stack.Protected guard={…}>` in `app/_layout.tsx`.

Route groups map to roles: `(customer)`, `(preparation)`, and `(dev)` for
development-only surfaces (guarded by `__DEV__`).

There is **no central route registry**. Expo Router's file-based routing means
adding a file _is_ the registration — which is exactly the property that keeps
parallel work conflict-free.

### `features/<name>/` — vertical slices

```
index.ts     Public API. The only importable surface from outside.
TODO.md      The agent's working memory for this feature.
api/         The only place that calls Supabase.
queries/     TanStack Query hooks and query keys.
state/       Zustand store for client-owned state.
schemas/     Zod schemas validating RPC payloads.
components/  Presentational, feature-private.
screens/     Composed screens.
__tests__/   Colocated tests.
```

A feature generates only the layers it needs. A read-only screen has no business
carrying an empty `state/` directory.

### `core/` — foundation

| Module            | Responsibility                                                           |
| ----------------- | ------------------------------------------------------------------------ |
| `core/env`        | Validated public configuration, fail-fast with an actionable message     |
| `core/supabase`   | Typed client, validated RPC caller, Realtime helpers, generated DB types |
| `core/auth`       | Session restoration, profile/role resolution, the sign-out safety gate   |
| `core/query`      | QueryClient defaults, provider, focus/online managers                    |
| `core/errors`     | The `AppError` model and mapping from Postgres/Auth/network failures     |
| `core/logging`    | Scoped, level-filtered, redacting logger                                 |
| `core/storage`    | Durable key/value storage that reports write failures                    |
| `core/responsive` | Semantic layout sizes matching the Tailwind breakpoints                  |
| `core/testing`    | Render helper, test QueryClient, Supabase and storage fakes              |
| `core/utils`      | `cn()`                                                                   |

`core/` never imports from `features/`. If a piece of `core/` only makes sense
for one feature, it belongs in that feature.

### `components/` — design system

`components/ui/` holds primitives (React Native Reusables architecture),
`components/feedback/` the shared UX states, `components/layout/` the screen
shell, `components/media/` the image abstraction, and `components/app/` the small
pieces the root layout needs.

## The boundary rules

Documentation alone does not hold a boundary — these are enforced in
`eslint.config.mjs`, and a violation fails CI.

| Rule                                                                       | Enforced by                                                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Routes may not import Supabase, Zustand, or TanStack Query                 | `no-restricted-imports` on `app/**`                                                             |
| Screens and components may not import Supabase                             | `no-restricted-imports` on `features/*/screens/**`, `features/*/components/**`, `components/**` |
| No deep cross-feature imports (`@/features/x/api/y`)                       | `no-restricted-imports` pattern `@/features/*/*`                                                |
| No `console` outside the logger                                            | `no-console`                                                                                    |
| Removed legacy stacks cannot return (tRPC, Drizzle, MySQL, Express, axios) | `no-restricted-imports` paths                                                                   |

The cross-feature rule works by forbidding the deep-path _pattern_ globally.
Inside a feature, internals are reached with relative imports, so the rule needs
no per-feature configuration and no maintenance as features are added.

**If a lint rule fires, move the code. Do not add a disable comment.**

## What is deliberately absent

These are the usual sources of merge conflict, and each was left out on purpose:

- No central feature registry
- No global barrel that every feature must append to
- No central route map
- No shared query-key file
- No single global store
- No central test index

## Data flow

```
Screen  →  Query hook  →  api/ module  →  callRpc  →  Supabase RPC
   ↑            ↑              ↑
  UI      cache + retry   Zod validation + AppError mapping
```

Realtime runs alongside, never through:

```
Realtime event  →  invalidate query  →  refetch  →  render
```

The event says _something changed_. The authoritative read says _what it is now_.
Rendering directly from a Realtime payload creates a second, unfiltered source of
truth that will drift from the query.

## Related

- [data-and-supabase.md](./data-and-supabase.md)
- [state-management.md](./state-management.md)
- [adr/0004-architecture-boundaries.md](./adr/0004-architecture-boundaries.md)
