# Testing

**Stack:** `jest-expo` (Expo's official preset, ships the native mocks matching
the installed SDK) + `@testing-library/react-native` v14. Utilities are in
`@/core/testing`.

Vitest was removed — it does not reliably render React Native components, and
Expo does not support it. See [adr/0002-testing-stack.md](./adr/0002-testing-stack.md).

```bash
pnpm test         # run
pnpm test:watch   # watch
pnpm test:ci      # what CI runs
```

## The one thing that trips people up

**`render` is async in RNTL v14.** Always await it:

```tsx
await renderWithProviders(<CartScreen />);
```

Without the `await`, `screen` is never populated ("render function has not been
called") and React emits stray `act(...)` warnings. If you see act warnings, look
for a missing `await` before blaming the framework.

## Utilities

```ts
import {
  renderWithProviders, // render inside QueryClient + safe area + portal host
  createTestQueryClient, // retry: false, gcTime: Infinity
  installMockSupabase, // stub the client's .rpc() per function name
  createMemoryStore, // in-memory storage, with a failOn option
  screen,
  waitFor,
  userEvent, // re-exported from RNTL
} from "@/core/testing";
```

`renderWithProviders` deliberately does **not** include `AuthProvider` — it talks
to Supabase. Tests that need a session should mock the client and wrap
explicitly, or pass the profile into the component as a prop.

## Where to mock

**At the feature's `api/` module** for a screen test. A screen test should not
know Supabase exists:

```tsx
jest.mock("../api/catalog-api", () => ({ fetchCatalog: jest.fn() }));
```

**At the Supabase client** for an api-level test:

```ts
const supabase = installMockSupabase({
  get_customer_catalog: () => ({ data: snapshotFixture, error: null }),
});
// ...
expect(supabase.callsTo("get_customer_catalog")).toHaveLength(1);
supabase.restore();
```

An unregistered RPC throws a clear error rather than returning `undefined` and
failing confusingly three frames later.

## What to test

**Test behaviour and accessibility:**

```tsx
expect(screen.getByRole("button", { name: "Add to cart" })).toBeOnTheScreen();
expect(screen.getByRole("button", { name: "Confirm order" })).toBeDisabled();
```

Accessible queries do double duty: they assert the behaviour _and_ prove the
control is reachable by a screen reader.

**Do not** assert NativeWind's resolved styles. `toHaveStyle` on a `className` is
brittle — the interop resolves CSS variables at runtime and the test renderer
does not reflect the device. It also tests nothing a user would notice.

**Do not** write snapshot tests unless a snapshot genuinely captures something a
behavioural assertion cannot. A wall of snapshots is not coverage.

Worth testing on most features:

- Schema parsing — the cheapest guard against a backend contract change
- Error mapping — which `AppError.kind` each failure produces
- Loading, empty, error, and populated screen states
- The main interaction, including that it cannot be double-fired
- Persistence, including a **failed** write (`createMemoryStore({ failOn: "setItem" })`)

## Keep the output clean

**The suite must run with zero console output.** A noisy suite trains everyone to
ignore it, and then a real warning goes unnoticed.

If a test exercises a path that logs by design:

```ts
beforeEach(() => setLogSink(() => {}));
afterEach(resetLogging);
```

## TDD

Where the behaviour is testable:

1. Write the test.
2. **Run it and confirm it fails for the intended reason** — not because of a
   typo or a missing import.
3. Implement.
4. Watch it pass.
5. Refactor.

Never weaken a test to make it pass. If a test is wrong, fix it deliberately and
say so.

Configuration files and pure glue do not need this ceremony. Use judgement.

## The generator is tested too

```bash
pnpm ignite:smoke
```

Generates a real feature, then proves it typechecks, lints, formats, and passes
its own generated tests — then removes it. CI runs this on every PR, because a
template that merely looks right is worthless when agents inherit its output.
