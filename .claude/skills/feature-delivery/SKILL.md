---
name: feature-delivery
description: The end-to-end workflow for building any KISOK feature — generate the workspace, research, brief, plan, atomic TDD tasks, task/round/feature gates, independent review, quality audit, PR. Use this whenever you are asked to build, implement, add, or finish a feature or screen in this repository, even if the request sounds small ("just add a cart badge"), and use it before writing any feature code. If you are a subagent handed ONE task, you do not need this skill — follow the task and the test-driven-development skill instead.
---

# Delivering a KISOK feature

You are the **Lead** for this feature. You own the thinking, the sequencing, and
the verification. Subagents do bounded work; they never decide that work is done.

Read `AGENTS.md` and the path-scoped rules in `.claude/rules/` before you start.
This skill is the workflow; those are the constraints.

## Why this shape

Several agents build KISOK features in parallel from the same `main`. Two
failure modes make that expensive, and everything below exists to prevent one of
them:

- **Merge conflicts.** Solved structurally: features own their directories, the
  generator never edits a shared registry, and routes are files rather than
  entries in a table.
- **Confident wrongness.** An agent writes six files, runs the suite at the end,
  finds three failures, and cannot tell which change caused which. Solved by
  making every task individually verified — so when something breaks, exactly
  one small change is suspect.

## The loop

```
generate workspace
  → research (parallel, independent scopes)
  → brief.md      WHAT      (acceptance criteria get stable IDs: AC-01, AC-02…)
  → plan.md       HOW       (starts DRAFT; becomes READY when it is implementable)
  → rounds + atomic tasks
  → for each dependency-legal task:
        YOU run that task's planned scaffold
      → YOU verify the generated paths
      → delegate the bounded task
      → YOU verify           → TASK GATE
  → ROUND GATE
  → open a DRAFT PR once there is coherent verified work
  → keep going; collect CI, runtime and native evidence on it
  → fresh code review → remediate → re-review
  → quality audit
  → FEATURE GATE
  → mark the PR ready for a human
```

Two things in that loop are easy to get wrong, so they are stated plainly:

**Scaffolding is yours, and it is just-in-time.** You own the feature's shape.
You plan every structural generator command and map each to a task, and you run
that command **immediately before delegating that task** — not all of them up
front. Bulk-generating the future tree before T01 fills the feature with files
nobody has justified yet, and the first honest question at review is why they
exist. An implementer never adds a structural capability or widens the feature's
shape on its own; if one turns out to be necessary, it stops and reports, and
you revise the plan first.

**The draft PR comes early.** Waiting for the feature gate to open it means CI
and the label-gated native jobs never run until the work is supposedly finished,
which is the worst moment to discover the app does not build.

### 1. Generate the workspace

```bash
pnpm generate feature <name> --role=customer|preparation|shared
```

This creates `index.ts` and `docs/` — and deliberately nothing else. Do not pass
`--with=` yet: you do not know the shape of the feature until you have planned
it, and generated code you then delete is worse than none.

**Every `docs/…` path below means `features/<name>/docs/…`**, never the
repository's root `docs/`. The five control documents — `brief.md`, `plan.md`,
`todo.md`, `worklog.md`, `review.md` — live inside the feature, so two agents
building two features never write to the same file. Root `docs/` is the
repository's own documentation and is not yours to edit for a feature.

### 2. Research before deciding

Delegate to research subagents **in parallel** when their scopes are genuinely
independent. They return findings and evidence; they do not implement.

| Subagent                       | Answers                                                                  | Must not                                                                    |
| ------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `supabase-contract-researcher` | Which RPCs/tables/enums exist, which role may call them, what RLS allows | Invent a contract that is not in a migration                                |
| `flutter-behavior-researcher`  | What the product should DO — journeys, edge cases, safety rules          | Take table or RPC names from the Flutter app; its schema is older and wrong |
| `ui-researcher`                | Which existing tokens, primitives and layouts to use                     | Design a new shared primitive                                               |

If the contract you need does not exist in `supabase/migrations/*.sql`, **stop
and say so**. Do not design around it, and never weaken RLS to make a screen
easier — that is a backend decision, not a client problem.

### 3. Write the feature's `docs/brief.md` — WHAT

Objective, user-visible behaviour, acceptance criteria, scope, explicit
out-of-scope, constraints, evidence. Every acceptance criterion must be
observable, because each one becomes a test.

