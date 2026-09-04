# Checkout — worklog

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

_None yet._

### T01 — create-order-response schema

MODE: behavior
ACCEPTANCE: Supporting AC-07, AC-08

SCAFFOLD (Lead, before delegating)
$ pnpm generate schema checkout create-order-response
created : features/checkout/model/create-order-response.schema.ts
features/checkout/model/create-order-response.schema.test.ts
skipped : —
replaced : —
manual : —
note : placeholder Zod schema + test generated green; task replaces the
placeholder with the real discriminated-union contract from
migration 20260826050007 (success lines 133–139/357–362,
stock_conflict lines 187–206) and proves RED → GREEN.

RED (behavior)
$ npx jest features/checkout/model/create-order-response.schema.test.ts
Test Suites: 1 failed · Tests: 37 failed, 556 passed, 593 total
Intended failure: the generated placeholder schema (z.object({ id: z.uuid() }))
has NO kind discrimination — every contract case failed for the missing
union, including the required unknown-`kind` case:
● create-order-response schema › rejects a payload with an unknown kind
Expected: true / Received: false (no issue at path "kind")
Implementer strengthened one vacuous case (asserted only .success===false)
to assert the unrecognized-keys issue path and re-ran RED: 37/37 failing
for missing-contract reasons — not typos or import errors.

IMPLEMENT
features/checkout/model/create-order-response.schema.ts — discriminated
union on `kind` (z.strictObject × 2): success {order_id, display_number,
created_at} and stock_conflict {conflicts[variant_id, requested_quantity,
available_quantity].min(1)}. display_number pinned to the real
public.orders check constraint ^[A-HJ-NP-Z2-9]{6}$ (migration 04:50–51);
created_at z.iso.datetime({offset:true}) (timestamptz-in-jsonb form);
checkout-local postgresUuidSchema regex (Zod 4 z.uuid() is stricter than
the Postgres uuid contract — same trap documented by catalog's R08).
features/checkout/model/create-order-response.schema.test.ts — 37 → 43
behavioural cases (see review remediation below).

GREEN
$ npx jest features/checkout/model/create-order-response.schema.test.ts
Tests: 43 passed, 43 total
$ pnpm test -- --testPathPatterns=create-order-response
Test Suites: 55 passed, 55 total · Tests: 599 passed, 599 total

AFFECTED CHECKS
$ pnpm typecheck → clean (exit 0)
$ pnpm lint → zero warnings (expo lint)
$ npx prettier --check <both model files> → clean
$ pnpm test (full suite) → 55 suites / 599 tests / zero console output

TASK REVIEW (fresh code-reviewer, agent-b063e827)
Verified independently: contract fidelity against migration 07 (all line
citations accurate), display_number pinning is the real constraint,
conflicts.min(1) justified by jsonb_agg null-over-zero-rows + the
conflict_items-is-not-null guard, quantity constraints match real checks,
created_at form empirically verified, uuid choice empirically verified,
pure model layer, generator-conform output, scope clean, tests assert
exact issue paths. No blocking findings.
Findings: F-01 major (worklog evidence not yet recorded — Lead action,
resolved by this entry), F-02 minor (naive created_at rejection untested),
F-03 minor (non-object root untested), F-04 minor (todo scaffold status
stale — resolved by this update).
Remediation: F-02/F-03 closed by same-implementer resume (added naive
timestamp row, non-object roots "" path, conflicts:null case; 37→43 tests;
all green). F-01/F-04 closed by this entry + todo update.

DIFF
features/checkout/model/create-order-response.schema.ts (new)
features/checkout/model/create-order-response.schema.test.ts (new)
Nothing outside the task's allowed scope (git status: only Lead's docs).

GATE: PASS

### T02 — normalized-request pure rules

MODE: behavior
ACCEPTANCE: Acceptance: AC-05

SCAFFOLD (Lead — N/A for this task)
manual artifact, planned in plan.md's Allowed manual files:
features/checkout/model/normalized-request.ts (+ colocated test)

