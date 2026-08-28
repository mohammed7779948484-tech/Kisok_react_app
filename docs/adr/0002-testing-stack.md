# 0002 — jest-expo + React Native Testing Library, not Vitest

**Status:** accepted · **Date:** 2026-08

## Context

The starter shipped Vitest with a single skipped test — effectively no testing
setup. The foundation needs one an agent can actually rely on to verify a feature.

Vitest is faster and pleasant for pure TypeScript. But rendering React Native
components under it depends on a small third-party adapter, and Expo does not
support or document that path. `jest-expo` is Expo's official preset and ships
the native module mocks matched to the installed SDK — mocks that change with
every SDK release and would otherwise be ours to maintain.

Running both was considered and rejected: two runners means two configs, two
mental models, and an ambiguous `pnpm test`.

## Decision

`jest-expo` + `@testing-library/react-native` v14, for everything. Vitest and its
config removed.

## Consequences

- Native module mocks track the SDK, maintained upstream.
- Slower than Vitest on pure-logic tests. Acceptable — the suite is fast enough
  that `pnpm verify` stays comfortable.
- RNTL v14's `render` is **async**. `renderWithProviders` awaits it, and every
  test must `await` the helper. Forgetting this is the single most likely cause
  of a confusing `act(...)` warning, so it is called out in
  `docs/testing.md`, `.claude/rules/tests.md`, and the setup file itself.
- `@testing-library/jest-native` is deprecated and deliberately not installed;
  RNTL ships those matchers.
