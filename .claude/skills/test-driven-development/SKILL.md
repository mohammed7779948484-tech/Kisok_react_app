---
name: test-driven-development
description: How to write tests first in KISOK — the four modes (new behaviour, bug fix, behaviour change, pure refactor), how to prove a test fails for the right reason, and what deserves a test at all. Use this whenever you are implementing a feature, fixing a bug, or changing behaviour in this repository, before writing the implementation. Also use it when you are about to add or modify any test.
---

# Test-driven development in KISOK

The point is not ceremony. It is that **a test you never watched fail has not
been shown to catch anything**. A test written after the code passes on the
first run, which tells you nothing about whether it would notice a regression.

Stack: jest-expo + @testing-library/react-native v14. Helpers in `@/core/testing`.
`render` is async in RNTL v14 — always `await renderWithProviders(...)`.

## Pick the mode first

Four situations, four correct sequences. Choosing the wrong one is where this
goes bad — usually by inventing a meaningless failing test for work that has no
behaviour to specify.

### New behaviour → RED → GREEN → REFACTOR

Write the smallest test that expresses what should happen. Watch it fail for the
right reason. Write the least code that passes. Then clean up while green.

### Bug fix → regression RED → GREEN

Reproduce the bug as a test first. That test is the permanent value of the fix:
it is what stops the bug coming back. If you cannot make it fail, you have not
understood the bug yet — keep going rather than fixing what you guess it is.

### Behaviour change → RED → GREEN

Change or add the test that states the NEW behaviour, watch it fail, then change
the code. Delete or update tests that asserted the old behaviour — deliberately,
naming what changed. Never quietly loosen an assertion to get green.

### Pure behaviour-preserving refactor → GREEN → refactor → GREEN

There is no new behaviour, so there is nothing to write a failing test for.
Instead: confirm the existing tests cover what you are about to move, and if
they do not, add **characterization** tests that pass now and pin the current
behaviour. Then refactor, keeping them green throughout.

Do not invent a failing test for configuration-only work — a Metro option, a
CI step, a dependency bump. There is no behaviour to specify. Verify it by
running the thing it configures.

## Proving RED

This is the step with all the value, and the easiest to fake.

```bash
npx jest path/to/thing.test.ts
```

Read the failure. It must be the behaviour being **missing or wrong** — not a
module that does not resolve, not a typo, not a bad import. Those failures mean
the test never exercised your subject at all.

If it passes immediately, one of three things is true: the behaviour already
exists, the test asserts something trivially true, or it is asserting on a mock
instead of on real code. Find out which before continuing.

Record the RED command and its output in the feature's `docs/worklog.md`. A
checkmark with no output is not evidence.

## What deserves a test

Test what would hurt if it broke:

- **Behaviour** a person can observe on the tablet
- **Contracts** — Zod schemas at the Supabase boundary, RPC payload shapes
- **State transitions** — cart quantities, order status, a checkout state machine
- **Safety invariants** — above all, anything that could duplicate an order or
  lose an unresolved checkout
- **Accessibility** — roles and labels, because they are behaviour for anyone
  using assistive technology
- **Regressions** — every bug fixed

Do not chase coverage or one-test-per-function. A test per getter adds
maintenance and catches nothing. Several small assertions about one behaviour
are usually one test, not five.

Do **not** assert on NativeWind's resolved styles. It is brittle and tests
nothing a customer notices.

## Where tests live

Beside the code they protect:

```
model/catalog-response.schema.ts
model/catalog-response.schema.test.ts

state/cart-store.ts
state/cart-store.test.ts

screens/product-detail/product-detail-screen.tsx
screens/product-detail/product-detail-screen.test.tsx
```

A feature-level test directory is for tests that genuinely span layers. Do not
create a `__tests__` bucket for unrelated units — colocated tests get updated
when their subject changes; distant ones rot.

## Mock at the right seam

Mock the **feature's own `api/` module**. A screen test should not know Supabase
exists; that is the whole point of the boundary.

```tsx
jest.mock("../../api/fetch-products", () => ({ fetchProducts: jest.fn() }));
```

For a test of `api/` itself, use `installMockSupabase`. For anything behind the
auth gate, `installMockAuth()` then `renderWithProviders(ui, { withAuth: true })`.

Assert on **real behaviour, not on mock behaviour**. `expect(mock).toHaveBeenCalled()`
proves your test called your mock. Prefer asserting what the user would see.

## Keep the output clean

The suite runs with zero console output. When a test exercises a path that logs
by design, install a silent sink:

```ts
beforeEach(() => setLogSink(() => {}));
afterEach(() => resetLogging());
```

Noise trains everyone to ignore output, and then a real warning goes unread.

## Honest signals that you have skipped a step

- You cannot say what production change would make this test fail
- The test passed the first time you ran it
- You weakened an assertion to get green
- You are testing that a mock was called
- The implementation existed before the test and you wrote the test "to match"

None of these are fatal — they are a prompt to go back one step, not to start
the whole feature over.
