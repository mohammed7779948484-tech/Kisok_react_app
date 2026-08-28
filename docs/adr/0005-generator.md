# 0005 — A local Ignite-convention generator, not the ignite-cli package

**Status:** accepted · **Date:** 2026-08

## Context

The brief called for a professional Ignite generator system. Infinite Red's
`ignite-cli` was researched properly before deciding.

What `ignite-cli` does well, and what we kept: EJS templates, YAML front matter
with `destinationDir` and `filename`, `NAME` filename substitution, and the
`pascalCaseName` / `camelCaseName` / `kebabCaseName` / `snakeCaseName` props.
Those conventions are good and transfer.

Three things made the package itself a poor fit:

1. **It cannot pass custom options into templates.** Its props object is a fixed
   field list, not a spread of CLI flags. KISOK's generator needs `--role`,
   `--layers`, and `--realtime` to decide what to emit — the single most valuable
   thing it does. This alone is disqualifying.
2. **Its built-in `route` generator prompts interactively** when it detects
   expo-router without an explicit `--dir`. An interactive prompt in a CI smoke
   test hangs the job.
3. **Weight.** It pulls in `gluegun` and `sharp` (a native binary) for app-icon
   and splash generators this repo does not use.

## Decision

Implement the generator locally in `ignite/`, following ignite-cli's conventions
so they transfer, using `ejs` (a small, pure-JS dependency) directly.

Improvements over the package, each earning its keep:

- **Custom options reach templates** — `role`, `layers`, `realtime`, `route`.
- **Never interactive.** Safe in CI, always.
- **Output is Prettier-formatted before writing**, using the project's own
  config — so a generated feature passes `format:check` on its first commit.
  (The smoke test caught this: templates cannot guess line lengths when a
  feature name is interpolated.)
- **Tested end to end.** `pnpm ignite:smoke` generates a real feature, proves it
  typechecks, lints, formats, and passes its own tests, then removes it.

## Consequences

- A small amount of code to own (~200 lines across two modules).
- No native dependency, no prompt risk, and a generator whose output is
  continuously verified rather than assumed.
- Templates stay recognisable to anyone who has used ignite-cli.
- **Run `pnpm ignite:smoke` after any template change.** CI runs it on every PR.
