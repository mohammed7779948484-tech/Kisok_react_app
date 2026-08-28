# The agent harness

How several agents build KISOK features in parallel without conflicting or
quietly producing work nobody can verify.

The [feature workflow](./feature-workflow.md) is the summary. This document
describes the machinery behind it: which skills exist, which subagents exist,
and what the gates actually mean.

## Skills

Project-owned skills live in `.claude/skills/`. They carry the workflow so it
lives in one place instead of being restated in every feature's `todo.md`.

| Skill                      | Load it when                                      |
| -------------------------- | ------------------------------------------------- |
| `feature-delivery`         | Building any feature — the orchestration workflow |
| `kisok-feature-plan`       | Turning a brief into `docs/plan.md`               |
| `test-driven-development`  | Any implementation, bug fix, or behaviour change  |
| `kisok-code-review`        | Reviewing a diff, a PR, or a feature before merge |
| `kisok-quality-audit`      | Checking a delivery matches what was promised     |
| `kisok-design-system`      | Writing or reviewing any UI                       |
| `kisok-react-native-rules` | Lists, animation, images, performance, crashes    |
| `kisok-maestro-e2e`        | Adding device-level end-to-end coverage           |

Official Supabase skills (`supabase`, `supabase-postgres-best-practices`) are
installed project-scoped from `supabase/agent-skills`. They live once in
`.agents/skills/` and are symlinked into `.claude/skills/`; `skills-lock.json`
records their source and hash. Update them with
`npx skills add supabase/agent-skills`, not by hand.

Expo publishes no agent-skills package at the time of writing, and none exists
in the plugin catalogue. `pnpm doctor` and `kisok-react-native-rules` cover that
ground.

## Subagents

Project subagents live in `.claude/agents/`. The roles are separated because the
separation is what makes the checks worth anything.

| Agent                                   | Job                                            | Deliberately cannot                                   |
| --------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `feature-implementer`                   | One bounded task, test-first, returns evidence | Certify its own task, or widen its file scope         |
| `code-reviewer`                         | Independent review with fresh context          | Edit code — a reviewer that fixes is not a check      |
| `quality-auditor`                       | Did the delivery match the promise?            | Re-do the code review                                 |
| `research/supabase-contract-researcher` | What the backend actually offers               | Invent a contract, or propose weakening RLS           |
| `research/flutter-behavior-researcher`  | What the product should DO                     | Return any data contract — that app's schema is older |
| `research/ui-researcher`                | How to build it from what exists               | Design a new shared primitive                         |

The **Lead** — the parent agent — owns research orchestration, the brief, the
plan, task derivation, delegation, gate verification, the worklog, remediation
decisions and the final handoff.

## Gates

Three levels, each answering a different question.

### Task gate

```
RED → IMPLEMENT → GREEN → AFFECTED CHECKS → DIFF REVIEW → GATE
```

`PENDING` until verified, then `PASS` or `FAIL`. A task is DONE only at `PASS`,
and **task N+1 does not start until every dependency is `PASS`**.

The point is debugging locality. Six files changed and three failures at the end
means every change is suspect; one small verified change at a time means exactly
one is.

When a gate fails, the fix happens **in that task**. Compensating in a later
layer leaves the original defect in place with a workaround on top of it.

### Round gate

A round is a group of tasks that leaves the feature coherent. At the gate, run
the relevant subsystem verification and review the whole accumulated round diff
— tasks that each pass can still combine into something incoherent.

### Feature gate

Full `pnpm verify`, runtime evidence, independent code review, remediation,
re-review of blocking findings, then the quality audit. Only then does the PR
open.

## Control documents

Every generated feature owns five, and they stay distinct — when they blur, all
five become one long file nobody trusts.

| File         | Holds                                   | Never holds          |
| ------------ | --------------------------------------- | -------------------- |
| `brief.md`   | What, and how we will know it is done   | Sequencing           |
| `plan.md`    | How: decisions, contracts, tasks, risks | Progress             |
| `todo.md`    | Execution state and gates, concise      | A copy of the plan   |
| `worklog.md` | Evidence per task ID, appended          | Plans                |
| `review.md`  | Independent findings and disposition    | Implementation notes |

## Keeping this true

`pnpm check:docs` fails when documentation describes a workflow the repository
no longer has — an old generator flag, a moved directory, a renamed command.
Prose drifts silently because nothing executes it; that check is what stops a
rename leaving a document lying for months. It runs as part of `pnpm verify`.
