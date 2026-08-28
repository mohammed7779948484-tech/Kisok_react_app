---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "core/testing/**"
---

# Tests

Stack: **jest-expo** (Expo's official preset) + **@testing-library/react-native
v14**. Utilities live in `@/core/testing`.

## The one thing that trips people up

**`render` is async in RNTL v14.** Always await it:

```tsx
await renderWithProviders(<CartScreen />);
```

Forgetting the `await` leaves `screen` unset ("render function has not been
called") and produces stray `act(...)` warnings.

## Rules

- Use `renderWithProviders` from `@/core/testing`, not the bare RNTL `render` —
  it supplies the QueryClient, safe-area, and portal host.
- Testing a screen behind the auth gate? `installMockAuth()` then
  `renderWithProviders(ui, { withAuth: true })`. Do not hand-roll an auth client;
  the helper exists so every feature's fake session behaves the same.
- **Mock at the feature's `api/` module**, not at `@/core/supabase`. A screen
  test should not know Supabase exists. For an api-level test, use
  `installMockSupabase`.
- **Test behaviour and accessibility, not styling.** `getByRole`,
  `getByLabelText`, `toBeDisabled()`, `toBeOnTheScreen()`. Do not assert
  NativeWind's resolved styles — it is brittle and tests nothing a user notices.
- Prefer `userEvent.setup()` over `fireEvent` for realistic interaction.
- **No snapshot tests** unless a snapshot genuinely captures something a
  behavioural assertion cannot.
- The suite must run with **zero console output**. If a test exercises a failure
  path that logs, install a silent sink: `setLogSink(() => {})` in `beforeEach`,
  `resetLogging` in `afterEach`.
- Use `createMemoryStore()` to test persistence, including its `failOn` option to
  exercise write failures — KISOK must surface those, not swallow them.

## TDD

Where behaviour is testable: write the test, **confirm it fails for the intended
reason**, implement, watch it pass, refactor. Never weaken a test to make it
pass. Configuration files and pure glue do not need this ceremony — use judgement.
