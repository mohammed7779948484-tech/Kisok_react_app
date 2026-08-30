# Implementing a feature

The path from nothing to a reviewable PR. This is the summary; the executable
version is the **`feature-delivery`** skill, which is what an agent should load
before building anything.

There is exactly one feature workflow. If another document describes a different
one, that document is stale — `pnpm check:docs` exists to catch that.

## 1. Understand before you generate

- Read [`AGENTS.md`](../AGENTS.md) and the rules in `.claude/rules/`.
- Read the product behaviour in
  [`KISOK_FLUTTER_PRODUCT_REFERENCE.md`](../KISOK_FLUTTER_PRODUCT_REFERENCE.md) —
  for _behaviour_, never for data contracts.
- Read the migrations your feature will touch. This is the step most likely to be
  skipped and most likely to cause rework.

## 2. Generate the workspace

```bash
pnpm generate feature catalog --role=customer
```

That creates `index.ts` and `docs/` — and deliberately nothing else. The
generator does not guess the shape of your feature, because Cart, Checkout and a
domain-only feature are not shaped like Catalog, and deleting generated
placeholder code is worse than never generating it.

## 3. Write the brief, then the plan

`features/<name>/docs/brief.md` — **what** the feature does and how you will know
it is done:
objective, user-visible behaviour, acceptance criteria, scope, explicit
out-of-scope, evidence.

`features/<name>/docs/plan.md` — **how**, using the `kisok-feature-plan` skill:
research
synthesis, design decisions, the data contract from the migrations, the exact
generator commands, the test strategy, rounds of atomic tasks, risks.

The plan decides the shape, and it carries a status: `DRAFT` until it is
implementable, then `READY`. **No implementation task starts while it is
`DRAFT`.** That is the readiness signal — there is no fourth gate.

Only then do you generate the rest, and **not all at once**. The Lead runs each
planned command immediately before delegating the task that needs it:

```bash
pnpm generate schema catalog catalog-response          # before T01
pnpm generate query  catalog products                  # before T02
pnpm generate screen catalog catalog-home   # before T03
pnpm generate route  catalog index --role=customer --screen=catalog-home  # before T04
```

Bulk-generating the future tree before T01 fills the feature with files nobody
has justified, and the honest question at review is why they exist.

**Generator-first**: if a structural capability matches, use it. Hand-writing a
file a capability would have produced gives two features different shapes for
the same thing. Manual artifacts are legitimate when no capability fits, the
path is planned, and it is inside the task's scope — domain rules, selectors,
state-machine helpers, mappers, predicates, behaviour-specific tests.

Options in [`docs/generator.md`](./generator.md), or `pnpm generate --help`.

## 4. Work in atomic, verified tasks

Every task is one unit:

```
CLASSIFY → RED / BASELINE → IMPLEMENT → GREEN → AFFECTED CHECKS → DIFF REVIEW → GATE
```

A task declares its **verification mode** first — `behavior`, `bug`,
`behavior-change`, `refactor` or `config` — because that decides what its entry
evidence is. For the first three, confirm the RED failure is the behaviour being
missing, not a typo or a bad import. For a refactor, pin a named baseline of
green tests. For configuration or tooling, there is no RED: run the thing it
configures. Fabricating a failing test for a CI change produces a test that
asserts a file contains a string.

Then the smallest implementation. Then the directly affected checks. Then read
your own diff for anything unrelated. See the `test-driven-development` skill.

Record the evidence in the feature's `docs/worklog.md` under the task ID and set
the gate to
`PASS` or `FAIL`. **A task is done only at `PASS`, and the next task does not
start until its dependencies have passed.** When a gate fails, fix it in that
task — compensating in a later layer hides the original defect and produces code
nobody can safely change later.

Group tasks into rounds; at a round gate, review the whole accumulated diff, not
just the last task.

## 5. Verify for real

```bash
pnpm verify    # exactly what the CI verify job runs — check:ci-scripts proves it
pnpm web       # then actually look at it
```

TypeScript compiling is not evidence that a screen works. Open it, interact with
it, and check landscape and portrait at the tablet sizes.

If the change touches native configuration, verify on an Android device — or say
explicitly in the PR that you did not. If it warrants device-level coverage, see
[`.maestro/README.md`](../.maestro/README.md) and the `kisok-maestro-e2e` skill.

## 6. Open the draft PR early

As soon as there is coherent verified work — not at the feature gate. CI and the
label-gated native jobs only run once a PR exists, so deferring it means the
first Android build happens after the work is supposedly finished. The PR
template may carry `PENDING` gates while it is a draft.

## 7. Review, audit, then mark it ready

- **Independent code review** with fresh context (`code-reviewer` +
  `kisok-code-review`). Findings go in the feature's `docs/review.md`.
- Remediate, then **re-run the reviewer** on the same scope.
- **Quality audit** (`quality-auditor`) — a different question: was this
  delivered as promised, and is the evidence real?
- Work the feature-gate checklist in the PR template. Fast GitHub CI on the
  **final HEAD** is required evidence: `pnpm verify` alone is not the authority
  for checks that depend on an environment only CI has.
- Only at `PASS` do you mark the draft PR ready. **Never merge it.**

## Evidence, not assertions

Tick nothing without something behind it: a test name, a command and its output,
a screen state you looked at, the migration you checked. An unticked box with a
note is far more useful to the next agent than a ticked one that is a guess.

## Working alongside other agents

Several features are built from the same `main` in parallel. To stay mergeable:

- Stay inside your feature directory plus your route file.
- Need something from another feature? Use its public API. If it is not exported,
  that is a conversation, not a deep import.
- Need a shared change? Make it **additive** — do not change a signature others
  depend on.
- Adding a route is just adding a file. There is no registry to edit, and you
  should not create one.