**Give every acceptance criterion a stable ID** — `AC-01`, `AC-02`, … Each task
then records exactly one of:

- `Acceptance: AC-xx` — this task is what makes that criterion true
- `Supporting: AC-xx` — it contributes but does not satisfy it alone
- `N/A — <reason>` — config, refactor and support tasks; do not invent a link

Once the plan is `READY`, IDs are never renumbered or reused. A new criterion
gets a new ID; a removed one stays in the brief, marked superseded with the
reason. Renumbering silently invalidates every reference in the worklog.

No implementation sequencing here. If you are writing "then we add a hook", it
belongs in the plan.

### 4. Write the feature's `docs/plan.md` — HOW

Use the **`kisok-feature-plan`** skill. It covers research synthesis, design
decisions, the data contract, the exact generator commands, the test strategy,
rounds and tasks, risks, and verification.

The plan carries a status, and it is the implementation-readiness signal — there
is no fourth gate. The three gates stay `TASK`, `ROUND`, `FEATURE`.

```
Status: DRAFT     ← starts here; no implementation task may start
Status: READY     ← implementation may begin
```

`DRAFT → READY` only when all of this holds:

- acceptance criteria are complete and each maps to tasks
- the feature shape is justified capability by capability
- data contracts are verified against `supabase/migrations/*.sql`
- every generator command is mapped to a task
- manual-only artifacts are justified
- dependencies are coherent
- route mappings are known
- expected changes outside the feature are identified
- no unnecessary capability or folder is planned

If a material decision changes later — an acceptance criterion, the shape, a
dependency, a scaffold — return the plan to `DRAFT`, reconcile it and `todo.md`,
and restore `READY` before implementation resumes. A plan that quietly diverges
from what is being built is worse than no plan.

### 5. Derive rounds and atomic tasks

A **round** is a group of tasks that leaves the feature coherent — "data
foundation", "the screen", "the safety rules". A **task** is the smallest change
that can be **verified on its own**.

Atomic means one independently verifiable behaviour or slice. It does **not**
mean one file. A `query` scaffold emits `api/fetch-*.ts`, `queries/keys.ts` and
`queries/use-*.ts`; those are one cohesive read pipeline and belong in one task,
not three. Splitting a scaffold's output by file produces tasks that cannot be
verified independently — the api file alone proves nothing — which is the
opposite of what atomicity is for.

Each task needs: an ID, a verification mode, its acceptance-criterion link, an
objective, dependencies, the skills required, the **scaffold** it needs and who
runs it, and the file scope it is allowed to touch.

### 6. Scaffold, then delegate

Before each task, run its planned generator command yourself and check what
landed:

```
Lead scaffold:            the exact command from the plan
Expected generated files: what the plan said it would create
Allowed manual files:     planned artifacts no capability covers
Scaffold status:          PENDING | READY | BLOCKED | N/A
```

The implementer starts only at `READY`. `N/A` must name the reason no generator
capability fits.

**Generator-first.** If a structural capability matches, use it — `feature`,
`schema`, `query`, `mutation`, `store`, `component`, `screen`, `realtime`,
`route`. Hand-writing a file a capability would have produced is how two
features end up with different shapes for the same thing.

Manual file creation is legitimate only when all three hold: no capability fits,
the path and purpose are explicitly planned, and the file is inside the current
task's allowed scope. Pure domain rules, selectors, state-machine helpers,
mappers and predicates, and behaviour-specific tests are the normal cases.

### 7. Run each task as an atomic unit

```
CLASSIFY → RED / BASELINE → IMPLEMENT → GREEN → AFFECTED CHECKS → DIFF REVIEW → GATE
```

Delegate the implementation to `feature-implementer` with exactly one task. Then
**you** verify it — an implementer never certifies its own work, because the
agent that wrote the code is the worst judge of whether it did what was asked.

Check, in order:

1. The task declared a **verification mode**, and it is the right one for what
   the task actually does. See `test-driven-development` for the five modes.
2. The mode's entry evidence is real:
   - `behavior` / `bug` / `behavior-change` — the RED output shows the test
     failing for the _intended missing behaviour_, not a typo or an import error
   - `refactor` — a named BASELINE of existing or characterization tests, shown
     green before the change
   - `config` — no RED; the verification command that exercises the artifact
