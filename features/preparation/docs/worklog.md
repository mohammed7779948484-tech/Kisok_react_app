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

### T03 — order-detail read

MODE: behavior
ACCEPTANCE: Supporting: AC-07

SCAFFOLD
$ pnpm generate query preparation order-detail
created : features/preparation/api/fetch-order-detail.ts,
features/preparation/queries/use-order-detail.ts
skipped : features/preparation/queries/keys.ts (exists from T02)
replaced : —
manual : features/preparation/api/fetch-order-detail.test.ts (planned);
features/preparation/queries/use-order-detail.test.tsx
(added during remediation with Lead-approved scope extension)

RED
$ npx jest features/preparation/api/fetch-order-detail.test.ts
Tests: 4 failed, 1 passed, 5 total
Failure: placeholder NOT_IMPLEMENTED AppError rejected all four behaviour
tests; the compile-time proof passed (module loaded) — the intended
missing behaviour, imports resolved.

IMPLEMENT
fetchOrderDetail(orderId): select("_, order_items(_)").eq("id", orderId)
.maybeSingle(); error → toAppError; returns ActiveOrderRow | null
(type reused from T02, not duplicated). Hook wires the id into BOTH
key ([...preparationKeys.all, "order-detail", orderId]) and queryFn.
maybeSingle distinguishes "no such order" (null) from failure.

GREEN
$ npx jest features/preparation/api/fetch-order-detail.test.ts
Tests: 5 passed, 5 total

AFFECTED CHECKS (Lead re-ran)
$ npx jest features/preparation/ → 4 suites / 20 tests green
$ pnpm typecheck → clean
$ pnpm lint / prettier (implementer + reviewer re-ran) → clean

