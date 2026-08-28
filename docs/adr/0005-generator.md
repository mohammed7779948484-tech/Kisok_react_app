# 0005 — A project-owned generator, not the ignite-cli package

**Status:** accepted · **Date:** 2026-08 · **Revised:** 2026-08 (renamed; made composable)

## Context

The foundation needs a code generator so feature agents inherit the architecture
instead of re-deriving it. Infinite Red's `ignite-cli` was researched properly
before deciding.

What it does well, and what we kept: EJS templates, YAML front matter with
`destinationDir` and `filename`, `NAME` filename substitution, and the
`pascalCaseName` / `camelCaseName` / `kebabCaseName` / `snakeCaseName` props.
Those conventions are good and they transfer.

Three things made the package itself a poor fit:

1. **It cannot pass custom options into templates.** Its props object is a fixed
   field list, not a spread of CLI flags. KISOK's generator needs `--role` and
   `--with` to decide what to emit — the single most valuable thing it does.
   This alone is disqualifying.
2. **Its built-in `route` generator prompts interactively** when it detects
   expo-router without an explicit `--dir`. An interactive prompt hangs CI.
3. **Weight.** It pulls in `gluegun` and `sharp` (a native binary) for app-icon
   and splash generators this repo does not use.

## Decision

Implement the generator in `tools/generator/`, following ignite-cli's template
conventions so they transfer, using `ejs` (small, pure JS) directly.

It is invoked as `pnpm generate` and is called **the KISOK generator**. It is
not Ignite and is not described as Ignite anywhere: borrowing a good template
convention does not make it that tool, and the misleading name cost review time.

Improvements over the package, each earning its keep:

- **Custom options reach templates** — `role`, `with`, and sibling-awareness
  flags so a screen generated alongside a query wires itself up.
- **Composable capabilities** — `feature`, `schema`, `query`, `mutation`,
  `store`, `component`, `screen`, `realtime`, `route`. `feature` orchestrates;
  the rest can be added to an existing feature later.
- **Never interactive.** Safe in CI, always.
- **Output is Prettier-formatted before writing**, using the project's own
  config, so generated code passes `format:check` on its first commit.
- **Tested against four materially different feature shapes.**
  `pnpm generate:smoke` generates read-heavy, local-state-heavy, mutation-heavy
  and realtime features, proves each typechecks, lints with zero warnings, is
  formatted and passes its own tests, then removes them.

## Consequences

- A small amount of code to own (~400 lines across the CLI, renderer and
  capability registry).
- No native dependency, no prompt risk, and output that is continuously verified
  rather than assumed.
- Templates stay recognisable to anyone who has used ignite-cli.
- **Run `pnpm generate:smoke` after any template change.** CI runs it on every PR.

## Why composable

The first version generated one fixed feature shape, and it was biased toward
lists — `fetchXList`, `useXList`, `XList`, `data.length`. That reads fine for a
catalog and badly for a cart, a checkout, or a maintenance screen, and a
generator that fits one feature type teaches the wrong patterns for the rest.
Capabilities fix that: a feature composes only what it needs, and nothing in the
output implies a shape the feature does not have.
