# Implementing a feature

The path from nothing to a reviewable PR.

## 1. Understand before you generate

- Read [`AGENTS.md`](../AGENTS.md).
- Read the product behaviour in
  [`KISOK_FLUTTER_PRODUCT_REFERENCE.md`](../KISOK_FLUTTER_PRODUCT_REFERENCE.md) —
  for _behaviour_, never for data contracts.
- Read the migrations your feature will touch. This is the step most likely to be
  skipped and most likely to cause rework.

## 2. Generate the slice

```bash
pnpm ignite feature catalog --role=customer
```

Common variations:

```bash
# Cart: local state, no route of its own, no server data
pnpm ignite feature cart --role=customer --layers=state,components,screens,tests --no-route

# Preparation board: needs live order updates
pnpm ignite feature preparation --role=preparation --realtime

# See the plan without writing anything
pnpm ignite feature search --role=customer --dry-run
```

Full options in [`IGNITE.md`](../IGNITE.md).

## 3. Turn the TODO into a real plan

`features/<name>/TODO.md` is a template, not a plan. Before writing code, fill in:

- the concrete user stories
- the **actual** RPCs, tables, and payload shapes, checked against the migration
- the screens and components you will build
- which states apply, and which genuinely do not

This file is your working memory. If your session is interrupted or your context
is compacted, it is what lets you resume without re-deriving everything.

## 4. Write the schema first

Replace the placeholder Zod schema with the real payload shape, from the
migration. This anchors everything downstream — the api return type, the query
hook, the component props.

## 5. Test, then implement

Where behaviour is testable, write the failing test first and **confirm it fails
for the right reason**. Then implement. See [testing.md](./testing.md).

Work outward: schema → api → query hook → screen → components.

## 6. Verify for real

```bash
pnpm verify    # typecheck, lint, format, test, generator smoke test
```

Then actually look at it:

```bash
pnpm web       # open the screen; resize narrow and wide
```

TypeScript compiling is not evidence that a screen works. Open it, interact with
it, check portrait and landscape, and check a narrow width.

If the change touches native configuration, verify on an Android device — or say
explicitly in the PR that you did not.

## 7. Update the TODO with evidence

Tick a box only when there is something behind it: a test name, a command you
ran, a screen state you looked at, the migration you checked. An unticked box
with a note is far more useful to the next agent than a ticked one that is a
guess.

## 8. Open the PR

- Keep it focused on one feature.
- **List every shared file you touched** (`core/`, `components/`, config) and why.
  Aim for zero.
- Say what you verified and what you did not.
- Check the Definition of Done in [`AGENTS.md`](../AGENTS.md).

## Working alongside other agents

Several features are built from the same `main` in parallel. To stay mergeable:

- Stay inside your feature directory plus your route file.
- Need something from another feature? Use its public API. If it is not exported,
  that is a conversation, not a deep import.
- Need a shared change? Make it **additive** — do not change a signature others
  depend on.
- Adding a route is just adding a file. There is no registry to edit, and you
  should not create one.