3. GREEN passes, or for `config` the verification command succeeded.
4. Affected checks pass: focused tests, `pnpm typecheck`, `pnpm lint`, format.
5. The diff contains nothing unrelated to this task.
6. The task's acceptance condition actually holds.

Record all of it in the feature's `docs/worklog.md` under the task ID —
including the `SCAFFOLD` block naming the command you actually ran and the paths
it created, skipped or replaced — then set the gate: `PASS` or `FAIL`. A task is
DONE only at `PASS`.

**Task N+1 does not start until every dependency is PASS.** When a gate fails,
stay in that task: localise the defect, fix it there, re-run its gate. Do not
compensate in a later layer — a workaround in the screen for a bug in the model
is how a feature becomes unmaintainable, and it hides the original defect.

### 8. Round gates

After a round, run the relevant subsystem verification and review the whole
accumulated round diff — not just the last task. Tasks that each pass can still
combine into something incoherent.

### 9. Feature gate

- `pnpm verify` — exactly the set the CI verify job runs, including `check:docs`.
  `pnpm check:ci-scripts` fails if the two ever diverge, so this is not a claim
  that can quietly go stale.
- Runtime evidence: browser at the tablet sizes; Android or Maestro where the
  feature warrants it (see `kisok-maestro-e2e`)
- **Fresh** independent review — `code-reviewer`, using `kisok-code-review`.
  Fresh context matters: a reviewer that watched the code being written shares
  its blind spots.
- Remediate. Re-run the reviewer on the same scope.
- **Quality audit** — `quality-auditor`, using `kisok-quality-audit`. Different
  job from review: it checks whether the delivery matches what was promised.

Then work the checklist. Every line is a box, and `pnpm verify` alone is not the
authority — several checks depend on an environment only CI has:

```md
## Feature gate

- [ ] Every Task Gate PASS
- [ ] Every Round Gate PASS
- [ ] Every AC verified
- [ ] `pnpm verify` PASS after the final local change
- [ ] required fast GitHub CI PASS on the final HEAD
- [ ] required runtime evidence recorded
- [ ] required native tier(s) PASS, N/A, or explicitly unverified
- [ ] Reviewer findings dispositioned
- [ ] blocking/major fixes re-reviewed
- [ ] Quality Audit clean
- [ ] anything not verified explicitly recorded
- [ ] shared/core changes justified
- [ ] PR evidence matches the worklog

FEATURE GATE: PENDING
```

Only at `PASS` do you mark the draft PR ready for a human. **Never merge it.**

## Pull request lifecycle

Open the draft PR **early** — as soon as there is coherent verified work, not at
the feature gate. Feature-gate-then-PR looks tidy and is wrong: PR-triggered CI
and the label-gated native jobs only run once a PR exists, so deferring it means
the first Android build happens after the work is supposedly done.

```
plan READY
  → implementation, first coherent verified work
  → open DRAFT PR
  → continue tasks and rounds
  → collect CI, runtime and native evidence on it
  → final remediation
  → final-head local checks AND GitHub checks
  → re-review
  → quality audit
  → FEATURE GATE PASS
  → mark the PR ready, hand off
```

- A draft PR may exist long before the feature gate passes.
- The PR template may carry `PENDING` gates while it is a draft.
- The feature gate must pass **before** marking it ready.
- **Never merge it.** A human decides.

## Control documents

Keep them distinct. When they blur, all five become one long unreliable file.

| File         | Holds                                                            | Never holds          |
| ------------ | ---------------------------------------------------------------- | -------------------- |
| `brief.md`   | What, and how we will know it is done                            | Sequencing           |
| `plan.md`    | How: decisions, contracts, tasks, risks, `Status: DRAFT`/`READY` | Progress             |
| `todo.md`    | Execution state and gates, concise                               | A copy of the plan   |
| `worklog.md` | Evidence per task ID, appended                                   | Plans                |
| `review.md`  | Independent findings and disposition                             | Implementation notes |

## Delegation rules

- One bounded task per implementer. Tell it which documents and contracts to
  read and which skills to load.
- Parallelism belongs in **research**, where scopes are independent. Parallel
  implementation of dependent tasks produces work that has to be redone.
- Reviewers and auditors get fresh context and read-oriented permissions.
- You maintain `worklog.md` and the gates. Not the implementer.

## Honest reporting

If something is unverified — no device, no credentials, no deployed database —
say so plainly in the worklog and the PR. A confident claim you did not check is
worse than an admitted gap, because it stops anyone else from checking it.
