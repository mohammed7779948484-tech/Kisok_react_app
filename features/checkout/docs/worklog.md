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
