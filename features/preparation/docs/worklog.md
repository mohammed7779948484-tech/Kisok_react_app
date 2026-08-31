# Preparation — worklog

Evidence, by task ID. A checkmark with no command output is not evidence.

Append entries; do not rewrite history. If a gate failed and was then fixed,
both belong here — a task that failed twice is a signal worth keeping.

## Template

Record the scaffold before anything else: the command the Lead actually ran and
what it put on disk. That is what makes the chain checkable —
`plan command → command run → filesystem → task evidence`. Without it, nobody
can tell later whether a file was generated, hand-written, or left over.

The entry evidence depends on the task's declared mode, so record the mode
first. `behavior`, `bug` and `behavior-change` open with RED; `refactor` opens
with a named BASELINE shown green; `config` has no RED at all — run the thing
it configures and paste the result under VERIFICATION.

```
### T01 — <objective>
MODE: behavior | bug | behavior-change | refactor | config
ACCEPTANCE: AC-xx | Supporting AC-xx | N/A — <reason>

SCAFFOLD          (Lead, before delegating — omit only when genuinely N/A)
  $ <the exact generator command the Lead ran>
  created  : <paths>
  skipped  : <paths that already existed>
  replaced : <paths overwritten, and why that was safe>
  manual   : <planned artifacts no capability covers>

RED               (behavior | bug | behavior-change)
  $ <command>
  <the failure, and why it is the RIGHT failure — not a typo or bad import>

BASELINE          (refactor)
  $ <command naming the existing tests being preserved>
  <green, before any change>

IMPLEMENT
  <the smallest change that does it>

GREEN             (behavior | bug | behavior-change | refactor)
  $ <command>
  <pass>

VERIFICATION      (config)
  $ <the thing it configures, actually run>
  <output proving the configuration works — not that a file contains a string>

AFFECTED CHECKS
  $ <typecheck / lint / focused tests>
  <result>

DIFF
  <files touched, and anything surprising>

GATE: PASS | FAIL
```

Delete the lines that do not apply to the mode. An empty RED heading under a
`config` task is the fabricated evidence this shape exists to prevent.

## Entries

### Planning — workspace, research, brief, plan (pre-T01)

MODE: N/A — planning phase, no implementation task
ACCEPTANCE: N/A — establishes the plan all tasks link to

SCAFFOLD
$ pnpm generate feature preparation --role=preparation
created : features/preparation/index.ts,
features/preparation/docs/{brief,plan,todo,worklog,review}.md
skipped : —
replaced : —

RESEARCH (delegated, parallel, read-only; Evidence Packets returned to the Lead)

- supabase-contract-researcher (Super Z agent-4094b702): RLS/grants (13),
  orders/order_items schema (04), update_order_status contract (08),
  realtime publication (12), store_settings (02), error mapping
  (core/errors). Lead spot-checked migrations 04/08/12/13 and
  core/errors/index.ts:91-124 directly.
- flutter-behavior-researcher (Super Z agent-9a76d3bb): §22–§26/§34
  behavior — three surfaces, action matrix, claim-on-start, assignee-only
  ready, cancel New/Preparing only, "Order unavailable", store-day history,
  invalidation-only realtime.
- ui-researcher (Super Z agent-4c6d555e): Tabs/columns board precedent,
  Badge status mapping, compact Button sanction, ConfirmDialog destructive
  flow, per-card mutation disable convention, conflict feedback via
  InlineError/Alert, no new shared primitives, no virtualization (ADR-0011).

PLANNING

- brief.md: 10 acceptance criteria (AC-01..AC-10), scope/out-of-scope,
  constraints, evidence pointers.
- plan.md: 11 design decisions with rejected alternatives; data contract;
  feature shape (schema/query×4/mutation/component×4/screen×3/realtime/route×3,
  store NO); 17 generator commands mapped to 14 tasks in 3 rounds; 3 manual
  model artifacts justified; zero shared-file changes.
- Lead Planning Review: PASSED after fixing task dependencies
  (T02/T08 no deps; T11/T13 gained T05).
- plan.md Status: READY.

GATE: N/A (planning; Task gates begin at T01)
