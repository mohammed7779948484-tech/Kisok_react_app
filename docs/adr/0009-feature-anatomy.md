# 0009 — Feature anatomy: model/, screen directories, and a neutral generator

**Status:** accepted

## Context

The generator's default produced `schema + query + component + screen + route`
for every new feature. That default is a design claim: it says every KISOK
feature is a read-heavy routed screen.

It is not. Cart is local state with no `api/` at all. Checkout is a mutation
state machine. A pricing-rules feature is pure domain logic with no UI. Each of
those started by deleting generated placeholder files — and deleting generated
code is worse than never generating it, because the author has to work out which
parts were a real suggestion and which were an artefact of the default.

Two smaller problems came with it. Zod schemas lived in `schemas/`, separate from
the types and rules they belong with, so a feature's pure logic had no home.
Screens were flat files with their tests in a `__tests__/` bucket and their
components in a shared `components/` directory, so a component used by exactly
one screen was indistinguishable from one shared across the feature — and the
distinction is what stops a feature's UI becoming an undifferentiated pile.

## Decision

**`pnpm generate feature <name>` creates a workspace and nothing else** —
`index.ts` plus the five control documents in `docs/`. Discovery and planning
decide the shape; `--with=` composes it when the shape is already known.

**Zod schemas move to `model/`**, the feature's pure domain layer: types,
schemas, rules, selectors, state-machine helpers — anything without IO. The
generator command still reads `generate schema`, because the command names the
artefact and the architecture decides where it lands.

**A screen owns a directory**: `screens/<name>/<name>-screen.tsx`, its colocated
test, and a `components/` folder for UI private to that screen.
`generate component --screen=<name>` places a component there directly rather
than making the author create it and move it.

**Tests are colocated** with their subject.

## Consequences

- A feature's directory now reflects what that feature actually is. An agent
  reading `features/cart/` sees `state/` and no `api/`, which is the truth.
- Ownership of UI is visible from the path. Promoting a component from
  screen-local to feature-level is a deliberate move, not an accident of where
  the generator happened to put it.
- The generator has to be told what to build, which is a small cost paid once
  per feature, after planning — the point at which the answer is actually known.
- `pnpm check:docs` exists partly because this change invalidated prose in seven
  documents at once.