RED (behavior)
$ npx jest features/checkout/model/normalized-request.test.ts
Test suite failed to run — Cannot find module './normalized-request'
Intended failure for a planned MANUAL artifact: the module does not exist
yet, so the required merged-one-item behavior is missing. The @/features/cart
type import resolved and Jest located the test file — not a typo or path
error.

IMPLEMENT
model/normalized-request.ts — normalizeCartLines(readonly CartLine[]):
groups by lowercased variantId (same variant + different selections/casing
→ ONE summed item), items EXACTLY {variant_id, quantity} sorted by
code-unit order of canonical uuid text, deterministic byte-identical output;
fingerprint mirrors the server's canonical form (kiosk.checkout.lean.v1
header + sorted id:qty rows, migration 07:107–114) and never travels to the
server; throws on empty lines / >100 distinct variants (MAX_NORMALIZED_ITEMS)
/ non-integer or out-of-1..2147483647 sums. Sole import: type-only CartLine
from @/features/cart (public API).
model/normalized-request.test.ts — 15 cases → 16 after remediation.

GREEN
$ npx jest features/checkout/model/normalized-request.test.ts
Tests: 16 passed, 16 total
$ npx jest features/checkout → 2 suites / 59 tests passed

AFFECTED CHECKS
$ pnpm typecheck → clean (exit 0)
$ npx eslint <both files> → zero issues
$ npx prettier --check <both files> → clean
$ pnpm test (full suite, reviewer-rerun) → 56 suites / 614 tests green

TASK REVIEW (fresh code-reviewer, agent-e99603c1)
Independently verified: fingerprint byte-form fidelity vs migration
107–114; sort-order equivalence (0 mismatches over 200,000 random uuid
pairs); cap interpretation (distinct variants post-merge, both boundaries
tested); canonicalization; type-only public import; purity; no server-logic
reimplementation. No blocking findings.
Findings: R-T02-01 major (non-mutation assertion vacuous — the guarded array
was never an argument), R-T02-02 major (worklog evidence unrecorded — Lead
action, resolved by this entry), R-T02-03 minor (changed-cart → different
fingerprint untested), R-T02-04 minor (docblock 9900 arithmetic wrong).
Remediation: same-implementer resume — guarded array now the actual input
(guard-teeth proven: an injected in-place-sort probe FAILS the guard, then
fully reverted); added the D2 binding inequality test (16 total); docblock
and test-comment arithmetic reworded to the real reasoning.

DIFF
features/checkout/model/normalized-request.ts (new)
features/checkout/model/normalized-request.test.ts (new)
Nothing outside the task's allowed scope.

GATE: PASS

### T03 — checkout-attempt record schema

MODE: behavior
ACCEPTANCE: Supporting AC-06, AC-07

SCAFFOLD (Lead, before delegating)
$ pnpm generate schema checkout checkout-attempt
created : features/checkout/model/checkout-attempt.schema.ts
features/checkout/model/checkout-attempt.schema.test.ts
skipped : —
replaced : —
manual : —

RED (behavior)
$ npx jest features/checkout/model/checkout-attempt.schema.test.ts
Tests: 77 failed, 4 passed (81 total)
Intended failure: the generated placeholder (z.object({ id: z.uuid() }))
cannot parse a valid attempt record — the entry-evidence case "rejects a
record missing clientRequestId" failed because the placeholder's only
issue is at `id`. The 4 pre-passing cases are the non-object-root
rejections, which the placeholder also rejects at the root path —
pre-existing behaviour, not the new contract. Reviewer independently
reproduced the exact 77/4 split.

