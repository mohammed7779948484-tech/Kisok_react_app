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

### T01 — order-status-update schema

MODE: behavior
ACCEPTANCE: Supporting: AC-04/AC-05/AC-06

SCAFFOLD
$ pnpm generate schema preparation order-status-update
created : features/preparation/model/order-status-update.schema.ts,
features/preparation/model/order-status-update.schema.test.ts
skipped : —
replaced : —
manual : —

RED
$ npx jest features/preparation/model/order-status-update.schema.test.ts
✕ accepts the migration-08 projection with null optionals
✕ accepts a fully-populated cancellation result
✓ (all 6 rejection tests)
Tests: 2 failed, 6 passed
Failure: ZodError at path ["id"] ("expected string, received undefined") —
the PLACEHOLDER schema ({id: uuid}) executed and rejected the real
migration-08 shape: the intended missing behaviour, not a typo or import
error (imports resolved; rejection tests prove the schema ran).

IMPLEMENT
Schema replaced with the exact migration-08 projection (186-195):
order_id uuid, display_number ^[A-HJ-NP-Z2-9]{6}$, status z.enum(5 values),
assigned_preparation_id uuid|null, completed_at/cancelled_at
iso|null, cancellation_reason string|null, updated_at iso.
z.iso.datetime({ offset: true }) — Postgres renders timestamptz→jsonb with
a numeric offset, never bare Z.

GREEN
$ npx jest features/preparation/model/order-status-update.schema.test.ts
Tests: 8 passed, 8 total

AFFECTED CHECKS (Lead re-ran all)
$ npx jest features/preparation/model/… → 10/10 (after remediation)
$ pnpm typecheck → clean (exit 0)
$ pnpm lint → clean
$ npx prettier --check features/preparation/model/ → pass

TASK REVIEW (fresh code-reviewer, Super Z agent-3b9ee103)
Findings: R01 minor — no rejection test for offset-less timestamps;
R02 minor — required-field nullability unpinned. No blocking/major.
Remediation: implementer resumed (agent-535680cf); both one-test fixes
added to the test file; schema unchanged. Re-verified: 10/10 green,
typecheck/lint/format clean.

DIFF
features/preparation/model/order-status-update.schema.ts (new)
features/preparation/model/order-status-update.schema.test.ts (new)
Nothing else; git status shows only features/preparation/model/.

GATE: PASS

### T02 — active-orders read

MODE: behavior
ACCEPTANCE: Supporting: AC-01/AC-02/AC-03

SCAFFOLD
$ pnpm generate query preparation active-orders
created : features/preparation/api/fetch-active-orders.ts,
features/preparation/queries/use-active-orders.ts,
features/preparation/queries/keys.ts
skipped : —
replaced : —
manual : features/preparation/api/fetch-active-orders.test.ts (planned:
the query capability generates no test)

RED
$ npx jest features/preparation/api/fetch-active-orders.test.ts
✕ resolves the rows the orders table returns, in one read
✕ maps a PostgREST error to an AppError via toAppError
Tests: 2 failed
Failure: the placeholder's AppError NOT_IMPLEMENTED surfaced (imports
resolved; AppError instanceof ran in test 2) — the intended missing
behaviour.

IMPLEMENT
fetchActiveOrders(): direct read, select("_, order_items(_)"),
in("status", ["new","preparing","ready"] as const),
order("created_at", { ascending: false }), error → toAppError.
Exported ActiveOrderRow = Tables<"orders"> & { order_items:
Tables<"order_items">[] }. Hook keeps the generated key shape.
Embed typechecks via the order_items_order_id_fkey relationship — the
plan's two-reads fallback was NOT needed (risk R-1 resolved).

GREEN
$ npx jest features/preparation/api/fetch-active-orders.test.ts
Tests: 3 passed, 3 total (4 after remediation)

AFFECTED CHECKS (Lead re-ran)
$ npx jest features/preparation/api/ → 4/4 (after remediation)
$ pnpm typecheck → clean
$ pnpm test:ci (implementer) → 19 suites / 152 tests green, zero console

TASK REVIEW (fresh code-reviewer, Super Z agent-2c94e2fe)
T02-R02 MAJOR: status filter + ordering had no enforcement; the test
header falsely claimed TypeScript covers them (in() checks enum
membership only; ascending is a plain boolean; the .from() stub
discards builder args). T02-R01 minor: self-contradictory .order()
comment. T02-R03 minor: fixture variant_options keys wrong (real
snapshot is {type,value} per migration 07:282-292).
Remediation (implementer resumed, agent-d46a460e): recording chain stub
added INSIDE the test file asserting select string, .in values, .order
args deep-equal; mutation-verified (dropping "ready", flipping
ascending, dropping the embed each fail the suite). Header comment
corrected. .order() comment corrected. Fixture fixed to {type,value}.
Lead re-verified: 4/4, typecheck clean, comments and fixture confirmed.

DIFF
features/preparation/api/fetch-active-orders.ts (new)
features/preparation/api/fetch-active-orders.test.ts (new, manual)
features/preparation/queries/use-active-orders.ts (new)
features/preparation/queries/keys.ts (new, verbatim template)
Nothing else.

GATE: PASS
