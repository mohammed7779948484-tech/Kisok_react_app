---
name: test-driven-development
description: How KISOK verifies work — classifying every task into one of five verification modes (behavior, bug, behavior-change, refactor, config), proving a test fails for the right reason, pinning a baseline before a refactor, and verifying configuration without fabricating a failing test. Use this whenever you are implementing a feature, fixing a bug, changing behaviour, refactoring, or changing configuration/tooling/CI in this repository, before writing the implementation, and whenever you add or modify a test.
---

# Test-driven development in KISOK

The point is not ceremony. It is that **a test you never watched fail has not
been shown to catch anything**. A test written after the code passes on the
first run, which tells you nothing about whether it would notice a regression.

Stack: jest-expo + @testing-library/react-native v14. Helpers in `@/core/testing`.
`render` is async in RNTL v14 — always `await renderWithProviders(...)`.

## Classify the task first

Every task declares a **verification mode** before any work starts. This is step
one, not a formality: choosing the wrong mode is where this goes bad, usually by
inventing a meaningless failing test for work that has no behaviour to specify.

The mode is recorded in the feature's `docs/todo.md`, and the shape of the task
follows from it. There are five, and they are the only five:

| Mode              | When                                       | Sequence                          |
| ----------------- | ------------------------------------------ | --------------------------------- |
| `behavior`        | New behaviour a person can observe         | RED → GREEN → REFACTOR            |
| `bug`             | Something is wrong and must stop recurring | regression RED → GREEN            |
| `behavior-change` | Existing behaviour must become different   | RED → GREEN                       |
| `refactor`        | Structure changes, behaviour must not      | BASELINE GREEN → refactor → GREEN |
| `config`          | Configuration, tooling, CI, deps, docs     | executable verification, no RED   |

Whatever the mode, the task runs the same pipeline:

```
CLASSIFY → RED / BASELINE → IMPLEMENT → GREEN → AFFECTED CHECKS → DIFF REVIEW → GATE
```

Only the second and fourth steps differ by mode. Everything else — affected
checks, reading your own diff, the gate — is identical.

### `behavior` → RED → GREEN → REFACTOR

Write the smallest test that expresses what should happen. Watch it fail for the
right reason. Write the least code that passes. Then clean up while green.

### `bug` → regression RED → GREEN

Reproduce the bug as a test first. That test is the permanent value of the fix:
it is what stops the bug coming back. If you cannot make it fail, you have not
understood the bug yet — keep going rather than fixing what you guess it is.

### `behavior-change` → RED → GREEN

Change or add the test that states the NEW behaviour, watch it fail, then change
the code. Delete or update tests that asserted the old behaviour — deliberately,
naming what changed. Never quietly loosen an assertion to get green.

### `refactor` → BASELINE GREEN → refactor → GREEN

There is no new behaviour, so there is nothing to write a failing test for.
Instead establish a **baseline**: confirm the existing tests cover what you are
about to move, and if they do not, add **characterization** tests that pass now
and pin the current behaviour. Record that baseline as evidence. Then refactor,
keeping them green throughout.

A refactor whose baseline is "the suite passes" is not pinned to anything
specific. Name the tests that cover the code you are moving.

### `config` → executable verification, no RED

Configuration, tooling, CI, dependency bumps and documentation have no behaviour
to specify, and fabricating a failing test for them produces a test that asserts
your config file contains a string — which breaks on every legitimate edit and
catches nothing.

Verify by **running the thing it configures**, and record that command:

| Change                          | Verification                                        |
| ------------------------------- | --------------------------------------------------- |
| Metro / Babel / Tailwind config | `pnpm export:web`, or the build it affects          |
| A CI workflow                   | trigger the workflow and read the job log           |
| A dependency bump               | `pnpm verify`, plus whatever the package is used by |
| Generator templates             | `pnpm generate:smoke`                               |
| Documentation                   | `pnpm check:docs`, and read the rendered result     |
| A new guard script              | run it against a deliberately broken input          |

The last row is the one worth internalising: a guard that has never rejected
anything is indistinguishable from a guard that cannot. Prove it fails before
you trust it passing.

## Proving RED (or the baseline)

This is the step with all the value, and the easiest to fake.

For `behavior`, `bug` and `behavior-change`, prove the RED. For `refactor`,
prove the BASELINE — name the tests that pin the code you are about to move and
show them green first. For `config`, there is nothing to prove here; the
evidence is the verification command in the GREEN step.

```bash
npx jest path/to/thing.test.ts
```

Read the failure. It must be the behaviour being **missing or wrong** — not a
module that does not resolve, not a typo, not a bad import. Those failures mean
the test never exercised your subject at all.

If it passes immediately, one of three things is true: the behaviour already
exists, the test asserts something trivially true, or it is asserting on a mock
instead of on real code. Find out which before continuing.

Record the command and its output in the feature's `docs/worklog.md`, and set
the task's stage in the feature's `docs/todo.md`. A checkmark with no output
is not evidence.

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
