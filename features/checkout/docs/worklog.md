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

### T05 — Cart public clearCartDurable() extension

MODE: behavior
ACCEPTANCE: Supporting AC-07, AC-11

SCAFFOLD (Lead — N/A for this task)
owning-feature edit inside features/cart (plan D5, external-changes list);
no generator capability applies to editing an existing feature's public
index and delegates.

RED (behavior)
$ npx jest features/cart/state/cart-store.test.ts features/cart/state/use-cart.test.tsx
Tests: 5 failed, 59 passed — the 4 new clearCartDurable cases failed with
"clearCartDurable is not a function" and the public-surface pin failed on
the missing export. All 59 pre-existing tests stayed green: missing
behavior, not a regression. (Reviewer independently reproduced the exact
5/59 split in a sandbox replica.)

IMPLEMENT
features/cart/state/use-cart.ts — ONE new plain-action delegate
clearCartDurable(): Promise<StorageWriteResult> → useCartStore.getState().
clear(). Deliberately NOT gated on hydration (documented: pure pass-through
of the ungated internal clear(); pre-owner remove-failure fails closed via
rawDiscard; a gate would silently skip or fabricate). Caller requirement
for recovery flows documented (mid-hydrate interleaving: disk stays honest,
memory can resurrect — await hydration first).
features/cart/index.ts — clearCartDurable exported with the plain actions;
doc list updated with the precise uniqueness claim (only one resolving a
durable-write StorageWriteResult; hydrateCart is awaitable for completion).
features/cart/state/cart-store.test.ts — new describe, 4 tests: real-
singleton end-to-end (persisted, memory empty, disk miss, owner kept, lock
holds); removeItem-failure fallback (resolves the overwrite's persisted,
disk = explicit empty envelope — the store's REAL semantics); both-fail
(honest rejected + clearFailed); pre-hydrate stale-key removal.
features/cart/state/use-cart.test.tsx — exact-surface pin widened 13 → 14
names (full key-equality retained — teeth intact; necessary for the
planned export).

GREEN
$ npx jest features/cart → 11 suites / 187 tests
$ pnpm test (full) → 60 suites / 727 tests

AFFECTED CHECKS
$ pnpm typecheck → clean
$ npx eslint <4 files> → zero issues
$ npx prettier --check <4 files> → clean

TASK REVIEW (fresh code-reviewer, agent-cb153307)
Verified: seam minimality per D5 (one-line pass-through; all rejected
alternatives still rejected; no checkout consumer yet — additive); gating
decision traced through cart-store (fail-closed pre-owner pinned by an
existing store test); lock semantics correct (test asserts locked holds);
splice hygiene sound; surface pin teeth retained; additivity verified
line-by-line; RED reproduced exactly.
Findings: F-T05-01 minor (index doc "alone is awaitable" factually wrong),
F-T05-02 minor (mid-hydrate interleaving can resurrect memory lines while
disk stays honest — PRE-EXISTING store behavior, also exists for
clearCartForSignOut, unreachable in the primary post-success path, but
relevant to T12 recovery composition), F-T05-03 minor (todo glob did not
literally cover the .tsx pin file — honest flag, sound interpretation).
Remediation: F-T05-01 + F-T05-02(a) closed by same-implementer resume
(doc-only: precise uniqueness claim; recovery caller requirement
sentences). F-T05-02(b): the hydration-before-clear sequencing requirement
is carried into the T06/T12 task notes in todo.md (this update).
F-T05-03: recorded here; todo glob amended to \*.test.ts(x).

DIFF
features/cart/state/use-cart.ts, features/cart/index.ts,
features/cart/state/cart-store.test.ts,
features/cart/state/use-cart.test.tsx
Scope note: use-cart.test.tsx is the colocated surface-pin suite whose
13-name equality necessarily breaks when the planned export lands — the
"existing test files" allowance covers it; recorded per F-T05-03.

GATE: PASS

### T06 — Checkout attempt store

MODE: behavior
ACCEPTANCE: Acceptance: AC-04, AC-06, AC-09, AC-10, AC-11

SCAFFOLD (Lead, before delegating)
$ pnpm generate store checkout attempt
created : features/checkout/state/attempt-store.ts
features/checkout/state/attempt-store.test.ts
skipped : —
replaced : —
manual : —
note : neutral persistence-honest store skeleton (hydrate/clear/persist
pattern, injectable backend factory) — the task replaces the
placeholder shape with the attempt lifecycle state machine.

### Draft PR opened (Lead)

D14 (no-push-credentials) RESOLVED: credentials provided by the human
mid-session. Pushed `feature/checkout` (657018d at push time) and opened
Draft PR #13 targeting `develop`:
https://github.com/mohammed7779948484-tech/Kisok_react_app/pull/13
The PR template carries PENDING gates; evidence will be synchronized with
this worklog as tasks/rounds pass. Remote CI now runs on every push.

RED (behavior)
$ npx jest features/checkout/state/attempt-store.test.ts
Tests: 37 failed, 37 total
Right failure: the module loads (imports resolve) but every lifecycle
action is missing — "prepareAttempt is not a function",
"classifySubmitOutcome is not a function". Missing behavior, not a typo.

IMPLEMENT
state/attempt-store.ts — full replacement of the skeleton shape (factory +
singleton, injectable backend AND deps {idFactory, clearCart, hydrateCart,
lockCart, unlockCart, submit} — defaults bind the real cart seam + api):
six-phase machine; prepareAttempt (persist-before-submit; write failure →
persist-failed + no lock + no submit; same-fingerprint retry reuses the id
with NO new write; changed fingerprint → unresolved-attempt-exists;
confirmed-present refuse; recovery-pending refuse while the first durable
read has not completed); resolveSuccess (D4: durable-confirm → hydrate →
clear → track; write-failure keeps disk unresolved → idempotent
re-confirmation on restart; clear-failure keeps phase confirmed with
cartClear failed); resolveStockConflict/resolveDefiniteFailure (definite
no-order: plain-remove discard documented, unlock, payload to state);
resolveUnknown (record stays durable-unresolved, cart stays locked);
classifySubmitOutcome (the ONE exported D3 boundary — response wins;
AppError definite unless network|unknown; non-AppError → unknown
fail-safe); replayAttempt (submits the STORED id/items, routes through the
classifier); recover (miss/corrupt-discard/foreign-discard-without-replay/
unresolved-lock/confirmed-cleanup tracking; idempotent; preserves a live
in-flight submitting phase); retryCleanup (hydrate → clear → track);
resetForNextCustomer (gated confirmed+done+phase confirmed; honest remove
result); enterReview (only from definite outcomes). Serialized durable-op
chain (cart-store gold standard). expo-crypto randomUUID stubbed undefined
under jest → lazy namespace reference in the default deps factory.
state/attempt-store.test.ts — 47 behavior tests.

GREEN
$ npx jest features/checkout/state/attempt-store.test.ts → 47/47
$ npx jest features/checkout → 7 suites / 214 tests

AFFECTED CHECKS
$ pnpm typecheck → clean
$ npx eslint --max-warnings=0 <both files> → exit 0
$ npx prettier --check <both files> → clean

TASK REVIEW (fresh code-reviewer, agent-8365eaa3)
Verified clean: D4 ordering pinned with teeth (event sequence
write→hydrate→clear→write asserted); AC-06 prepare semantics; the single
D3 classifier (grep-verified no drift); serialized chain; lock
orchestration incl. the in-session vs restart asymmetry (load-bearing);
reset gating; plain-remove discard semantics (fallback would destroy a
replayable identity — documented); boundaries (cart public seam only, no
Supabase in state/); claims verified incl. the expo-crypto stub and the
lucide jest.mock precedent. Full suite 61/764 green at head.
Findings: F-06-01 MAJOR (recovery clears ignored the hydration-settled
MUST — no hydrate seam, no guard, no test), F-06-02 MAJOR (prepare could
mint a new identity over a durable unresolved record before recover() —
recordLoaded never consulted), F-06-03 minor (recover clobbered a live
submitting phase), F-06-04 minor (AttemptFailure.kind typed string),
F-06-05 minor (coverage gaps: removeItem failure, reuse-path lock,
defensive guards).
Remediation (same-implementer resume, with RED evidence for the majors —
6 tests failed for the right reasons before the fix): hydrateCart added
to deps and awaited before every recovery-path clear (event-order tests
pin write→hydrate→clear→write); recovery-pending gate refuses prepare
until the first durable read completes (seeded-record test: refused +
key byte-identical, then recover → same-fingerprint prepare REUSES the
seeded id); recover preserves an in-flight submitting phase (no
double-lock); AttemptFailure.kind → AppErrorKind; removeItem-failure
discard test (clearFailed honest, record kept in memory); reuse-path lock
count asserted; 5 defensive-guard tests. 37 → 47 tests.

DIFF
features/checkout/state/attempt-store.ts (new)
features/checkout/state/attempt-store.test.ts (new)
Nothing outside the task's allowed scope.

GATE: PASS

### T07 — Sign-out guard + cleanup registration

MODE: behavior
ACCEPTANCE: Acceptance: AC-12

SCAFFOLD (Lead — N/A for this task)
manual module (plan Allowed manual files); registration side-effect
pattern per the cart precedent (plan D7 / decision 10).

RED (behavior)
$ npx jest features/checkout/state/sign-out-cleanup.test.ts
Two captures: (1) module missing — Cannot find module; (2) module present
with the guard/cleanup functions but NO registration calls:
Tests: 4 failed, 3 passed — runSignOutGuards() resolved {status:"ok"}
with an unresolved record in the store (no guard registered); the cleanup
did not wipe; the failure did not propagate; the index did not make the
guard live. Every failure is "registration is missing".

IMPLEMENT
state/sign-out-cleanup.ts — guard "checkout": reads useAttemptStore
getState() only (side-effect-free); record?.status === "unresolved" →
blocked with the exact contract reason string; else ok. Only unresolved
blocks (confirmed is server-side, nothing left to replay — documented).
Edge-timing honestly documented: in-memory read; the recovery gate (T12)
owns closing the restart window. Cleanup "checkout-cleanup"
(clearCheckoutForSignOut, exported for test only): ungated
storage.remove(kisok:checkout:attempt) + full envelope reset BEFORE the
throw on rejection (persistence honest; core's emergency wipe owns disk).
Known interleaving documented: the raw remove bypasses the store's chain;
a confirmed-tail write can follow; bounded, accepted (confirmed records
are never replayed; recover() self-heals).
state/sign-out-cleanup.test.ts — 7 tests: blocked + byte-level
side-effect-free proof (reference identity + JSON deep copy); approvals;
registry-level cleanup; failure path (toEqual exact failures — checkout
by name AND the cart's real remove succeeded through the spy); direct
success; index liveness via jest.isolateModules.
index.ts — the side-effect import only (export {} retained).

GREEN
$ npx jest features/checkout/state → 2 suites / 54 tests
$ npx jest features/checkout → 8 suites / 221 tests
$ pnpm test (full) → 62 suites / 781 tests

AFFECTED CHECKS
$ pnpm typecheck → clean
$ npx eslint <3 files> → exit 0 (4 one-line no-require-imports disables,
generator-template precedent)
$ npx prettier --check <3 files> → clean

TASK REVIEW (fresh code-reviewer, agent-cb8b4f14)
Verified: AC-12/D7 conformance; the reason string surfaces verbatim
through the existing auth mechanism; the guard's side-effect-free proof
is real (both mechanisms have teeth); cleanup ordering vs guards airtight
(blocked guard returns before any cleanup); no double registration incl.
isolateModules; scope clean; RED empirically re-derived in a /tmp copy.
Findings: F-07-01 minor (edge-timing comment overstated safety),
F-07-02 minor (raw remove bypasses the store chain — documented tradeoff),
F-07-03 minor (toContain → toEqual).
Remediation (same-implementer resume): honest residual-window wording;
KNOWN INTERLEAVING paragraph; exact-equality failure assertion.

DIFF
features/checkout/state/sign-out-cleanup.ts (new)
features/checkout/state/sign-out-cleanup.test.ts (new)
features/checkout/index.ts (side-effect import only)

GATE: PASS

### ROUND 2 GATE — attempt lifecycle & safety

ROUND DIFF REVIEW (Lead)
0781e40..HEAD plus the round-remediation changes: T05 (cart seam, 4
files), T06 (attempt store, 912+1075 lines), T07 (sign-out registration,
138+374), round remediation (+437 across the store + cleanup files).
All code inside features/checkout/ + the planned cart seam files.

ROUND CHECKS
$ pnpm test → 62 suites / 791 tests, zero console output
$ pnpm typecheck → clean
$ pnpm lint → zero warnings (exit 0)

ROUND REVIEW (fresh code-reviewer, agent-29912c0b)
Examined and clean: T05↔T06 deps binding typecheck-pinned;
hydrate-before-clear composition verified against the cart's chain;
T06↔T07 shape/semantics agreement; the full lifecycle walk (prepare →
each resolve → cleanup → sign-out → recovery) — every transition traced
in code AND tests; cross-feature integrity (cart suites green, both
sign-out registrations co-exist, exact-failure assertion); round
completeness (everything Round 3/4 consumes is exported).
Findings: R2-01 MAJOR (the cleanup's raw remove could destroy an
in-flight unresolved identity: prepare-mint window + recover-read
window — the exact duplicate-order hazard the guard exists to prevent),
R2-02 minor (todo board stale), R2-03 minor (T12 missing the
sign-out-window note), R2-04 minor (reuse path no owner check → K1003),
R2-05 minor (overlapping-prepare + resolveSuccess-on-null untested).
Remediation (fresh round-remediation implementer, agent-1a3ffb43, with
full RED evidence — the wrong-direction interleaving reproduced exactly:
events ["write-start","remove","write-landed"] before the fix):
chain-enqueued clearForSignOut() store action (the cart clear()
precedent) now driven by the cleanup — the wipe can never interleave an
in-flight prepare/recover op; applyPrepare sets phase "submitting"
SYNCHRONOUSLY before the durable write (revert on failure) and the guard
blocks on unresolved OR submitting (same contract reason string);
same-fingerprint reuse now requires the same owner; overlapping-prepare
test (one write, identical ids) + resolveSuccess-on-null no-op + the two
R2-01 seam tests. R2-02/R2-03 fixed in todo by the Lead (board rows,
round number, the T12 note).

ROUND 2 GATE: PASS

### T08 — Order Review screen + order-line-row

MODE: behavior
ACCEPTANCE: Acceptance: AC-02, AC-03

SCAFFOLD (Lead, before delegating)
$ pnpm generate component checkout order-line-row
$ pnpm generate screen checkout order-review
created : features/checkout/components/order-line-row.tsx (+ test)
features/checkout/screens/order-review/order-review-screen.tsx
(+ test)
skipped : —
replaced : —
manual : —

RED (behavior)
$ npx jest features/checkout/components/order-line-row.test.tsx features/checkout/screens/order-review/order-review-screen.test.tsx
Tests: 11 failed, 11 total
Every failure is the intended missing CONTENT against the placeholder
tree: "Unable to find an element with text: Review Your Order" (the
placeholder renders "OrderReview" + TODO), "Unable to find an element
with accessibility label: Cappuccino" (the row renders TODO). Zero
console output (after scoping the delayed-read spy to the cart key only
— the sign-out-cleanup spy precedent).

IMPLEMENT
components/order-line-row.tsx — read-only line presentation: AppImage
(h-20 w-20 rounded-lg, alt = productDisplayName, null → ImageOff
fallback), Text h3 name + caption "variantLabel · option labels"
(CartItemRow's exact composition), Text body quantity with
accessibilityLabel "Quantity: N". No stepper/remove/callbacks/prices.
CartLine TYPE-ONLY import from @/features/cart.
components/order-line-row.test.tsx — NEW colocated test: read-only
snapshot + zero buttons, Quantity label, fallback rendering.
screens/order-review/order-review-screen.tsx — the full-cart structure
exactly: edges contract; !hydrated → SkeletonList; heading "Review Your
Order" + persistence alerts (full-cart's copy); ScrollView of
OrderLineRow (bounded at 100 lines — commented); fixed footer with the
"N items · M lines" summary + Back to Cart (outline large →
router.push("/cart")) + Confirm Order (primary large block, disabled
unless hydrated && lines>0 && !locked, onPress a documented inert
placeholder for T09); empty → EmptyState with the Back to Cart escape
(no Confirm rendered); locked → Confirm disabled, escape enabled.
screens/order-review/order-review-screen.test.tsx — 8 tests: populated
review (the RED case incl. no-price assertion), restore-pending skeleton
(cart-key-scoped delayed read), empty escape, memoryOnly + clearFailed
via REAL failure paths, Back pushes /cart, locked, compact 480×900.
Cart singleton driven through the PUBLIC API only in tests (the store is
deliberately not public).

GREEN
$ npx jest features/checkout → 10 suites / 242 tests (zero console noise)
$ npx jest features/cart → 11 suites / 187 tests (unregressed)

AFFECTED CHECKS
$ pnpm typecheck → clean
$ npx eslint <4 files> --max-warnings=0 → exit 0
$ npx prettier --check <4 files> → clean

TASK REVIEW (fresh code-reviewer, agent-048028f6)
Verified by direct diff: structural fidelity to full-cart (edges
contract, alerts byte-identical, bounded-list rationale); the read-only
row's purity + caption composition char-for-char; accessibility
(role+name queries, disabled forwarded, ≥48dp); the confirm-enablement
rule; real-failure-path persistence tests (stronger than full-cart's
seeded-status ones); the restore-pending frame genuinely observable
(closes full-cart's R-T11-01 deviation); RN rules (no falsy && renders,
text-in-Text); boundaries (no Supabase, public-API only, index not
widened — correct for T08); all suite/typecheck/lint runs reproduced.
Findings: F-1 minor (prettier on the Lead's in-flight worklog edit —
fixed with this entry), F-2 minor (worklog evidence — this entry).
No code findings.

DIFF
features/checkout/components/order-line-row.tsx (new)
features/checkout/components/order-line-row.test.tsx (new)
features/checkout/screens/order-review/order-review-screen.tsx (new)
features/checkout/screens/order-review/order-review-screen.test.tsx (new)

GATE: PASS

### T09 — Review submission flow + outcome panels

MODE: behavior
ACCEPTANCE: Acceptance: AC-04, AC-08, AC-09, AC-10

SCAFFOLD (Lead — N/A for this task)
wiring task over T08's screen + the T04/T06 contracts; the outcome
panels are screen-local components (planned manual files).

NOTE ON DELIVERY: this task's implementer contexts were killed by Super Z
harness deadlines TWICE mid-task; the work landed incrementally and the
Lead completed the final bounded fixes directly (both test-side, both with
verified root causes — see TASK REVIEW). The fresh independent reviewer
then reviewed the ENTIRE diff including the Lead's edits.

RED (behavior)
$ npx jest features/checkout/screens/order-review -t "submits through the real flow"
The T08 inert placeholder: pressing Confirm made NO api call — the RED
case is inside the landed test ("the press reached the api exactly once
…" failed against the no-op onPress). Captured by the interrupted
implementer's run and re-verified by the reviewer's independent RED
re-derivation of the placeholder behavior.

IMPLEMENT
order-review-screen.tsx — the confirm handler: phase-guard duplicate
suppression + snapshot re-check → normalizeCartLines (throw handled as a
LOCAL validation refusal — comment corrected per F-T09-02: the guards
preclude the empty cart only; the >100-distinct-variant refusal is
reachable and tested) → prepareAttempt (durable-before-network; !ok
surfaced as a local warning alert, never an outcome phase) →
mutateAsync → classifySubmitOutcome → the matching resolve action.
Mount-reset enterReview (stale definite outcomes only); confirmed-
navigation effect (transition-edge, exactly-once push to
/checkout-success); BlockingOverlay while submitting; the phase-driven
footer mapping (stock-conflict → Return to Cart only; unknown → Check
Again replay only, no Back — cart locked; failed → Try Again iff
retryable + Back to Cart).
components/outcome-panels.tsx — conflict join (store conflicts × live
cart lines; lock guarantees the lines are the submission context —
documented), requested/available in words+numbers, uuid-case-insensitive
join + defensive fallback; unknown panel's distinct copy; failure panel
renders userMessage with the retryable distinction (K1003 non-retryable,
never re-mints).
order-review-screen.test.tsx — 18 tests (8 T08 content + 10 submission):
the deferred-submit mid-flight proofs (durable record on disk BEFORE the
network resolves; overlay owns the screen; cart locked), identity-reuse
on Check-Again (...001 twice) vs fresh mint after definite failure
(...002), duplicate suppression (press disabled via phase — Pressability
blocks before onPress), K1003 no-re-mint, the failed pre-submit write
(no network call), the stale-panel mount reset (awaited unmount — zero
console), the 101-distinct-variant local refusal (new, F-T09-02).
core/testing/query.tsx — ONE shared-file change (Lead, justified):
mutations gcTime Infinity. Root cause (verified in TanStack source +
jest-circus hook ordering): a completed mutation schedules a 5-minute GC
setTimeout when its last observer unmounts — RNTL cleanup runs AFTER the
file's afterEach destroy loop, so the timer survived and kept jest alive
invisibly (timers are not handles — --detectOpenHandles shows nothing).
Additive, mirrors the file's own queries rationale, per-test clients
bound retention. 811→812 tests repo-wide unaffected.

GREEN
$ npx jest features/checkout → 10 suites / 252 tests, exits cleanly (~8s)
$ pnpm test (full) → 812 tests green

AFFECTED CHECKS
$ pnpm typecheck → clean
$ npx eslint <T09 files + query.tsx> --max-warnings=0 → exit 0
$ npx prettier --check <same> → clean

TASK REVIEW (fresh code-reviewer, agent-c769a644)
Verified: the flow matches the store's contracts argument-for-argument;
the non-response branch fails SAFE via resolveUnknown; exactly-once
navigation; no dead-end phases; the live-lines conflict join sound (lock
documented); the Lead's fix #1 verified against RNTL's actual aria-modal
sibling rule (inaccessible siblings = the overlay's documented design —
the unreachable-by-a11y assertions are the CORRECT mid-flight contract);
the Lead's fix #2 verified against TanStack's removable.ts + jest-circus
hook ordering; duplicate suppression passes for the right reason
(Pressability's disabled check). All suites re-run green.
Findings: F-T09-01 minor (one noisy test — act warnings from an
un-awaited unmount), F-T09-02 minor (comment overstated the guards + the
reachable refusal untested), F-T09-03 minor (docs — this entry).
Remediation (fresh implementer, agent-0a4df913): awaited unmount (the
use-cart precedent; zero console output restored — verified raw);
comment corrected + the 101-distinct-variant test with RED proof via a
temporary mutation (reverted byte-identical). 17 → 18 tests.

DIFF
features/checkout/screens/order-review/order-review-screen.tsx (edit)
features/checkout/screens/order-review/order-review-screen.test.tsx (edit)
features/checkout/screens/order-review/components/outcome-panels.tsx (new)
core/testing/query.tsx (shared, justified above — listed in the PR's
shared-files section)

GATE: PASS

### T10 — Catalog settings seam (useCustomerCatalogSettings)

MODE: behavior
ACCEPTANCE: Supporting AC-14

SCAFFOLD (Lead — N/A for this task)
manual thin selector (plan D6; generating a query capability would
create a second RPC path — explicitly rejected).

RED (behavior)
$ npx jest features/catalog/queries/use-customer-settings.test.tsx
Test suite failed to run — Cannot find module './use-customer-settings'
The declared entry evidence: the hook does not exist. (Reviewer noted
the claim is plausible-only from the repo; the direct-import shape
guarantees module-not-found — accepted as the RED for a planned manual
artifact, consistent with T02's precedent.)

IMPLEMENT
features/catalog/queries/use-customer-settings.ts — a separate useQuery
with the SAME catalogKeys.all key + fetchCatalog queryFn + a module-
stable narrow select (raw snapshot → { customerSuccessResetSeconds:
number | undefined }; `in`-narrowed union access, undefined for the {}
member; the caller applies the 25s fallback). TanStack dedupes the
observers: mounting beside useCatalog() fires NO second RPC; renders
scoped to the settings object.
features/catalog/queries/use-customer-settings.test.tsx — 5 tests:
configured seconds (40); undefined for the {} member; the D6 dedup
proof (both hooks mounted → ONE fetchCatalog AND getQueryData identity
= the raw snapshot); pending-state honesty (deferred promise); error
passthrough.
features/catalog/index.ts — additive: one export + doc lines citing
checkout plan D6.

GREEN
$ npx jest features/catalog → 27 suites / 240 tests
$ pnpm test (full, reviewer-rerun) → 65 suites / 817 tests

AFFECTED CHECKS
$ pnpm typecheck → clean
$ npx eslint <3 files> --max-warnings=0 → exit 0
$ npx prettier --check <3 files> → clean

TASK REVIEW (fresh code-reviewer, agent-70faacad)
Verified: D6 fidelity (same key + queryFn + narrow select; all rejected
alternatives avoided; no behavior delta vs useCatalog); union handling
sound; dedup proof real (call count AND cache identity); index additive;
scope clean; all claims reproduced independently; nothing missing for
the T11 consumer. One finding: F-T10-01 minor (this entry).

DIFF
features/catalog/queries/use-customer-settings.ts (new)
features/catalog/queries/use-customer-settings.test.tsx (new)
features/catalog/index.ts (additive export)

GATE: PASS

### T11 — Order Success screen + success-countdown

MODE: behavior
ACCEPTANCE: Acceptance: AC-07, AC-14, AC-15

SCAFFOLD (Lead, before delegating)
$ pnpm generate screen checkout order-success
$ pnpm generate component checkout success-countdown --screen=order-success
created : features/checkout/screens/order-success/order-success-screen.tsx
(+ test), features/checkout/screens/order-success/components/
success-countdown.tsx
note : the component template emits no test file — the colocated
test is the implementer's (planned).

RED (behavior)
The implementer context was killed by a Super Z harness deadline AFTER
completing the work; its report (and RED capture) was lost. The fresh
reviewer independently re-derived the RED by scaffold inspection: the
generated placeholders render only "OrderSuccess"/"TODO: build this
screen" and "TODO: build SuccessCountdown" — none of the 18 original
tests' content (confirmed heading, escape copy, countdown label) exists
on the placeholder tree, so every test fails against it for the
intended reasons.

IMPLEMENT
screens/order-success/components/success-countdown.tsx — the D10
deadline-based countdown: deadline in a ref (never state), every tick
recomputes from Date.now() (never accumulates), clamps at 0, AppState
active re-check fires an expired deadline immediately, single expiry
(ref guard), interaction restart, interval torn down on unmount.
Displays Progress (required accessibilityLabel with remaining seconds)

- the same words as visible Text. Publishes `restart` via an optional
  reArmRef (F-T11-01) for the screen-level listener.
  screens/order-success/order-success-screen.tsx — the valid-confirmed
  gate (record.status === confirmed && phase === confirmed; everything
  else → the AC-15 escape: warning + Back to Browse → "/", never the cart,
  never success content); the confirmed content (success Alert, mono
  LARGE display number with an accessible name, lineSnapshots through
  T08's OrderLineRow, derived summary); settings via the T10 seam
  (customerSuccessResetSeconds ?? 25; pending → skeleton; error →
  fallback); the gated reset (Next Customer + countdown expiry →
  resetForNextCustomer → push "/"; refusal + cleanup-failed surfaced
  honestly with retryCleanup; unsafe → NO reset affordance); the
  content-root pass-through onTouchStart (F-T11-01) re-arming the
  countdown for ANY interaction (the reading customer).
  Tests: 21 total (18 original + 3 for the F-T11-01 re-arm: the mailbox
  mechanism, the unmount clearing, the content-touch re-arm at the
  screen level).

GREEN
$ npx jest features/checkout/screens/order-success → 2 suites / 21 tests
$ npx jest features/checkout → 12 suites / 273 tests

AFFECTED CHECKS
$ pnpm typecheck → clean
$ npx eslint <order-success files> --max-warnings=0 → exit 0
$ npx prettier --check → clean

TASK REVIEW (fresh code-reviewer, agent-995145af)
Verified: the valid-confirmed gate mirrors the store's reset gate; the
countdown's deadline math, resume recompute, single expiry, leak-free
interval (all reproduced); settings usage + fallback both ways; gated
reset + cleanup honesty (no reset affordance while unsafe, retry path
through the real cart seam); snapshots through the shared row; full
accessibility; RED re-derived by scaffold inspection; all suites
re-run green.
Findings: F-T11-01 MAJOR (interaction-restart delivered only inside the
countdown block — a READING customer was auto-reset mid-read),
F-T11-02 minor (the responder doc self-contradiction + unpinned
contract), F-T11-03 minor (this entry), F-T11-04 minor (reset
navigation uses push; the catalog convention for top-level is replace —
deferred to T13/T14 disposition: back-landing is already covered by the
escape state).
Remediation (Lead, directly — the implementer context was lost to a
second harness deadline; same documented precedent as T09): the
countdown publishes restart via reArmRef; the screen's content root
adds a pass-through onTouchStart calling it (a plain bubbling touch
event — never responder negotiation; scroll and presses unaffected);
the doc contradiction resolved (claiming within the block is
deliberate and safe — children non-interactive, actions are siblings);
3 new tests. One honest mistake during the Lead fix (a useRef placed
after the presentation early-returns → hooks-order violations) was
caught by the suite immediately and corrected — the tests had teeth.

DIFF
features/checkout/screens/order-success/order-success-screen.tsx (new)
features/checkout/screens/order-success/order-success-screen.test.tsx (new)
features/checkout/screens/order-success/components/success-countdown.tsx (new)
features/checkout/screens/order-success/components/success-countdown.test.tsx (new)

GATE: PASS

### T12 — recovery-gate + customer layout mounting

MODE: behavior
ACCEPTANCE: Acceptance: AC-13

SCAFFOLD (Lead, before delegating)
$ pnpm generate component checkout recovery-gate
created : features/checkout/components/recovery-gate.tsx (placeholder;
no test file generated — the colocated test is planned)

RED (behavior)
$ npx jest features/checkout/components/recovery-gate.test.tsx
9 failed / 0 passed — every failure showed the placeholder tree
("TODO: build RecoveryGate"): children never rendered, no recovery
surface, no navigation, the index export undefined. (First run failed
on module resolution — the colocated test sits one directory shallower
than the T09/T11 suites — fixed, then the right missing-behavior RED.)

IMPLEMENT
components/recovery-gate.tsx — RecoveryGate({ children }): useActiveProfile

- a ref-guarded mount effect running recover(profile.id) once per session
  (D7 — closes the sign-out guard's restart window and lifts prepare's
  recovery-pending gate); auto-replay ONCE for the unresolved outcome with
  the STORED identity; phase-driven recovery surfaces over a full-screen
  BlockingOverlay-language overlay (aria-modal, touch-claiming, conditional
  z-50 stacking above the provider's affordance); success handoffs via
  router.replace("/checkout-success") for confirmed outcomes; the
  conflict join + Return to Cart / Check Again / Try Clearing Again
  surfaces; episodeEnded inertness after any way out (later in-session
  submissions belong to the review screen).
  components/recovery-gate.test.tsx — 9 tests: no-record pass-through;
  auto-replay with the stored id → success handoff; conflict join +
  Return to Cart; network AppError → unknown + Check Again replays the
  same id; definite failure; cleanup-pending → retryCleanup clears the
  REAL cart key → handoff; cleanup-done immediate handoff; foreign-owner
  discard without replay; the index export pin.
  index.ts — export RecoveryGate (+ D7 doc line; the T07 side-effect
  import kept).
  app/(customer)/\_layout.tsx — CatalogCartProvider > RecoveryGate > Stack
  (thin, D7 comment; the checkout index import also makes the T07 guard
  registration live for the session).

GREEN
$ npx jest features/checkout → 13 suites / 282 tests
$ npx jest features/catalog-cart-integration → 5 suites / 46 tests (after
the Lead's pin remediation below)

AFFECTED CHECKS
$ pnpm typecheck → clean
$ npx eslint <all touched> --max-warnings=0 → exit 0
$ npx prettier --check → clean

TASK REVIEW (fresh code-reviewer, agent-eb87e340)
Verified: D7/AC-13 complete (all six outcomes route; all five phase
surfaces; each AC-13 block has an owner — cart lock, prepare refusals,
sign-out guard, reset gate); episode inertness; the overlay semantics
(BlockingOverlay-matched, z-index composition verified); boundaries;
the stress runs (3× full checkout + 6× the formerly-flaky suite, all
green after the Lead's flake fix).
Findings: F-T12-01 MAJOR (no positive pin that the layout mounts
RecoveryGate — the sanctioned-set check is one-directional),
F-T12-02 minor (records), F-T12-03 minor (ConflictRow duplicated
line-for-line between the gate and the review panel),
F-T12-04 minor (stale test titles), F-T12-05 minor (defensive
effect-re-invocation hardening — unreachable in the delivered runtime,
deferred with the reviewer's note).
Remediation (Lead, directly — the implementer's honest out-of-scope
reports):
A. the two stale thin-mount pins updated (+ @/features/checkout in the
sanctioned sets, comment-justified by checkout plan D7 — a pin
refresh, not a weakening: the set still rejects everything else);
B. the T08 restore-pending test's one-macrotask delay raced under
parallel worker load (2/6 runs) → replaced with a test-controlled
parked-promise gate (deterministic; 8/8 stress runs green after);
C. F-T12-01: positive mount pins added to both thin-mount tests
(specifiers contain @/features/checkout AND the layout source
contains RecoveryGate);
D. F-T12-03: ConflictRow promoted to features/checkout/components/
(the ownership rule: two real consumers) — both call sites consume
the shared row; F-T12-04: both titles reworded to the
sanctioned-indexes truth. One import-path slip during the promotion
was caught immediately by the suite (module-not-found) and fixed.

DIFF
features/checkout/components/recovery-gate.tsx (new) + test (new)
features/checkout/components/conflict-row.tsx (new, promoted per
F-T12-03)
features/checkout/screens/order-review/components/outcome-panels.tsx
(consumes the shared row)
features/checkout/index.ts (export)
app/(customer)/\_layout.tsx (mount)
features/catalog-cart-integration/{components/catalog-cart-provider.test,
convergence.test} (the Lead's pin remediations A + C + D — planned
external changes, added to plan.md's list in this update)
features/checkout/screens/order-review/order-review-screen.test.tsx
(the Lead's flake fix B)

GATE: PASS

### ROUND 3 GATE — surfaces

ROUND DIFF REVIEW (Lead)
566f774..HEAD + the R3-01 fix commit: the review screen + its outcome
panels, the success screen + countdown, the recovery gate + shared
conflict row, the catalog settings seam, the customer layout mount, the
integration pin refreshes, core/testing's mutation gcTime fix (T09).

ROUND CHECKS
$ pnpm test → 68 suites / 847 tests, zero console output
$ pnpm typecheck → clean
$ pnpm lint → zero warnings (exit 0)

ROUND REVIEW (fresh code-reviewer, agent-89944a96)
Verified: D8 single-machine coherence across the three surfaces (no
double navigation; the gate owns the session until handoff); the full
journey walk with exactly one way forward per outcome; the T10↔T11 seam
one-truth; shared components structurally sound; 13-suite coherence;
boundaries/generator conformity/RN/a11y clean; all runs reproduced.
Findings: R3-01 BLOCKING (the T12 LAYOUT MOUNT WAS NEVER COMMITTED — the
T12 git add missed app/(customer)/\_layout.tsx; the pushed branch lacked
the D7/AC-13 artifact and would fail the new pins on a clean checkout),
R3-02 major (no hardware/gesture-back defense on the checkout surfaces —
AC-04's "back navigation is prevented" is touch-only; reachable strands:
back during unknown, back from success kills the countdown), R3-03 minor
(stale todo rows), R3-04 minor (plan D9 + schema comment never reconciled
with the accepted live-lines join), R3-05 minor (outcome copy duplicated
across surfaces — deferred with the reviewer's note).
Remediation: R3-01 fixed IMMEDIATELY — the layout committed (c92f223),
full suite re-verified green at the exact new HEAD, pushed; the worklog
records the miss honestly. R3-03 fixed (board rows + round number).
R3-04 reconciled (plan D9 + the schema comment now record the accepted
deviation and its reason). R3-02 scheduled: the BackHandler note added
to T13 in todo.md (lands with Round 4 — the routes round; the server's
idempotency owns duplicate-safety, this is UX completeness for AC-04).
R3-05 deferred (minor copy drift risk; recorded).

ROUND 3 GATE: PASS

### T13 — routes (/checkout, /checkout-success)

MODE: config
ACCEPTANCE: N/A — routing

SCAFFOLD (Lead, before delegating)
$ pnpm generate route checkout checkout --role=customer --screen=order-review
$ pnpm generate route checkout checkout-success --role=customer --screen=order-success
created : app/(customer)/checkout.tsx
app/(customer)/checkout-success.tsx
(+ index.ts export additions for both screens)

VERIFICATION (config — the routes)
The two generated route files verified: thin renders of the public
screens (checkout.tsx → OrderReviewScreen; checkout-success.tsx →
OrderSuccessScreen), byte-matching the cart.tsx precedent; index.ts
exports both screens (the generator's append; the index doc comment now
literally true). pnpm typecheck clean.

RED (behavior — the BackHandler guard, R3-02)
$ npx jest features/checkout/screens/order-review/order-review-screen.test.tsx -t "hardware back"
2 failed — "Expected length: 1 / Received length: 0" for the unknown +
submitting subscriptions (the guard missing; the drive itself reached
the phases first). $ (success suite) -t "hardware back" → 4 failed on
the same missing-subscription assertion. One RED run exposed a test bug
(recover() is once-per-session — two escape variants can't share a
test); split, re-RED clean.

IMPLEMENT
order-review-screen.tsx — the BackHandler guard keyed on a derived
backGuarded flag (submitting || unknown): consume the press, clean
removal; keyed on the flag so submitting↔unknown replay churns nothing.
order-success-screen.tsx — the guard over the whole valid confirmed
presentation (skeleton + unsafe-cleanup included; isValidSuccess lifted
above the early returns — hooks order); the escape keeps standard back
semantics (deliberate, documented). 9 new tests (3 review, 6 success),
with the jest BackHandler pattern established (no RN/jest-expo mock
exists — the spy-backed registry mirrors BackHandler.android.js incl.
reverse-order first-true dispatch; verified by the reviewer against the
real RN sources + the navigator's own subscription ordering +
predictiveBackGestureEnabled:false).
F-T11-04 DISPOSITION (required by the T13 reviewer): the success
reset/retry/escape navigations became router.replace("/") (3 call
sites + the test mock + re-pinned assertions) — the checkout feature's
own session-ending convention (the recovery gate's), and push would
retain each order's success screen in the stack across a shift.

GREEN
$ npx jest features/checkout → 13 suites / 291 tests (zero console)
$ npx jest features/catalog features/checkout → 40 suites / 531 tests

AFFECTED CHECKS
$ pnpm typecheck → clean
$ npx eslint <7 files> --max-warnings=0 → exit 0
$ npx prettier --check → clean (worklog formatted — F-T13-01)

TASK REVIEW (fresh code-reviewer, agent-27d008a0)
Verified: the routes byte-faithful + thin; the guards' phase mapping,
hooks order, teardown, and no-churn (pinned); the BackHandler mock
verified against the REAL RN sources (android dispatcher semantics,
ios no-op, jest-preset platform) and the production composition
(navigator subscription ordering, predictive back); the recovery gate
needs no guard (layout-level overlay survives pops; re-recovers next
launch). Full suite re-run: 68/856.
Findings: F-T13-01 minor (worklog prettier — fixed), F-T13-02 minor
(records: the R3-02 guard's file scope never recorded — this entry +
the todo scope line widened in this update). F-T11-04 disposition:
REQUIRE replace (landed above, with the reviewer's reasoning recorded).

DIFF
app/(customer)/checkout.tsx, app/(customer)/checkout-success.tsx (new)
features/checkout/index.ts (screen exports, generator-appended)
features/checkout/screens/order-review/{order-review-screen.tsx,test}
features/checkout/screens/order-success/{order-success-screen.tsx,test}

GATE: PASS

### T14 — Full Cart Review Order CTA

MODE: behavior
ACCEPTANCE: Acceptance: AC-01

SCAFFOLD (Lead — N/A for this task)
owning-feature edit inside features/cart (the brief's planned
cross-feature seam; plan external-changes list).

RED (behavior)
$ npx jest features/cart/screens/full-cart
3 failed / 16 passed — every failure "Unable to find an element with
role: button, name: Review Order" (the CTA missing); the reviewer
independently reproduced the exact RED by running the current test file
against the pre-T14 screen in a throwaway config.

IMPLEMENT
features/cart/screens/full-cart/full-cart-screen.tsx — the Review Order
CTA: primary, large, block, rendered above Clear Cart (the kiosk reading
order: way forward first); onPress → router.push("/checkout"); disabled
unless hydrated && lines>0 && !locked (AC-01's exact rule, mirroring the
T08 review screen's canSubmit so the surfaces can never disagree — the
cart deliberately does NOT encode the phase term: cross-feature
boundary). Clear Cart becomes the secondary row (still large, drops
block → self-start); its ConfirmDialog flow untouched. Doc comments
extended (the AC-01 entry seam).
features/cart/screens/full-cart/full-cart-screen.test.tsx — 5 new tests:
populated CTA enabled; press pushes /checkout; locked → disabled; empty
→ absent; restore-pending → footer absent (the parked-cart-read spy
pattern). All 14 pre-existing tests unmodified.

GREEN
$ npx jest features/cart → 11 suites / 192 tests
$ npx jest features/catalog-cart-integration (reviewer) → 46 tests

AFFECTED CHECKS
$ pnpm typecheck → clean
$ npx eslint <both files> --max-warnings=0 → exit 0
$ npx prettier --check → clean

TASK REVIEW (fresh code-reviewer, agent-d25d9ac9)
Verified: AC-01 complete (enablement in the strong direction — the
locked/empty/restore-pending presentations); the prominence split sound
(the review footer's own primary-block/secondary-large convention);
the destructive guard byte-unchanged; the cross-surface mirror verified
against the attempt store's phase→lock/clear semantics (no reachable
disagreement); the parked-read spy sound; the RED independently
reproduced. All suites re-run green.
Findings: F-T14-01 minor (the prominence split unpinned). Remediation
(Lead): the reading-order pin added to the enabled test — getAllByRole
resolves in tree order, Review Order's index precedes Clear Cart's.

DIFF
features/cart/screens/full-cart/full-cart-screen.tsx (edit)
features/cart/screens/full-cart/full-cart-screen.test.tsx (edit)

GATE: PASS

### T15 — Customer journey integration test

MODE: behavior
ACCEPTANCE: Acceptance: AC-16

SCAFFOLD (Lead — N/A for this task)
the planned manual integration test at the feature root
(convergence.test.tsx precedent).

RED (behavior — a NEW test file)
$ npx jest features/checkout/checkout-journey.test.tsx
"No tests found … 0 matches" — the missing file is the failing state;
every behavior it asserts was built and gated in T09/T11/T12/T14.
Non-vacuity then proven by the implementer with FIVE temporary
implementation mutations, each reverted immediately (tree verified
clean after every one): the review's success push target → it 1
failed; the gate's handoff replace → it 2 failed; the success screen
ignoring the configured seconds → it 1 failed; the cart's Review Order
CTA target → it 1 failed; the store skipping the post-confirm cart
clear → BOTH failed. (The reviewer logically re-verified each pin by
reading the assertions.)

IMPLEMENT
features/checkout/checkout-journey.test.tsx (2 tests + the portrait
leg): the REAL composition end-to-end — the real cart store (public API
only), the real attempt store with its default cart deps, the real
FullCart/Review/Success screens and RecoveryGate, real providers; the
sanctioned five module mocks only (lucide, expo-router, expo-crypto,
the api module, the catalog settings holder). Journey 1: cart restore →
Review Order → review → Confirm against a parked deferred flight
(durable-before-network read mid-flight) → confirmed + cart cleared
(memory and disk) → success with the CONFIGURED 10s countdown → the
gated next-customer reset (record gone, replace("/")) → compact
(480×900) + PORTRAIT (800×1180, the medium bucket — F-T15-02) review
re-renders. Journey 2: the restart recovery — a seeded UNRESOLVED
record + preserved cart; the gate's mount recover + auto-replay with
the STORED id; the unknown hold (locked cart, Check Again only); the
second flight re-sends the SAME id → confirmed, cart cleared, cleanup
done, replace("/checkout-success").

GREEN
$ npx jest features/checkout/checkout-journey.test.tsx → 2/2
$ npx jest features/checkout → 14 suites / 293 tests

AFFECTED CHECKS
$ pnpm typecheck → clean
$ npx eslint <the file> --max-warnings=0 → exit 0
$ npx prettier --check → clean

TASK REVIEW (fresh code-reviewer, agent-5af4764c)
Verified: the composition is real (the bindings read end-to-end; the
mock set is exactly the sanctioned five; ONE api mock covers both
transport paths — proven by the stored-id assertions); the identity
assertions are reuse-proofs (the counter can never mint the stored id);
the durable-before-network pin; the configured-seconds + reset-effect
pins; the fake-timers scoping reasoning; the honest compact/portrait
re-seeds; all resets/hygiene; all suites re-run green. No defect found
in the test.
Findings: F-T15-01 major (records — this entry), F-T15-02 minor (the
medium bucket unexercised — the portrait leg added above; the
three-literal-size + touch-target + zero-console browser pass remains
the Round 4 gate's runtime evidence).

DIFF
features/checkout/checkout-journey.test.tsx (new)

GATE: PASS