TASK REVIEW (fresh code-reviewer, Super Z agent-850be56c)
T03-R01 MAJOR: no hook-level key-shape test for the feature's first
parameterized read (plan's test strategy promised it); a queryKey
regression would cross-contaminate the shared cache. T03-R02 minor:
recording stub blind to ADDED builder calls. T03-R03 minor: missing-param
branch deferred to T13 (Lead disposition — REQUIRED constraint in T13's
packet). T03-R04 minor: ActiveOrderRow name at the detail boundary —
accepted with note (docblocks document it).
Remediation (implementer resumed, agent-1fe6ec8a): NEW hook test
use-order-detail.test.tsx (two ids, one shared client, distinct cache
entries asserted); recording stub strengthened so every builder method
records; exact sequence ["select","eq","maybeSingle"] pinned. Mutation-
verified: dropping the id from the key fails with cross-contamination
(both probes served order A); adding .in("status",...) fails the
sequence assertion (was silent before).
Lead re-verified: 4/20 green, typecheck clean.

OBSERVATIONS (Lead disposition)
O-1 dead `detail` key factory in keys.ts — ACCEPTED: keys.ts stays the
verbatim generator template per plan; the feature invalidates
preparationKeys.all; recorded here so nobody uses the stale factory.
O-2 stale T02 board row — fixed by the Lead (prettier had reformatted
the table so an earlier sed silently missed).

DIFF
features/preparation/api/fetch-order-detail.ts (new)
features/preparation/api/fetch-order-detail.test.ts (new, manual)
features/preparation/queries/use-order-detail.ts (new)
features/preparation/queries/use-order-detail.test.tsx (new, remediation)
keys.ts NOT modified.

GATE: PASS

### T04 — store-settings read

MODE: behavior
ACCEPTANCE: Supporting: AC-03/AC-07/AC-08

SCAFFOLD
$ pnpm generate query preparation store-settings
created : features/preparation/api/fetch-store-settings.ts,
features/preparation/queries/use-store-settings.ts
skipped : features/preparation/queries/keys.ts (exists)
replaced : —
manual : features/preparation/api/fetch-store-settings.test.ts (planned)

RED
$ npx jest features/preparation/api/fetch-store-settings.test.ts
Tests: 4 failed, 1 passed, 5 total
Failure: placeholder NOT_IMPLEMENTED AppError on the four behaviour tests;
the type-proof passes at runtime by design (enforced by typecheck, which
fails at RED because StoreSettingsRow does not exist yet) — the intended
missing behaviour.

IMPLEMENT
fetchStoreSettings(): .from("store_settings").select("\*").maybeSingle();
error → toAppError; returns StoreSettingsRow | null. Null — not an error,
not a fabricated default — when the singleton row is absent (plan
decision 8; degradation to device tz is T06's model concern). Minimal
read justified by the singleton constraint (id boolean pk check(id) caps
the table at one row). Hook keeps the generated key shape.

GREEN
$ npx jest features/preparation/api/fetch-store-settings.test.ts
Tests: 5 passed, 5 total

AFFECTED CHECKS (Lead re-ran)
$ npx jest features/preparation/ → 5 suites / 25 tests green
$ pnpm typecheck → clean
$ pnpm lint / prettier (implementer + reviewer) → clean

TASK REVIEW (fresh code-reviewer, Super Z agent-85c0f59b)
No blocking, no major. T04-R01 minor: test header comment overstated
TypeScript blindness (select-string projection IS typed for literals);
remediated — comment reworded to credit the projection typing and claim
only the single-vs-maybeSingle + added-call blind spots. T04-R02 minor:
stale doc in SHARED core/testing/supabase.ts (lists two tables; store
settings is also allowed) — ACCEPTED with note: a shared-file doc fix
belongs to a future Lead-owned foundation chore, not this feature PR.
Observations carried forward: O-1 (transport-level throws are not
AppError at screens — error-state rendering must not assume kind) goes
into T11/T13/T14 packets; O-2 (unresolvable IANA zone must degrade like
an absent row in T06's model, with a test) goes into T06's packet.

DIFF
features/preparation/api/fetch-store-settings.ts (new)
features/preparation/api/fetch-store-settings.test.ts (new, manual)
features/preparation/queries/use-store-settings.ts (new)
keys.ts NOT modified.

GATE: PASS

### T05 — update-order-status mutation

MODE: behavior
ACCEPTANCE: Supporting: AC-04/AC-05/AC-06/AC-10

SCAFFOLD
$ pnpm generate mutation preparation update-order-status
created : features/preparation/api/update-order-status.ts,
features/preparation/queries/use-update-order-status-mutation.ts
skipped : —
replaced : —
manual : features/preparation/api/update-order-status.test.ts,
features/preparation/queries/use-update-order-status-mutation.test.tsx
(both planned: api contract + hook invalidation contract)

RED
$ npx jest features/preparation/api/update-order-status.test.ts
Tests: 4 failed, 1 passed, 5 total
Failure: placeholder NOT_IMPLEMENTED AppError on all four behaviour tests
(K1004 expectation visible in the diff) — the intended missing write
behaviour; type-proof passes at runtime by design (typecheck fails at
RED — UpdateOrderStatusInput placeholder does not match).

IMPLEMENT
updateOrderStatus(input): callRpc("update_order_status", { order_id,
target_status, reason }, orderStatusUpdateSchema). Input union
"preparing" | "ready" | "cancelled" (the honest client boundary;
completed is admin-only, new is not a tablet target). No client-side
transition-rule re-implementation — the RPC is authoritative. Hook
invalidates preparationKeys.all on success (justified: a status change
moves rows across board/detail/history); no retry override.

GREEN
$ npx jest features/preparation/ → 7 suites / 33 tests (34 after
remediation) — all pass, jest exits cleanly.

AFFECTED CHECKS (Lead re-ran)
$ npx jest features/preparation/ → 33/33 at verification (34 after)
$ pnpm typecheck → clean
$ pnpm lint / prettier (implementer + reviewer re-ran) → clean
$ pnpm test:ci (reviewer) → 24 suites / 171 tests, zero console output

TASK REVIEW (fresh code-reviewer, Super Z agent-0ca47f51)
No blocking, no major. T05-R01 minor: only K1004 → state-conflict was
pinned; AC-10 names both branches — remediated: 42501 assignee-only
rejection test added (kind forbidden, code 42501); 6/6 in the api file.
T05-R02 observation (per-plan, NOT a T05 defect): the hook invalidates
on success only; AC-10's "refresh the affected data" on a REJECTED
transition must be screen-owned — carried as a REQUIRED constraint into
T10/T11/T13 packets (screens implement onError → invalidate/refetch).
Implementer notes: useMutation tests need mutations.gcTime: Infinity to
let jest exit (test-local createMutationTestClient; reviewer verified
against query-core source) — a shared core/testing fix would be a
Lead-owned foundation chore, recorded, NOT done in this feature.

DIFF
features/preparation/api/update-order-status.ts (new)
features/preparation/api/update-order-status.test.ts (new, manual)
features/preparation/queries/use-update-order-status-mutation.ts (new)
features/preparation/queries/use-update-order-status-mutation.test.tsx
(new, manual)
keys.ts / index.ts NOT modified.

GATE: PASS

### T06 — store-day-history read + store-day model

MODE: behavior
ACCEPTANCE: Supporting: AC-08

SCAFFOLD
$ pnpm generate query preparation store-day-history
created : features/preparation/api/fetch-store-day-history.ts,
features/preparation/queries/use-store-day-history.ts
skipped : keys.ts (exists)
replaced : —
manual : model/store-day.ts + store-day.test.ts (planned);
api/fetch-store-day-history.test.ts (planned);
queries/use-store-day-history.test.tsx (Lead-approved during
the task: the packet's entry evidence required "all three
test files" — the packet's 5-file list was a Lead miscount;
the file is inside todo.md's T06 scope and follows the
T03/T05 hook-test precedent)

RED

1. model: npx jest …/store-day.test.ts → "Cannot find module './store-day'"
2. api: Tests: 3 failed, 1 passed (placeholder NOT_IMPLEMENTED AppError)
3. hook: Tests: 4 failed (scaffold had no settings composition, no
   dayKey, no filter)

IMPLEMENT (as reconciled — see TASK REVIEW below)
Model (pure, zero imports): StoreDayWindow; resolveStoreTimezone /
effectiveTimezone (garbage-zone degradation per T04-R02/O-2, pinned);
isResolvableZone; currentStoreDayWindow (Intl two-pass round-trip +
existence check for 00:00-transition zones; endUtc = the NEXT local
date's midnight — 23h/25h/24h windows); orderTerminalInstant /
isTerminalInDay ([start,end)); groupTerminalOrders (newest-first by
terminal instant).
Api: .from("orders").select("\*").in("status",
["completed","cancelled"]).or("completed_at.gte.X,cancelled_at.gte.X")
.order("created_at",{ascending:false}) — the TERMINAL timestamps are the
prefilter bound (exact decision-2 semantics); no items embed; error →
toAppError; input { terminalSince }.
Hook: settings (T04) → window → read → client-side in-day filter;
dayKey (window startUtc ISO) in the query key; settings loading/error
as hook states with the R04 data-preserving gate; composed refetch
(settings first — R05); no store mirroring; no retry override.

GREEN
3 suites / 37 tests (26 model + 4 api + 7 hook); full feature 10 suites
/ 71 tests; full repo test:ci 27 suites / 209 tests, zero console.

AFFECTED CHECKS (Lead re-ran)
$ npx jest features/preparation/ → 71/71
$ pnpm typecheck → clean
$ pnpm lint / prettier (implementer + reviewer) → clean

PLAN RECONCILIATION (Lead, commit 5ab7a01 preceding the code fix)
The fresh reviewer's T06-R01/T06-R02 revealed decision 2's prescribed
read shape was semantically wrong (a 24h created_at lookback misses
orders terminal >24h after creation; a fixed start+24h window drops
the fall-back day's final local hour). The Lead reconciled plan.md
decision 2 + the data contract to the exact terminal-timestamp shape;
no AC, capability, dependency, or scaffold changed — plan stayed READY
with the reconciliation recorded in the plan itself.

TASK REVIEW (fresh code-reviewer, Super Z agent-0101f749)
T06-R01 MAJOR (24h lookback insufficiency — plan-level defect) → FIX.
T06-R02 MAJOR (DST fall-back last hour dropped) → FIX.
T06-R03 minor (round-trip non-convergence for 00:00-transition zones,
e.g. Havana) → FIX.
T06-R04 minor (merged error overrides cached data) → FIX.
T06-R05 minor (spread-through refetch bypasses enabled; raw Error path)
→ FIX (composed refetch).
T06-R06 minor (history-read failure unpinned; no wire-format timestamp
test) → FIX (both tests).
Remediation (implementer resumed, agent-8ce174b0): all six fixed;
mutation-verified per finding (.or bound; endUtc revert; existence
check removal; gating revert; composed refetch removal; hook bound
revert — each fails the suite). 37/37, 71/71, 209/209 green.
Structural types justified: ESLint confines @/core/supabase (even type
imports) to api/\*\*; the api test carries compile-time assignability
proofs (Tables<"orders"> extends StoreDayOrder etc.).
Shared-mock gap noted: core/testing's installMockSupabase chain has no
`or` method — the api test uses a full recording stub (in-file) for
data/error assertions too. ACCEPTED: adding `or` to the shared mock is
a Lead-owned foundation chore (recorded with T04-R02 and T05's gcTime
note); the in-file stub is sound and convention-documented.

DIFF
features/preparation/model/store-day.ts (new, manual)
features/preparation/model/store-day.test.ts (new, manual)
features/preparation/api/fetch-store-day-history.ts (new)
features/preparation/api/fetch-store-day-history.test.ts (new, manual)
features/preparation/queries/use-store-day-history.ts (new)
features/preparation/queries/use-store-day-history.test.tsx (new,
Lead-approved addition)
keys.ts NOT modified.

GATE: PASS

### T07 — status-actions eligibility rules

MODE: behavior
ACCEPTANCE: Supporting: AC-04/AC-05/AC-06/AC-10

SCAFFOLD
N/A — no generator capability applies (planned manual artifact:
pure domain rules; the Lead delegated directly)

RED
$ npx jest features/preparation/model/status-actions.test.ts
→ Test suite failed to run: Cannot find module './status-actions'
(the sanctioned absent-module RED for a new pure module)

IMPLEMENT
canStartPreparing (new AND unassigned — mirrors the RPC's K1004
already-assigned guard); canMarkReady (preparing AND assigned to the
actor — mirrors the 42501 IS DISTINCT FROM guard); canCancel (new |
preparing, NOT assignment-restricted — the one transition with no
assignee check; any preparation employee may cancel a colleague's
order); allowedOrderActions composed from the three so it cannot
drift. OrderActionOrder structural; OrderStatus imported from
./store-day (T06 precedent, no duplication). Module docblock: rules
MIRROR migration 08 for UI affordances; the RPC is authoritative.

GREEN
$ npx jest features/preparation/model/status-actions.test.ts
Tests: 17 passed, 17 total (15-row exhaustive matrix: 5 statuses ×
3 assignment classes + the cancel-not-restricted pin + the
foreign-status pin)

AFFECTED CHECKS (Lead re-ran)
$ npx jest features/preparation/ → 11 suites / 88 tests green
$ pnpm typecheck → clean
$ pnpm lint / prettier (implementer + reviewer re-ran) → clean
$ pnpm test:ci (implementer) → 28 suites / 226 tests, zero console

TASK REVIEW (fresh code-reviewer, Super Z agent-91c3f6b5)
No blocking, no major. T07-R01 minor: the docblock's "every
Tables<"orders"> row satisfies it" claim is unpinned — carried as a
REQUIRED item into T09's packet (one-line Equals pin in
fetch-active-orders.test.ts, Lead-approved there; the model itself
cannot import generated types). T07-R02 minor: comment said "both of
its rows" where cancelled has three — remediated (one word).
Implementer mutation-verified 4 regressions (exclusion-based canCancel,
dropped assignee check, dropped unassigned guard, assignment-restricted
cancel — each caught by the intended tests).

DIFF
features/preparation/model/status-actions.ts (new, manual)
features/preparation/model/status-actions.test.ts (new, manual)
Nothing else.

GATE: PASS

### Round 1 gate — correction (append-only)

R1-02: the T06 entry's "commit 5ab7a01" hash was wrong — the plan
reconciliation commit is 1d78e8f ("docs(preparation): reconcile the history
read contract after T06 review"), which does precede the T06 code commit
8f727cc. The reconciliation description itself was accurate.

### Round 1 GATE

MODE: round gate (all seven task gates PASS: T01-T07)

ROUND VERIFICATION (Lead)
$ pnpm verify → ALL green (typecheck, lint, format, 28 suites / 226
tests, db:verify, check:docs, generator smoke — 61 ok lines)
$ git diff main --name-only | grep -v '^features/preparation/' → EMPTY
(zero files outside the feature; 31 files / +4888 / -0)
$ npx jest features/preparation/ → 11 suites / 88 tests green

ROUND REVIEW (fresh code-reviewer, ROUND scope, Super Z agent-7120f845)
No blocking, no major. Five minors:
R1-01 carried constraints scattered → FIXED by the Lead (todo.md
"Carried constraints" block with the five REQUIRED items + three
shared-file notes; review.md Accepted-risks populated).
R1-02 dead commit hash → FIXED by the Lead (append-only correction;
the reconciliation commit is 1d78e8f).
R1-03 T02 stub weak variant → FIXED (T02 implementer resumed:
every-method recording + exact sequence ["select","in","order"]
pinned; mutation-verified — a silent .limit narrowing now fails).
R1-04 mutation .all comment overclaim → FIXED (T05 implementer
resumed: justified by key topology; harmless singleton read named).
R1-05 dayKey rollover overclaim → FIXED (T06 implementer resumed:
render-driven semantics stated; rollover policy carried to T14).
All re-verified: focused suites green after each fix; full suite
28/226 green.

GATE: PASS

### T08 — OrderStatusBadge component

MODE: behavior
ACCEPTANCE: Supporting: AC-03/AC-07/AC-08

SCAFFOLD
$ pnpm generate component preparation order-status-badge
created : features/preparation/components/order-status-badge.tsx
skipped : —
replaced : —
manual : features/preparation/components/order-status-badge.test.tsx
(planned: the component capability generates no test)

RED
$ npx jest features/preparation/components/order-status-badge.test.tsx
Tests: 5 failed, 5 total — "Unable to find an element with text: New"
(the placeholder rendered; the mapping behaviour absent)

IMPLEMENT
STATUS_BADGE: Record<OrderStatus, {label, variant}> — the ui-lab
precedent mapping (new→neutral, preparing→primary, ready→success,
completed→outline [Lead-decreed gap-fill: terminal-calm, recorded per
T08-R03], cancelled→destructive); Record makes it compile-time total.
Variant type derived from the primitive's own cva
(NonNullable<VariantProps<typeof badgeVariants>["variant"]>) so it
cannot drift. Composes the shared Badge + Text only; the label text is
the accessible name (never colour-only).

GREEN
$ npx jest features/preparation/components/order-status-badge.test.tsx
Tests: 5 passed, 5 total

AFFECTED CHECKS (Lead re-ran)
$ npx jest features/preparation/components/ → 5/5
$ pnpm typecheck → clean
$ pnpm lint / prettier (implementer + reviewer) → clean

TASK REVIEW (fresh code-reviewer, Super Z agent-c91f425f)
No blocking, no major. T08-R01 minor: ReadonlyArray spelling would be
auto-rewritten by the lint-staged hook → fixed (readonly T[]; zero
warnings under --max-warnings=0). T08-R02 minor: the variant assertion
walks getByText(label).parent.props.className — verified sound today
(test-renderer host-only tree; mutually distinguishing tokens) but
couples to host-tree shape and cva class strings → ACCEPTED as-is
(honest docblock documents the trade; the data-level pin is an optional
future alternative). T08-R03 minor: completed→outline had no plan
trace → recorded here (Lead-decreed, terminal-calm rationale).

DIFF
features/preparation/components/order-status-badge.tsx (new)
features/preparation/components/order-status-badge.test.tsx (new,
manual)
Nothing else.

GATE: PASS

### T09 — OrderCard component

MODE: behavior
ACCEPTANCE: Acceptance: AC-03

SCAFFOLD
$ pnpm generate component preparation order-card
created : features/preparation/components/order-card.tsx
skipped : —
replaced : —
manual : features/preparation/components/order-card.test.tsx (planned);
model/order-display.ts NOT created (the card needed nothing
beyond an inline count fallback — the "if needed" condition
unmet)

RED
$ npx jest features/preparation/components/order-card.test.tsx
Tests: 12 failed, 2 passed, 14 total — the placeholder rendered; the
2 passes were nothing-should-render cases (vacuous until content
existed)

IMPLEMENT
Content: mono display number + OrderStatusBadge in a flex-wrap header;
screen-computed createdAtLabel/itemSummaryLabel captions with an
inline "N items" count fallback; assignment indicator "You"/"Assigned
to another employee" (outline Badge, words never colour-only, null
when unassigned). Actions in CardFooter gated on T07 affordance &&
callback && !readOnly (compact h-touch Buttons; primary Start/Ready,
destructive Cancel). Card-press via Pressable accessibilityRole=
"button" with an accessible name composed from orderStatusLabel
(post-remediation); NO wrapper when onPress is absent. The card is
purely presentational (callbacks only).
Mid-task test defect fixed by the implementer: RNTL v14 unmount is
async — await oneItem.unmount() (core/realtime precedent).

GREEN
$ npx jest features/preparation/components/order-card.test.tsx → 14/14
(20/20 after remediation: +6)

AFFECTED CHECKS (Lead re-ran)
$ npx jest features/preparation/ → 13 suites / 112 tests green
$ pnpm typecheck → clean
$ pnpm lint / prettier (implementer + reviewer) → clean
$ pnpm test:ci (implementer) → 30 suites / 250 tests, zero console

TASK REVIEW (fresh code-reviewer, Super Z agent-26b2a373)
T09-R01 MAJOR: no per-card pending-state surface — plan decision 5
(per-card disabled + label swap + repeat guard, AC-04/10) would be
unimplementable at T11/T13 (scopes exclude components/\*\*). → FIXED:
pendingAction?: "startPreparing"|"markReady"|"cancel" prop renders
disabled + label swap ("Starting…"/"Marking ready…"/"Cancelling…")
per the sign-in-form convention; per-action (other affordance stays
enabled); mutation-verified (removing the disabled wiring fails).
T09-R02 minor: accessible name used the raw status word (drift risk
vs T08's labels) → FIXED: orderStatusLabel(status) exported from
order-status-badge.tsx and the badge itself renders through it (one
source); the card's name composes from it.
T09-R03 minor: the "assigned to you" name branch unpinned → FIXED:
one focused test.
T09-R04 minor: header overflow risk at 200% scaling → FIXED: flex-wrap
(the repo's dense-row idiom).
T09-R05 minor: no press feedback on the card → FIXED:
active:opacity-90 (the Button primitive's own idiom).
Pin deviation (T07-R01 in fetch-active-orders.test.ts): ~7 additive
lines vs the granted "one line" — the file's own type+const+expect
idiom (a bare type alias trips no-unused-vars under
--max-warnings=0); load-bearing (negative-checked by the implementer;
direction verified by the reviewer). ACCEPTED as disclosed.

DIFF
features/preparation/components/order-card.tsx (new)
features/preparation/components/order-card.test.tsx (new, manual)
features/preparation/components/order-status-badge.tsx (modified:
orderStatusLabel export, badge renders through it)
features/preparation/components/order-status-badge.test.tsx
(modified: one export test)
features/preparation/api/fetch-active-orders.test.ts (modified: the
T07-R01 pin, Lead-granted)

GATE: PASS

### T10 — CancelOrderDialog component

MODE: behavior
ACCEPTANCE: Acceptance: AC-06

NOTE: the original T10 implementer's session was interrupted after
GREEN (its report and this entry were lost); the Lead re-verified every
claim below from the working tree this session, including reconstructing
RED by restoring the generator stub.

SCAFFOLD
$ pnpm generate component preparation cancel-order-dialog
created : features/preparation/components/cancel-order-dialog.tsx
skipped : —
replaced : —
manual : features/preparation/components/cancel-order-dialog.test.tsx
(planned: the component capability generates no test)

RED (Lead-reconstructed after the interruption: implementation moved
aside, stub regenerated, test run against it)
$ npx jest features/preparation/components/cancel-order-dialog.test.tsx
Tests: 4 failed, 1 passed, 5 total — the placeholder rendered; the one
pass was the vacuous no-target case (same class as T09's RED)

IMPLEMENT
Composes the shared ConfirmDialog only (decision 4): destructive=true
(the action removes an order), title names the display number,
description states stock-return + irreversibility, confirmLabel "Cancel
order" vs dismiss "Keep order" (a Cancel inside a cancel dialog is
ambiguous), busy passes through to the primitive's Working… swap, and
onConfirm fires the order echo — never the press event, never closing
the dialog (the screen closes on success). Presentational: single
import @/components/feedback; no fetch/store/Supabase. Null-guard:
`if (!open || !order) return null`.

GREEN
$ npx jest features/preparation/components/cancel-order-dialog.test.tsx
Tests: 5 passed, 5 total (5/5 after the T10-R02 docblock fix)

AFFECTED CHECKS (Lead re-ran)
$ npx jest features/preparation/ → 14 suites / 117 tests green
$ pnpm typecheck → clean
$ npx eslint <both files> --max-warnings=0 → clean (re-ran post-fix)
$ npx prettier --check <both files + plan.md> → clean

TASK REVIEW (fresh code-reviewer, Super Z agent-8b18c646)
No blocking, no major. T10-R01 minor: AC-06's rejection half unowned at
the dialog layer — feedback near the action is invisible behind an open
modal, so the screen must close the dialog on a rejected cancel → FIXED
Lead-side: plan.md test-strategy line reconciled (screen-owned error
feedback, recorded per the T06-revision precedent) + REQUIRED constraint
added to the T11/T13 packets (todo.md carried constraints). T10-R02
minor: test docblock misattributed "presentational" to decision 4 →
FIXED (one comment line, Lead-applied and disclosed here: the original
implementer context was lost to the interruption; re-verified 5/5).

DIFF
features/preparation/components/cancel-order-dialog.tsx (new)
features/preparation/components/cancel-order-dialog.test.tsx (new,
manual; one Lead-applied docblock line)
features/preparation/docs/plan.md (reconciled line, T10-R01)

GATE: PASS

### T11 — WorkspaceScreen + board-section + index route

MODE: behavior
ACCEPTANCE: Acceptance: AC-01, AC-02, AC-04, AC-05, AC-10

SCAFFOLD
$ pnpm generate screen preparation workspace
created : features/preparation/screens/workspace/workspace-screen.tsx,
features/preparation/screens/workspace/workspace-screen.test.tsx
$ pnpm generate component preparation board-section --screen=workspace
created : features/preparation/screens/workspace/components/board-section.tsx
$ pnpm generate route preparation index --role=preparation --screen=workspace --force
replaced : app/(preparation)/index.tsx (the planned Foundation-placeholder
overwrite — the ONLY sanctioned --force in this feature)
appended : features/preparation/index.ts (WorkspaceScreen export,
generator-owned)

RED
$ npx jest features/preparation/screens/workspace/
Tests: 16 failed, 16 total — every failure "Unable to find an element …"
against the TODO stub (behaviour missing, not a typo/import error)

IMPLEMENT
Screen owns the queries (active-orders, store-settings), the mutation
(useUpdateOrderStatusMutation with mutate-level onError → setActionError +
dialog close + invalidateQueries(preparationKeys.all) — T05-R02), the
assignment comparison (useAuth().profile.id — decision 3), per-card
pendingAction derived from isPending+variables (decision 5), the
seen-ids-diff announcement effect (decision 9, polite live region),
effectiveTimezone with silent degrade on absent OR FAILED settings read
(decision 8), screen-local formatCreatedAt (decision 10), Tabs on
compact/medium vs columns on expanded via useLayout, Refresh + Sign out
affordances, error passed as unknown (T04 O-1). board-section: title+count
header (tab mode omits it), card list, InlineError under the rejected
card. Zero edits to the route file and the barrel (generator shape kept).

GREEN
$ npx jest features/preparation/screens/workspace/ → 16/16
$ npx jest features/preparation/ → 15 suites / 133 tests
$ npx jest (repo-wide) → 32 suites / 271 tests

AFFECTED CHECKS (Lead re-ran)
$ pnpm typecheck → clean; eslint --max-warnings=0 → clean;
prettier --check → clean; zero console output (setLogSink pattern)

TASK REVIEW (fresh code-reviewer, Super Z agent-bd3e03cb)
No blocking, no major; five minors. Judgement calls: card-press
navigation to /order-details KEPT (AC-03's observable + decision 1;
deferral impossible — T13's scope excludes screens/workspace/\*\*);
board-section intra-feature imports CORRECT (privacy reading; the
generator stub itself imports @/components/ui); single-flight guard
ACCEPTABLE (the un-tracking scenario cannot occur — the :134 guard
blocks a second dispatch).

- T11-R01 minor: other cards look enabled while a transition is in
  flight but presses are no-ops → ACCEPTED (single-RPC-window trade;
  the reference itself blocks interactions during mutation processing;
  per-order in-flight map recorded as an optional future enhancement;
  one tablet = one session).
- T11-R02 minor: arrival caption persists until the next arrival →
  CARRIED to T12 (timer + cleanup per RN rules).
- T11-R03 minor: empty-group-within-populated-board unpinned → CARRIED
  to T12 (one-line assertion).
- T11-R04 minor: failed background refetch with stale data is silent →
  CARRIED to T12 (transient banner when isError && data !== undefined;
  T12's realtime multiplies background refetches).
- T11-R05 minor: formatCreatedAt can render 24:00 on h24-cycle ICU
  builds (Hermes tablets) → CARRIED to T12 (the model's % 24 absorption).

DIFF
features/preparation/screens/workspace/workspace-screen.tsx (new)
features/preparation/screens/workspace/workspace-screen.test.tsx (new,
manual)
features/preparation/screens/workspace/components/board-section.tsx
(new)
app/(preparation)/index.tsx (replaced — Lead scaffold, planned --force)
features/preparation/index.ts (appended — Lead scaffold, generator-owned)

GATE: PASS

### T12 — Orders realtime invalidation wired into workspace

MODE: behavior
ACCEPTANCE: Acceptance: AC-09

SCAFFOLD
$ pnpm generate realtime preparation orders --role=preparation
created : features/preparation/queries/use-orders-realtime.ts
skipped : features/preparation/queries/keys.ts (exists — correct)

RED
$ npx jest features/preparation/screens/workspace/
Tests: 4 failed, 22 total — spy.created empty (no subscription), fetch
re-call missing, banner absent, announcement clear absent (all the
missing-behaviour class; the 16 pre-existing T11 tests stayed green)

IMPLEMENT
useOrdersRealtime() called unconditionally in WorkspaceScreen (the hook
owns the channel lifecycle; AC-09 signal-only — no payload → state
path). The four T11 carried minors: ANNOUNCEMENT_CLEAR_MILLIS=6000
exported test seam + effect keyed on [announcement] with clearTimeout
cleanup (R02); empty-group sibling test pinning Preparing (0)/Ready (0)

- two "No orders" texts (R03 — own test rather than folding, which
  would have weakened the existing grouping test); InlineError banner
  when isError && data !== undefined (R04 — OfflineNotice is
  onlineManager-driven and cannot see an online 5xx; InlineError takes
  unknown per T04 O-1 and is transient on the next successful read);
  formatCreatedAt rebuilt from formatToParts with hour % 24 absorption
  mirroring model/store-day.ts (R05 — h24-cycle ICU guard; pinned by a
  midnight "00:00"/not-"24:00" characterization, honestly disclosed as
  un-RED-able on this Node's h23 ICU). Channel spy layered onto
  installMockAuth's client (no @/core/supabase import in the feature).

GREEN
$ npx jest features/preparation/screens/workspace/ → 22/22
$ npx jest features/preparation/ → 15 suites / 139 tests
$ npx jest (repo-wide) → 32 suites / 277 tests

AFFECTED CHECKS (Lead re-ran)
$ pnpm typecheck → clean; eslint --max-warnings=0 → clean; prettier
→ clean; zero console output

TASK REVIEW (fresh code-reviewer, Super Z agent-30a5de1b)
No blocking, no major; one minor. All four judgement calls upheld
(no separate hook test SUFFICIENT — the wrapper is byte-identical to
the template and the core layer is unit-tested; sibling test BETTER
than the remediation's letter; InlineError CORRECT; R05 disclosure
HONEST). AC-09 truth clause verified structurally (handler ignores
the payload; render solely from activeOrders.data; no payload→state
path anywhere in the feature).

- T12-R01 minor: comment claimed a newer arrival restarts the timer —
  false for an identical caption string (React same-value setState
  bailout); the older timer clears the new caption early; benign
  consequence → ACCEPTED with the comment corrected (Lead-applied,
  one comment line, disclosed; 22/22 re-verified). Epoch-keyed
  captions recorded as an optional future alternative.
- Out-of-scope observation (pre-existing core, NOT this diff):
  core/realtime removeChannel's void promise rejection is unhandled —
  carried to the Lead's foundation-chore notes (review.md), not this
  feature.

DIFF
features/preparation/queries/use-orders-realtime.ts (new, Lead
scaffold — byte-identical to the template, reviewer-verified)
features/preparation/screens/workspace/workspace-screen.tsx
(modified: wiring + R02/R04/R05)
features/preparation/screens/workspace/workspace-screen.test.tsx
(modified: +6 tests, channel spy, R03 pin)

GATE: PASS

### Round 2 GATE

MODE: round gate (all five task gates PASS: T08–T12)

ROUND VERIFICATION (Lead)
$ pnpm verify → ALL green (EXIT=0: typecheck, lint, format, 32 suites /
282 tests, db:verify, check:docs, generator smoke — after the smoke
fixture fix below)
$ git diff main --name-only | grep -v '^features/preparation/' → exactly
two: app/(preparation)/index.tsx (the planned placeholder replacement)
and tools/generator/smoke-test.mjs (the fixture fix below); 43 files /
+7678 / -16 total

SMOKE FIXTURE FIX (Lead-owned foundation chore, shared file, justified)
The generator smoke check "replaces the preparation index.tsx
placeholder deliberately" reads the TRACKED route as its fixture and
asserts it still contains FoundationPlaceholder — but the documented
first-feature workflow consumes exactly that placeholder (T11's
sanctioned --force). Without a fix, CI (which runs pnpm
generate:smoke as a dedicated step) would be permanently red once any
experience's first feature ships. Fixed in b4fce20: fall back to a
faithful placeholder copy once the tracked route is replaced; the
"repository was never written to" assertion now compares against the
actual tracked content. pnpm verify green afterwards. Justification
recorded in review.md (R2-S1).

ROUND REVIEW (fresh code-reviewer, ROUND scope, Super Z agent-41e393b8)
No blocking. R2-01 MAJOR: AC-10's card-anchored rejection feedback can
render nowhere (departed-order race; hidden-tab move on the tabs
layout) → FIXED by the resumed T11 implementer (agent-380c95fe):
visibleOrderIds derivation (columns = all groups; tabs = the selected
tab's group only) + orphanedActionError fallback rendered in the screen
body (same InlineError/unknown surface); two RED-first tests (both
failure modes) + exactly-once pin.
R2-02 minor (todo.md strikethrough erased T13's REQUIRED half) → FIXED
by the Lead. R2-03 minor (review.md Re-review block stale TODO) → FIXED
by the Lead. R2-04 minor (announcement no-ops unpinned) → FIXED
(characterization: same-data refresh, departure). R2-05 minor (pending
derivation vs mid-mutation refetch unpinned) → FIXED
(characterization: realtime event during unresolved mutation).
RE-REVIEW (same reviewer, resumed): R2-01 RESOLVED — mutual exclusion
by construction (one derivation, one render pass; never zero, never
two); RED-worthiness verified against the pre-remediation render tree;
no regressions (27/27, 15/144, 32/282; typecheck/lint/prettier clean;
zero console). R2-06 minor (new): the orphaned fallback persists until
the next action dispatch — the SAME lifetime the card-adjacent copy
always had (the sign-in-form convention) → ACCEPTED (consistency +
guaranteed visibility; auto-clearing would reintroduce the miss-it
race); T13 packet carries the note that the details screen should
adopt the same lifetime so the two screens agree.

GATE: PASS

### T13 — OrderDetailsScreen + route

MODE: behavior
ACCEPTANCE: Acceptance: AC-07, AC-10

SCAFFOLD
$ pnpm generate screen preparation order-details
$ pnpm generate route preparation order-details --role=preparation --screen=order-details
created : features/preparation/screens/order-details/order-details-screen.tsx
created : features/preparation/screens/order-details/order-details-screen.test.tsx
created : app/(preparation)/order-details.tsx
appended : features/preparation/index.ts (generator barrel export)

RED
$ npx jest features/preparation/screens/order-details/
Tests: 24 failed, 24 total — every failure "Unable to find an element
with role/text/label …" against the stub's "TODO: build this screen"
render (missing-behaviour class, not import/typo). Two disclosed
plumbing fixes preceded the valid RED: a missing fetchStoreSettings
mock import, and a null sentinel for the absent-param test (an
explicit undefined falls through the helper's default). A scratch
AppImage renderability pre-check test was run and deleted (its finding:
jest-expo cannot transform lucide's ESM — the first AppImage-rendering
test in the repo needs a file-local lucide-react-native mock).

IMPLEMENT
order-details-screen.tsx — branches FIRST on a missing/empty orderId
param (OrderDetailContent mounts only with a real id, T03-R03); read
states isPending → SkeletonList / isError → ErrorState "Order
unavailable" (retained stale data deliberately ignored — the brief
forbids stale content on this screen, unlike the workspace board) /
null → unavailable EmptyState / success → summary card (h2 + mono
display number, badge, Created HH:MM store-tz, assignment badge by
id) + actions footer (allowedOrderActions, per-action pending label
swap, one-in-flight repeat guard in both runTransition and
handleCancelRequested) + InlineError below the card (near-action,
unknown per T04 O-1) + items (variant_sku codepoint sort, AppImage
alt=product+variant, options "Type: Value" from the guarded wide-Json
unpack, brand, ×qty prominent, SKU mono caption) + CancelOrderDialog
(screen owns open/mutation/rejection); mutation onError →
setActionError + setCancelOpen(false) (T10-R01) + invalidate
preparationKeys.all (T05-R02); actionError cleared at dispatch only
(R2-06); fallback InlineError in the screen body for every non-loaded
state (R2-01); formatCreatedAt screen-local from the workspace (with
the % 24 midnight guard). Route stays a thin param-reader
(useLocalSearchParams<{orderId?: string}>() passed through; docblock
documents decision 1 + the screen-owned param branch).

GREEN
$ npx jest features/preparation/screens/order-details/ → 24/24
$ npx jest features/preparation/ → 16 suites / 168 tests
$ node node_modules/.bin/jest (repo-wide) → 33 suites / 306 tests

AFFECTED CHECKS (Lead re-ran)
$ pnpm typecheck → clean; eslint --max-warnings=0 → clean; prettier
→ clean; zero console output (jest invoked directly, bypassing the
npx wrapper warning)

TASK REVIEW (fresh code-reviewer, Super Z agent-8d6cd18d)
No blocking, no major; three minors + one note. All four judgement
calls upheld: the lucide mock ACCEPT (premise mechanically verified
against jest's transformIgnorePatterns; file-local blast radius; the
second consumer — catalog — triggers promotion, recorded as T13-N01);
failed-fetch-retryable vs no-such-order-no-retry ACCEPT (reference
§24 grounds the shared "Order unavailable" title; the retry
distinction is ErrorState's own canRetry contract); variant SKU KEEP
(reference §24 Lean V2 includes it; load-bearing for the decision-7
ordering pin); mid-rejection terminal-refetch feedback placement
ACCEPT (card renders for every loaded state; fallback covers
non-loaded; mutual exclusion by construction; both homes pinned,
exactly-once).

- T13-R01 minor: formatCreatedAt byte-identical in both screens,
  PENDING_ACTION_BY_TARGET + pending labels in three places — drift
  risk between the two screens sharing one mutation → CARRIED to T14
  (the third consumer): lift formatCreatedAt into
  features/preparation/model/order-display.ts (a planned allowed
  manual file), both screens import it.
- T13-R02 minor: non-retryable read failure (PGRST301/42501) unpinned
  — converges visually with the no-such-order EmptyState → CARRIED to
  T14: one additive test (non-retryable AppError read → no "Try
  again").
- T13-R03 minor (optional hardening): option label as React key —
  duplicate keys only from malformed snapshots migration 07 cannot
  produce → ACCEPTED (defer); the one-line compound key folded into
  T14's sanctioned touch of the file.
- T13-N01 note: promote the file-local lucide mock to shared test
  infrastructure only when a second suite renders AppImage (likely
  catalog).

All six carried constraints verified implemented AND pinned by the
reviewer (T03-R03 two no-fetch assertions; T10-R01 dedicated test with
dialog-closed-first ordering; T05-R02 every rejection test asserts
refetch ≥ 2; T04 O-1 zero error.kind reads, grep-verified; R2-06
feedback survives a successful terminal refetch; R2-01 exactly-once
visibility in both homes). Actions derive from allowedOrderActions —
no duplicated state machine. Out-of-scope, no action: no realtime
subscription on this screen (plan-conformant — the workspace beneath
it on the stack stays subscribed and invalidates transitively).

GATE: PASS

### T14 — StoreDayHistoryScreen + route

MODE: behavior
ACCEPTANCE: Acceptance: AC-08

SCAFFOLD
$ pnpm generate screen preparation store-day-history
$ pnpm generate route preparation history --role=preparation --screen=store-day-history
created : features/preparation/screens/store-day-history/store-day-history-screen.tsx
created : features/preparation/screens/store-day-history/store-day-history-screen.test.tsx
created : app/(preparation)/history.tsx
appended : features/preparation/index.ts (generator barrel export)

RED
(The implementer session hit a context deadline after completing the
work but before reporting — the Lead re-verified everything and
reconstructed RED honestly, per the T10 recovery precedent.)
$ npx jest features/preparation/screens/store-day-history/
Reconstructed: implementation moved aside, a fresh generator stub
regenerated in its place, the suite run → 11 failed / 11 total, every
failure "Unable to find an element …" against the stub's "TODO: build
this screen" render (missing-behaviour class); implementation restored
→ 11/11. The T13-R01 lift's unit test: "Cannot find module
'./order-display'" with the model moved aside (the documented
missing-module exception for a lift) → 3/3 restored.

IMPLEMENT
store-day-history-screen.tsx — composed hook ladder (isPending →
SkeletonList; isError && data === undefined → ErrorState wired to the
hook's COMPOSED settings-first refetch; day-empty EmptyState; success →
groups); groupTerminalOrders (the model's helper — never re-derived)
→ Completed then Cancelled sections with label+count, per-section "No
orders"; read-only OrderCards (lean history row adapted with an empty
placeholder item array — the screen ALWAYS supplies its own
terminalSummaryLabel caption: status word + terminal time in store tz —
so the placeholder can never surface); card press →
router.push /order-details (AC-03); day header = window.startUtc via
en-CA weekday+long date in the RESOLVED store timezone (decision-8
degrade, same resolver as the window); stale-data policy = the
workspace T11-R04 pattern (isError && data !== undefined → transient
InlineError banner, data kept, clears on next success); back ghost
button in every state; R1-05 decided: event-driven rollover, NO
refetchInterval (docblock rationale: the day key rolls on any
re-render; a parked-across-midnight screen keeps its day — accepted,
self-correcting; a timed poll would drain a read-only tablet surface).
model/order-display.ts — the T13-R01 lift: formatCreatedAt
(logic-identical to both deleted screen-local copies) + 3 unit tests
(HH:MM shape, 2-digit padding, midnight % 24 with the h23-ICU
disclosure). workspace-screen.tsx — History affordance (outline
compact, matches Refresh) → router.push("/history") + formatCreatedAt
local copy deleted → import; +1 navigation test. order-details-screen.
tsx — formatCreatedAt deleted → import + the T13-R03 compound key;
+1 T13-R02 test (forbidden non-retryable read → no "Try again").
Route file untouched (byte-identical to the generator template).

GREEN
$ npx jest features/preparation/screens/store-day-history/ → 11/11
$ npx jest features/preparation/model/order-display.test.ts → 3/3
$ npx jest features/preparation/screens/workspace/ → 28/28
$ npx jest features/preparation/screens/order-details/ → 25/25
$ npx jest features/preparation/ → 18 suites / 184 tests
$ node node_modules/.bin/jest (repo-wide) → 35 suites / 322 tests

AFFECTED CHECKS (Lead re-ran)
$ pnpm typecheck → clean; scoped eslint --max-warnings=0 → exit 0;
prettier → clean; zero console output observed in every run

TASK REVIEW (fresh code-reviewer, Super Z agent-642e8794)
No blocking, no major; one minor + two notes. All six judgement calls
upheld (lean-row adaptation honest — the card's only order_items
consumer is permanently overridden by the screen's own caption,
"0 items" null-asserted; R1-05 decision + pin 90% sufficient → the
gap became T14-R01; day-empty-replaces-groups correct for the
reference's "per terminal section/day"; stale-data policy correctly
the workspace pattern; clock-relative fixtures sound — the AC-08
day-boundary shape is pinned ABSOLUTELY with fake timers spanning both
boundaries through the REAL model; day header format acceptable, zone
consistent with the window by construction). All seven carried
constraints verified satisfied.

- T14-R01 minor: the "no refetchInterval" pin could not fail as
  written (jest.setSystemTime does not fire scheduled timers — verified
  empirically against @sinonjs/fake-timers) → FIXED Lead-applied and
  disclosed (implementer context lost to a session deadline, T10-R02
  precedent): the parked phase now also advances timers 2h and asserts
  the read was NOT re-called + the old header retained — a reintroduced
  timed poll fires under the advance and fails the test; 11/11,
  prettier, eslint re-verified.
- T14-N01 note: todo.md's T14 scope line lagged the sanctioned packet
  → reconciled at the gate (Lead).
- T14-N02 note: stale suite counts in the Lead's GREEN note → the
  corrected figures (18/184, 35/322) recorded in this entry.

GATE: PASS

### Round 3 gate — Order details and store-day history

Tasks in scope: T13, T14 (both GATE: PASS above).

pnpm verify: EXIT=0 — typecheck, lint, format, the full jest run
(35 suites / 322 tests), and the generator smoke suite all green
(includes the R2-S1 placeholder-fixture fallback path).

Cross-task round review (fresh code-reviewer, Super Z agent-94d9cf80):
no blocking, no major; two minors.

- R3-01 minor: the Lead-applied T14-R01 fix (advanceTimersByTime)
  introduced the repo's only console output — an act() warning from the
  mock auth's pending INITIAL_SESSION update firing on the faked timer;
  the T14 "zero console" records were made against the pre-fix test →
  FIXED Lead-applied and disclosed at this gate: the parked-phase clock
  work wrapped in await act(); 11/11 + zero console output REPO-WIDE
  re-verified (rg audit of the full run); worklog correction recorded
  in this entry.
- R3-02 minor: findings from T08 onward sat structurally outside the
  declared Findings table (loose pipe-lines after the Quality-audit
  TODOs and inside the Accepted-risks list; introduced at the R2 gate)
  → FIXED Lead-applied at this gate: all 29 loose rows merged into the
  Findings table proper; prettier + tools/check-docs.mjs re-verified.

All eight cross-task seams PASS (shared formatter; navigation
contract; error-surface consistency; workspace seam incl. the
realtime-beneath-history argument; day-model reuse; the T13-R02/R03
folds; docs consistency; round scope — 51 files vs 80b8ac3: 47 under
features/preparation/\*\*, the three route files, and the one sanctioned
shared-tool change from R2-S1; zero changes under core/, components/,
features/auth/, app/\_layout.tsx, or migrations).

GATE: PASS

### Runtime verification — final (PR #6 draft, F-01)

Environment: Expo web (`CI=1 pnpm web`, port 8081, Metro CI mode —
the sandbox's inotify limit forbids watch mode), the hosted throwaway
test project from `.env` (akxigjsifwyolkadofnj.supabase.co), the
preparation test account from docs/environment.md, driven through a
headless browser. Screenshots: /tmp/kisok-\*.png (not committed).

- Sign-in gate: unauthenticated → /sign-in; signing in as
  preparing@gmail.com → redirected to `/`, the workspace renders
  (Preparation Workspace, Refresh / History / Sign out affordances).
- AC-01/AC-02 (board + states): the board renders LIVE against the
  hosted backend; with zero active orders it renders the empty state
  ("No active orders" + "New orders will appear here as customers
  place them."). The backend has zero rows in `orders` (REST-verified
  with the prep session), so the populated-board runtime half (groups
  with counts) is covered by the component tests; the empty state is
  the live-observable one.
- AC-08 (history): History affordance press → `/history`; the screen
  renders Back, the date header "Tuesday, September 1, 2026" (the
  correct weekday for today, derived through the store-timezone
  resolver), and the day-empty state ("No completed or cancelled
  orders yet" + description).
- AC-07 (details, unavailable state): `/order-details?orderId=<uuid>`
  → "Order unavailable" + "We couldn't find this order. Go back and
  reopen it from the board or history." (the no-such-order no-retry
  path against the real backend).
- Back navigation works from history and details → `/`.
- AC-09 (realtime subscription): the browser console shows
  `[realtime] channel status {channel: "preparation-orders", status:
"SUBSCRIBED"}` — the subscription is LIVE against the hosted
  project's Realtime. The event → invalidation → refetch half could
  not be exercised live (see below) and is covered by the channel-spy
  hook/screen tests.
- Zero page errors; the console carries only expected dev-mode logs
  (auth state changes, the channel status, React devtools notice).
- Responsive contract sizes, all rendering: 1280×800 (tablet
  landscape), 800×1180 (tablet portrait), 480×900 (compact web).
  Five size×screen combos captured (1280×800 workspace;
  800×1180 workspace+history; 480×900 history+details); the
  medium/compact layout switch itself is pinned by the workspace
  suite's tabs-vs-columns tests. The 480×900 workspace and 1280×800
  history/details combos were live-verified interactively but not
  screenshotted.
- Live mutation path (new→preparing→ready / cancel) and the live
  realtime event: **UNVERIFIED, environment reason recorded** — the
  hosted test project has zero rows in `orders` AND zero rows in
  `inventory` (REST-verified), `create_order` validates stock, and the
  only sanctioned stock-seeding RPCs (`set_inventory_quantity`,
  `apply_inventory_adjustment`) require an admin profile, for which
  no test account exists (docs/environment.md lists preparation +
  customer only). No safe live data exists to mutate. Per the plan's
  risk rule this path is verified by the focused automated tests and
  recorded UNVERIFIED for the live leg.
- Native/Android tier: **explicitly unverified** (no emulator/device
  in this environment; no native configuration touched by this
  feature; the pre-existing Maestro foundation smoke is unchanged).

### Final verification — the Feature Gate's local legs (PR #6 draft)

`pnpm verify` on the final HEAD (47874a2, after the F-02..F-05 doc
fixes): EXIT=0 — typecheck, lint, format, the full jest run
(35 suites / 322 tests), db:verify (graceful local skip: PostgreSQL
unavailable in this sandbox — the schema leg runs only in CI, where
KISOK_DB_VERIFY_REQUIRED=1), check-docs, and the generator smoke
suite. The verify cadence is round-gate-level, not per task gate
(plan reconciled below); every task gate carries its own
affected-checks output.
