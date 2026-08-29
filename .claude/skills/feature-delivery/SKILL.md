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
  → brief.md      WHAT
  → plan.md       HOW
  → rounds + atomic tasks
  → for each task:  delegate → verify → TASK GATE
  → ROUND GATE
  → fresh code review → remediate → re-review
  → quality audit
  → FEATURE GATE
  → PR
```

### 1. Generate the workspace

```bash
pnpm generate feature <name> --role=customer|preparation|shared
```

This creates `index.ts` and `docs/` — and deliberately nothing else. Do not pass
`--with=` yet: you do not know the shape of the feature until you have planned
it, and generated code you then delete is worse than none.

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

### 3. Write `docs/brief.md` — WHAT

Objective, user-visible behaviour, acceptance criteria, scope, explicit
out-of-scope, constraints, evidence. Every acceptance criterion must be
observable, because each one becomes a test.

No implementation sequencing here. If you are writing "then we add a hook", it
belongs in the plan.

### 4. Write `docs/plan.md` — HOW

Use the **`kisok-feature-plan`** skill. It covers research synthesis, design
decisions, the data contract, the exact generator commands, the test strategy,
rounds and tasks, risks, and verification.

### 5. Derive rounds and atomic tasks

A **round** is a group of tasks that leaves the feature coherent — "data
foundation", "the screen", "the safety rules". A **task** is the smallest change
that can be verified on its own.

Each task needs: an ID, an objective, dependencies, the skills required, the
generator command if any, and the file scope it is allowed to touch.

### 6. Run each task as an atomic unit

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

Record all of it in `docs/worklog.md` under the task ID, then set the gate:
`PASS` or `FAIL`. A task is DONE only at `PASS`.

**Task N+1 does not start until every dependency is PASS.** When a gate fails,
stay in that task: localise the defect, fix it there, re-run its gate. Do not
compensate in a later layer — a workaround in the screen for a bug in the model
is how a feature becomes unmaintainable, and it hides the original defect.

### 7. Round gates

After a round, run the relevant subsystem verification and review the whole
accumulated round diff — not just the last task. Tasks that each pass can still
combine into something incoherent.

### 8. Feature gate

- `pnpm verify` (typecheck, lint, format, tests, db:verify, generator smoke)
- Runtime evidence: browser at the tablet sizes; Android or Maestro where the
  feature warrants it (see `kisok-maestro-e2e`)
- **Fresh** independent review — `code-reviewer`, using `kisok-code-review`.
  Fresh context matters: a reviewer that watched the code being written shares
  its blind spots.
- Remediate. Re-run the reviewer on the same scope.
- **Quality audit** — `quality-auditor`, using `kisok-quality-audit`. Different
  job from review: it checks whether the delivery matches what was promised.
- Only then set the feature gate to `PASS` and open the PR.

## Control documents

Keep them distinct. When they blur, all five become one long unreliable file.

| File         | Holds                                   | Never holds          |
| ------------ | --------------------------------------- | -------------------- |
| `brief.md`   | What, and how we will know it is done   | Sequencing           |
| `plan.md`    | How: decisions, contracts, tasks, risks | Progress             |
| `todo.md`    | Execution state and gates, concise      | A copy of the plan   |
| `worklog.md` | Evidence per task ID, appended          | Plans                |
| `review.md`  | Independent findings and disposition    | Implementation notes |

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