IMPLEMENT
model/checkout-attempt.schema.ts — versioned envelope (version: literal 1),
z.discriminatedUnion("status", …): unresolved (NO success/cleanup) vs
confirmed (MUST carry success{orderId, displayNumber, createdAt} +
cleanup{cartClear: pending|done|failed}) — impossible combinations
unrepresentable. Checkout-local postgres uuid regex; items exactly
{variant_id, quantity} with .int().positive().max(2147483647),
.min(1).max(MAX_NORMALIZED_ITEMS from T02) + case-insensitive
distinct-variant refine (mirrors K1001); fingerprint non-empty opaque text;
lineSnapshots checkout-owned CartLine-shaped (1..99, nullable imageUri) —
deliberately not importing the cart's Zod schema (restore must not depend
on another feature's schema evolution); displayNumber/createdAt pinned to
T01's exact shapes (locally defined, cross-referenced comments).
model/checkout-attempt.schema.test.ts — 81 → 89 cases after remediation.

GREEN
$ npx jest features/checkout/model/checkout-attempt.schema.test.ts
Tests: 89 passed, 89 total
$ npx jest features/checkout → 3 suites / 148 tests
$ pnpm test:ci → 57 suites / 704 tests, zero console output

AFFECTED CHECKS
$ pnpm typecheck → clean (exit 0)
$ npx eslint <both files> → zero issues
$ npx prettier --check <both files> → clean

TASK REVIEW (fresh code-reviewer, agent-283b40c7)
Independently verified: D1/D4 contract complete; impossible-combination
enforcement airtight both directions; pinned shapes byte-identical to T01
and the migrations; case-insensitive duplicate refine consistent with the
RPC's uuid-cast distinct count; snapshot ownership sound; RED reproduced
exactly (77/4 with the right reasons); type pins have real teeth.
Findings: T03-R1 major (no items↔lineSnapshots cross-field consistency —
empty/mismatched snapshots restored cleanly, contradicting the module's
own fail-loud boundary contract), T03-R2 minor (quantity ceiling claim vs
schema), T03-R3 minor (success unknown-field untested), T03-R4 (worklog —
Lead action, this entry).
Remediation (same-implementer resume): lineSnapshots .min(1) +
snapshotVariantParity set-equality refine on BOTH branches (teeth proven:
neutralized refine fails exactly the 4 new hardening tests, then restored);
.max(2147483647) added with migration citation; success unknown-field case.
81 → 89 tests. Three accept-path fixtures gained a parity-satisfying
snapshot entry — assertions unchanged, no test weakened.

DIFF
features/checkout/model/checkout-attempt.schema.ts (new)
features/checkout/model/checkout-attempt.schema.test.ts (new)
Nothing outside the task's allowed scope.

GATE: PASS

### T04 — submit-order api + mutation hook

MODE: behavior
ACCEPTANCE: Supporting AC-07, AC-08, AC-09, AC-10

SCAFFOLD (Lead, before delegating)
$ pnpm generate mutation checkout submit-order
created : features/checkout/api/submit-order.ts
features/checkout/queries/use-submit-order-mutation.ts
features/checkout/queries/keys.ts
skipped : —
replaced : —
manual : —
note : neutral scaffold — placeholder input/throw in the api module, a
thin useMutation hook with a TODO invalidation, and feature-local
keys. The task wires them to the T01 response schema and the
create_order contract.

RED (behavior)
$ npx jest features/checkout/api
Tests: 10 failed, 10 total
Every call rejected with the scaffold's NOT_IMPLEMENTED AppError and the
args never reached the create_order RPC — the entry-evidence failure.
Honest note: the queries suite passed in RED (2/2) — the generator had
already wired mutationFn transport; those tests characterize the contract
T09 will drive.

