# 0011 — Skills, subagents, and gated task execution

**Status:** accepted

## Context

Several agents build KISOK features in parallel from the same `main`. Two
failure modes make that expensive.

Merge conflicts were already addressed structurally: features own their
directories, the generator never edits a shared registry, and Expo Router makes
a route a file rather than a table entry.

The second is harder. An agent writes six files, runs the suite once at the end,
gets three failures, and cannot tell which change caused which. It then fixes
symptoms in whichever layer is most convenient — typically the screen — and the
original defect survives in the model, now with a workaround on top.

## Decision

**Atomic, gated tasks.** Every task is
`CLASSIFY → RED / BASELINE → IMPLEMENT → GREEN → AFFECTED CHECKS → DIFF REVIEW → GATE`,
and task
N+1 does not begin until its dependencies are `PASS`. When a gate fails, the fix
happens in that task. Tasks group into rounds with round gates; the feature gate
adds full verification, runtime evidence, independent review and a quality audit.

The value is debugging locality: when something breaks, exactly one small change
is suspect.

**Project skills** under `.claude/skills/` carry the workflow, so it lives in one
place instead of being restated in every generated `todo.md`. Each rule states
the failure mode it prevents — a rule an agent cannot justify is a rule it will
apply mechanically in the wrong place.

**Project subagents** under `.claude/agents/` separate the roles that must stay
separate. An implementer receives one bounded task and cannot certify its own
work. Reviewer and auditor run in fresh contexts with no edit access: an agent
that watched code being written shares its blind spots, and one that can silently
fix what it finds is no longer an independent check.

**Code review and quality audit are different jobs.** Review asks whether the
code is correct. The audit asks whether the delivery matches what was promised
and whether the evidence is real — DONE without PASS, claims with no command
output, scope that appeared without a plan.

## Consequences

- More process per task, and it is not free. Every task first declares a
  **verification mode**, and only the behaviour-bearing modes require a failing
  test; a refactor pins a baseline and a configuration change runs the thing it
  configures. Without that classification, agents invent meaningless failing
  tests for CI and documentation work.
- The control documents must stay distinct or they collapse into one unreliable
  file. Their responsibilities are stated in the templates themselves.
- Reference material adapted from outside sources was curated, not copied. Where
  a source rule conflicted with KISOK's needs — "virtualize any list" — it was
  resolved against measured behaviour and the deployment target rather than
  followed.
