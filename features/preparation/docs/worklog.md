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