IMPLEMENT
api/submit-order.ts — SubmitOrderInput {clientRequestId, items:
NormalizedOrderItem[]}; submitOrder → callRpc("create_order",
{client_request_id, items}, createOrderResponseSchema); non-AppError
rejections funnel through toAppError so every escaping failure IS an
AppError (D3 classification safety — documented). Doc comments keep the
server-owns-correctness + same-id-retry guidance.
queries/use-submit-order-mutation.ts — thin transport hook; the no-op
onSuccess invalidation REMOVED per D12 (checkout owns no queries; catalog
refresh is not checkout's concern) with comment; no lifecycle logic (D8).
queries/keys.ts — untouched generated surface.
api/submit-order.test.ts + queries/use-submit-order-mutation.test.tsx —
client-boundary mock + fetch-catalog/use-catalog precedents.

GREEN
$ npx jest features/checkout/api → 11 passed, 11 total
$ npx jest features/checkout/queries → 2 passed
$ npx jest features/checkout → 5 suites / 161 tests

AFFECTED CHECKS
$ pnpm typecheck → clean
$ npx eslint <5 files> → zero issues
$ npx prettier --check <5 files> → clean
$ pnpm test:ci (reviewer-rerun) → 59 suites / 716 tests, zero console output

TASK REVIEW (fresh code-reviewer, agent-3bc6822f)
Verified: exact snake_case args pinned by callsTo; both families validated
(stock_conflict resolves, never rejects — migration returns jsonb); every
K-code/SQLSTATE maps to the right kind/code/retryable; AppError pass-through
preserves identity (core errors test pinned); raw TypeError("fetch failed")
genuinely rejects → network kind (the D3 proof); hook honestly thin; keys
byte-identical to template; generator --dry-run confirms the scaffold
paths; mutation-cache GC workaround sound; no duplicate-order machinery
client-side. No blocking or major findings.
Findings: T04-R1 minor (worklog — Lead action, this entry), T04-R2 minor
(userMessage not asserted in mapping table), T04-R3 minor (auth kind row).
Remediation: same-implementer resume — all rows now assert exact
userMessage pass-through (no-re-wrap contract has teeth); PGRST301 → auth
row added. 10 → 11 tests.

DIFF
features/checkout/api/submit-order.ts (new)
features/checkout/api/submit-order.test.ts (new)
features/checkout/queries/use-submit-order-mutation.ts (new)
features/checkout/queries/use-submit-order-mutation.test.tsx (new)
features/checkout/queries/keys.ts (new, generated untouched)
Nothing outside the task's allowed scope.

GATE: PASS

### ROUND 1 GATE — domain model & contract

ROUND DIFF REVIEW (Lead)
9d16bcc..c06d358 plus the round-remediation commit: 13 code files, all
inside features/checkout/ (model/ 4+3 tests, api/ 1+1, queries/ 3+1).
Cross-task contracts verified: T04's args construction consumes T02's
NormalizedOrderItem exactly; T03 persists the same shape; T01/T03 shared
primitives now mechanically single-sourced (post-remediation).

ROUND CHECKS
$ pnpm test → 60 suites / 723 tests, zero console output
$ pnpm typecheck → clean
$ pnpm lint → zero warnings (exit 0)
$ npx prettier --check <round files> → clean

ROUND REVIEW (fresh code-reviewer, agent-e64e45a8)
Examined and clean: contract fidelity of all four modules against the
migrations; the normalization→persistence→submission chain (no K1001
escape, no K1003 hazard); mutation retry disabled; boundaries (only
type-only cross-feature import; Supabase only in api/); worklog/todo
accuracy; no store/screens/routes built (correctly later rounds).
Findings: R1-01 minor (T01/T03 duplicate primitives with no mechanical
linkage), R1-02 minor (no runtime T02→T03 integration test), R1-03 minor
(stale todo checkpoint line).
Remediation: fresh round-remediation implementer (agent-2e9f1b68) —
consolidated postgresUuidSchema/displayNumberSchema/createdAtSchema exports
from create-order-response.schema.ts (imported by checkout-attempt.schema),
exported MAX_RPC_QUANTITY (single source), added
checkout-model-integration.test.ts (6 tests: capped 100-variant cart
round-trips normalization → record on both status branches, exact
fingerprint binding, quantity ceiling both sides). Teeth proven:
displayNumber regex mutation in the shared module now fails BOTH suites
(mechanical linkage proven); quantity-cap mutation fails the ceiling tests.
R1-03 fixed in todo by the Lead.

ROUND 1 GATE: PASS
