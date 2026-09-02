# Cart — worklog

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

---

## PRE-TASK — workspace, research, planning (Lead)

**Workspace** (Lead, this session)
$ pnpm generate feature cart --role=customer
created : features/cart/index.ts, features/cart/docs/{brief,plan,todo,worklog,review}.md
Branch : feature/cart from origin/main 80b8ac3 (develop == main at start)

**Research** (3 fresh read-only subagents, Evidence Packets returned to Lead)

- supabase negative contract (agent-4a3990b4…): NO server cart (16 tables/22
  fns, none cart); customer RLS-locked out of catalog/inventory;
  get_customer_catalog → boolean is_available only; NO reconciliation RPC;
  create_order = Checkout boundary (items {variant_id,quantity}, 100-line
  cap, advisory lock, K1003 replay, stock_conflict); only public.orders in
  Realtime, customer gets nothing; current_active_profile() →
  {id, display_name, role, is_active} = ownership signal.
- Flutter cart behavior (agent-92ffc69d…): §13–§20/§30/§32/§34 — profile
  scoping, durable restore, serialized writes, persisted/memoryOnly/rejected,
  lockable, one-cart-model, no-price, no-silent-mutation, kiosk reset gating;
  exact-quantity reconciliation impossible under Lean V2 (out of scope).
- UI composition (agent-d09b291c…): AdaptiveSheet IS the quick-cart surface
  (adaptive-sheet.tsx:10-21); Full Cart = Screen+ScrollView+fixed footer;
  ConfirmDialog docstring names cart-line removal; Alert warning =
  memoryOnly pattern (ui-lab:262-266); EmptyState; QuantityStepper genuinely
  missing → feature-local; ScrollView (≤100 lines, create_order cap); test
  frame defaults 1024×768 (landscape) — compact tests must override metrics.

**Lead spot-checks** (primary sources read directly)

- 20260826050007_lean_create_order.sql:6-13,44-66,116-139,175-206 ✓
- 20260826050013_lean_rls_grants.sql:134-164 ✓ (admin/preparation-only policies)
- KISOK_FLUTTER_PRODUCT_REFERENCE.md §15 (554-583), §16 (585-631) ✓
- core/storage/index.ts, core/auth/{sign-out,index,context,types}.ts,
  tools/generator/templates/store/_.ejs, components/ui/adaptive-sheet.tsx,
  components/ui/{alert,button,text}.tsx, components/feedback/_.tsx ✓

**Baseline** (clean tree, before any cart code)
$ pnpm verify
PASS — typecheck, lint, format:check, test:ci (all suites), check:docs,
check:commits, check:e2e-appid, check:ci-scripts, generate:smoke;
db:verify SKIPPED (no PostgreSQL in this sandbox — CI provides it).

**Planning**

- brief.md written: 13 stable ACs (AC-01…AC-13), all observable, with
  explicit out-of-scope (Catalog integration, Checkout, reconciliation,
  tracking, server cart, Realtime, prices).
- plan.md written with kisok-feature-plan skill: local-state shape; 14 design
  decisions incl. single-key persisted envelope with owner inside, line
  identity = variantId + optionValueIds (merge = sum), lock no-ops for user
  mutations / clear exempt, confirmed remove+clear, serialized trailing-
  coalesced writes, corrupt-payload durable clear, cleanup THROWS on
  clearFailed, narrow Zustand-free public API; 8 generator commands → 6
  tasks; 10 tasks in 2 rounds; zero backend calls; one new route file.
- Lead Planning Review performed across all checklist axes → clean.
- plan.md Status: READY. todo.md carries the real 10-task structure.

### T01 — Line + persisted-cart Zod schemas

MODE: behavior
ACCEPTANCE: Supporting AC-01, AC-02, AC-03

SCAFFOLD (Lead, before delegating)
$ pnpm generate schema cart cart-line
$ pnpm generate schema cart persisted-cart
created : features/cart/model/cart-line.schema.ts, cart-line.schema.test.ts,
persisted-cart.schema.ts, persisted-cart.schema.test.ts
skipped : none
replaced : none
manual : none planned

RED (behavior — implementer, verified by Lead + Reviewer)
$ pnpm test -- schema
15 failed / 15 — placeholders rejected the real cart shape; guard tests failed
on issue-path ["id"] proving no domain guard existed. Reviewer independently
reconstructed the placeholder schema in /tmp and confirmed 15/15 fail for the
intended reasons (empirical RED validation).

IMPLEMENT
cart-line.schema.ts: real line shape + addToCartInputSchema (omit lineId)
persisted-cart.schema.ts: {version: literal 1, ownerId: uuid, lines[]}
both test files replaced with issue-path-asserting behavior tests (15 total)

GREEN
$ pnpm test -- schema
PASS x2 suites, 15/15 tests — EXIT 0

AFFECTED CHECKS
$ pnpm typecheck → clean
$ pnpm lint → clean
$ pnpm format:check → clean (after Lead prettier-formatted worklog.md —
the one file the implementer correctly declined to touch)
$ pnpm test → 19 suites / 153 tests, all pass (reviewer-confirmed)

DIFF
4 new files in features/cart/model/\*\* (implementer) + worklog.md (Lead).
Nothing outside the allowed scope. index.ts still export{} — public API not
widened (correct for T01).

TASK REVIEW (fresh code-reviewer, agent-ae2fceb8…)
0 blocking / 0 major / 5 minor (R-T01-01…05 — recorded in review.md)
Dispositions: R-T01-01/02/03/05 deferred to T02 (model/ scope, consumed
there); R-T01-04 resolved by this worklog entry.

GATE: PASS

### T02 — Pure cart rules (+ T01 deferred remediations)

MODE: behavior
ACCEPTANCE: Supporting AC-03, AC-08

SCAFFOLD (Lead)
n/a — domain rules have no generator capability (planned manual artifact)

RED (implementer; verified by Reviewer live runs)
$ pnpm test -- features/cart/model
20 failed / 20 passed — 19 cart-rules tests failed on typed throwing stubs
(assertion-level, imports resolved); 1 uniqueness-refinement test failed
Expected:false/Received:true. 5 T01-coverage tests passed at RED honestly
(they assert existing guards). Reviewer re-ran and corroborated.

IMPLEMENT
cart-rules.ts (new): MAX_LINE_QUANTITY, deriveLineId (sorted identity),
addLine (merge-by-sum capped, append with derived identity), setLineQuantity
(floor-then-clamp), removeLine, summaries. persisted-cart refine (unique
lineIds). T01 remediations: input-schema tests, 3 guard-mirror tests,
comment rewords.

GREEN
$ pnpm test -- features/cart/model → 3 suites / 40 tests PASS

TASK REVIEW (fresh code-reviewer, agent-bf0c275c…)
0 blocking / 0 major / 5 minor. Reviewer EMPIRICALLY verified: stray-lineId
bug (R-T02-01), NaN escape (R-T02-03), cap-literal duplication (R-T02-02).

REMEDIATION (same implementer, resumed agent-77426643…)
R-T02-01: append spread { ...input, lineId } — derived identity wins; regression
test RED (Expected derived / Received "not-the-derived-id") → GREEN.
R-T02-02: MAX_LINE_QUANTITY exported from cart-line.schema (single 99 literal,
TDZ-ordered); rules import it; round-trip test (addLine→schema parses; cap+1
rejects). RED on missing export → GREEN.
R-T02-03: Number.isFinite guard — NaN→1, ±Inf→max/min; tests (NaN RED →
GREEN; +Infinity behavior existed).
R-T02-04: empty-cart 0/0 + after-setQuantity recompute tests (honest
immediate-pass coverage).
R-T02-05 (Lead): plan.md decision 3 reworded — canonically SORTED set; array
order is display order, not identity.

GREEN (post-remediation)
$ pnpm test -- features/cart/model → 3 suites / 46 tests PASS
$ pnpm test (full) → 20 suites / 184 tests PASS

AFFECTED CHECKS
$ pnpm typecheck → clean
$ pnpm lint → clean
$ pnpm format:check → clean
99-literal audit: exactly one code literal (cart-line.schema.ts:9)

DIFF
6 files, all in features/cart/model/\*\* (2 new, 4 edited). Nothing outside
scope. index.ts untouched.

GATE: PASS

### T03 — Store restore/persistence/ownership

MODE: behavior
ACCEPTANCE: Acceptance AC-01, AC-02, AC-06

SCAFFOLD (Lead, before delegating)
$ pnpm generate store cart cart
created : features/cart/state/cart-store.ts, features/cart/state/cart-store.test.ts
skipped : none
replaced : none
manual : none planned

RED (behavior — implementer; first review verified RED empirically)
$ pnpm test -- features/cart/state
Round 1: 18 failed / 1 passed — owner-scoped restore, mismatch discard, corrupt
clear, serialization all missing on the template scaffold (persistNow not a
function; owner-blind hydrate). The 1 pass = template idempotency behavior kept.

IMPLEMENT
cart-store.ts: STORAGE_KEY=storageKey("cart","lines"); CartState {lines,
ownerId, persistence, hydrated, hydrate, persistNow, clear}; owner-scoped
restore (hit/match, hit/mismatch→durable discard, miss, rejected→clear);
trailing-coalesced write queue with waiter semantics; remove→overwrite
fallback shared by clear/mismatch/corrupt; singleton useCartStore.

GREEN (round 1)
$ pnpm test -- features/cart/state → 19/19; full 21 suites / 203.

TASK REVIEW (fresh code-reviewer, agent-092fae5a…; race harness in /tmp)
2 MAJOR + 4 minor. Majors verified empirically:

- R-T03-01: durableClear bypassed the write queue — cleared cart could
  RESURRECT on disk (cold start restores it); clear's fallback could overlap
  a queue write; trailing success erased clearFailed.
- R-T03-02: clearFailed silently downgraded to memoryOnly by a later failed
  write (previous customer's cart still on disk).

REMEDIATION ROUND 1 (same implementer, resumed)
ONE serialized durable-op chain (runSerialized): flush writes, clear's
remove→fallback, and the restore read all ride it. Sticky clearFailed (write
failure keeps it; success honestly clears it). persistNow pre-owner guard
(skip + rejected + unknown). flush throw-safety. Race/sticky/waiter tests.
RED: 6 failed/19 passed — resurrection (map.has true after clear), overlap
(maxInFlight 2), downgrade (memoryNot clearFailed) all reproduced.
GREEN: 25/25; full 21 suites / 209.

RE-REVIEW (fresh, agent-4a2a8e8c…): both majors RESOLVED; 4 new minor
(R-T03R-01 read+discard gap; R-T03R-02 throw-safety asymmetry;
R-T03R-03 ownerless fallback envelope; R-T03R-04 helper duplication).

REMEDIATION ROUND 2 (same implementer)
Restore read + mismatch/corrupt discard folded into ONE serialized op
(RestoreOutcome: hit|miss|discarded; state applied outside the op).
rawDiscard (unchained, must run inside runSerialized — doc'd + verified by
grep) with whole-body try/catch; restore read try/catch → corrupt path;
pre-owner fallback skipped (fail closed → clearFailed, auth emergency path
owns the stale data); single generic runSerialized<T>.
RED (round-1 code, corrected tests): 4 failed/25 passed for the intended
reasons (disk empty after mid-restore write wiped; clear() rejected on
throwing remove; hydrate() rejected on throwing read; pre-owner "persisted").
Implementer honestly reported 2 initial wrong-reason RED failures, corrected.

GREEN (round 2)
$ pnpm test -- features/cart/state → 29/29
$ pnpm test → 21 suites / 213 tests
$ pnpm typecheck / lint / prettier → clean

DELTA RE-REVIEW (fresh, agent-ca6bf182…): round-2 delta correct, complete,
no regressions. 0 blocking / 0 major / 1 minor carry-forward:
R-T03R2-01 — T04 mutations must be gated on `hydrated` (restore-pending is
the sole guard against the mid-restore memory clobber on the hit path).
Carried into the T04 task packet.

DIFF
2 new files in features/cart/state/\*\*. Nothing outside scope.

GATE: PASS

### T04 — Store mutations/lock/summaries

MODE: behavior
ACCEPTANCE: Acceptance AC-03, AC-04, AC-05, AC-08, AC-09

SCAFFOLD (Lead)
n/a — continues T03's generated store scaffold; no new command (planned).

RED (implementer; reviewer verified the class against HEAD)
$ pnpm test -- features/cart/state
18 failed / 29 passed — all TypeError not-a-function (actions/selectors
absent at HEAD; imports resolved). Right class: missing behavior.

IMPLEMENT
cart-store.ts: locked + addItem (schema-parsed via addToCartInputSchema,
composes addLine rules) + setLineQuantity + removeLine + clearCart
(lock-exempt, hydrated-gated, delegates to T03 clear) + lock/unlock +
selectTotalQuantity/selectDistinctLineCount (module-level, compose T02
rules, never mirrored). Guard order: hydrated → locked → schema/lineId →
mutate → void persistNow().

GREEN
$ pnpm test -- features/cart/state → 47/47; full 21 suites / 231.

TASK REVIEW (fresh, agent-8144f4fe…)
0 blocking / 0 major / 3 minor; PASS recommended after disposition:
R-T04-01 stale lock survives owner switch (empirically probed);
R-T04-02 no mutation-level write-failure test; R-T04-03 clearCart comment
rationale wrong. Carried constraints verified genuinely implemented
(mid-restore disk-payload test; schema strip of stray lineId).

REMEDIATION (same implementer, resumed)
R-T04-01: locked:false added to restore()'s owner-switch reset; RED
(Expected false / Received true) → GREEN; + same-owner lock-survives test.
R-T04-02: mutation-level write-failure test (failing setItem → line kept in
memory + memoryOnly) — honest immediate-pass coverage at the mutation seam.
R-T04-03: comment reworded to the real rationale.

GREEN (post-remediation)
$ pnpm test -- features/cart/state → 50/50
$ pnpm test → 21 suites / 234
$ pnpm typecheck / lint / format → clean

DIFF
2 modified files in features/cart/state/\*\*. Nothing outside scope.

GATE: PASS

### T05 — Sign-out cleanup wiring

MODE: behavior
ACCEPTANCE: Acceptance AC-07

SCAFFOLD (Lead)
n/a — lifecycle registration has no generator capability (planned manual
artifact per plan.md allowed-manual list).

RED (implementer; one infra false-start honestly reported)
$ pnpm test -- sign-out-cleanup
4 failed / 1 passed — stub registering nothing: lines stayed populated;
throw message wrong; locked stayed true; direct call rejected. The no-guard
test passed at RED honestly (negative invariant). Dynamic-import approach
rejected by jest sandbox (reported, not hidden); static import used.

IMPLEMENT
sign-out-cleanup.ts (new): clearCartForSignOut (clear → throw on rejected
with descriptive message → setState locked:false); registers
registerSignOutCleanup({name: "cart"}) at import; NO guard; module doc
covers the three whys (Phase 3 handoff, throw→emergency reset, guard belongs
to future Checkout).
sign-out-cleanup.test.ts (new): 5 tests — lifecycle registration (memory +
durable miss), failing-clear → failures:["cart"], no-guard (seeded block
condition), locked reset, memory+durable via direct task.

GREEN
$ pnpm test -- sign-out-cleanup → 5/5; full 22 suites / 239.

TASK REVIEW (fresh, agent-56671693…)
0 blocking / 0 major / 5 minor. No swallow path found (verified through
context.tsx Phase 2 ordering, runSignOutCleanup capture, clearKisokStorage
namespace wipe). Registration idempotent; test approach judged real
behavior (action replacement on real zustand, no mock framework).

REMEDIATION (same implementer)
R-T05-01: no-guard test seeds locked+populated (a lock-keyed guard would
now fail it) — honest immediate-pass coverage, marked.
R-T05-02: registration test now proves memory AND durable miss after
runSignOutCleanup() in ONE lifecycle test (seed → persistNow → pre-assert
hit → run → miss).
R-T05-03: comment now names the real persistence consumer (cart surfaces,
not auth).
R-T05-05: test-only export documented; T10 must NOT re-export.
R-T05-04: resolved by this worklog entry.

GREEN (post-remediation)
$ pnpm test -- sign-out-cleanup → 5/5
$ pnpm test → 22 suites / 239
$ pnpm typecheck / lint / format → clean

DIFF
2 new files in features/cart/state/\*\*. Nothing outside scope; index.ts
untouched (T10 wires the go-live import — plan decision 10).

GATE: PASS

---

## ROUND 1 GATE — domain and state foundation

Tasks: T01, T02, T03, T04, T05 — ALL GATE: PASS.

Accumulated round diff: features/cart/model/** (6 files: 2 schema pairs +
rules pair), features/cart/state/** (4 files: cart-store pair +
sign-out-cleanup pair), features/cart/docs/** (5 control documents), and the
workspace index.ts placeholder. NO file outside features/cart/** touched.

Subsystem verification (Lead, on the full round state):
$ pnpm test → 22 suites / 239 tests PASS, zero console output
$ pnpm typecheck → clean
$ pnpm lint → clean (architecture boundaries enforced)
$ pnpm format:check → clean
$ pnpm check:docs → PASS (docs describe the current workflow)

Cross-task coherence (Lead review of combined behavior):

- One cart model: the store is the single authority; rules/schema layers are
  pure and composed; no mirrored totals (selectors derive); no second model
  anywhere.
- The ownership chain is closed: single key + ownerId envelope → hydrate
  mismatch discard → serialized durable ops → sign-out cleanup → auth
  emergency namespace reset (4 independent barriers).
- Persistence honesty closed: persisted/memoryOnly/clearFailed with sticky
  precedence, serialized+coalesced writes, throw-safety, pre-owner guards.
- The lock contract is closed: user mutations no-op; clearCart exempt; owner
  switch and sign-out both reset the lock.
- The state layer is backend-invisible: zero Supabase imports (negative
  contract respected); no UI yet (Round 2).

Round gate: PASS

### T06 — QuantityStepper component

MODE: behavior
ACCEPTANCE: Supporting AC-04, AC-12

SCAFFOLD (Lead, before delegating)
$ pnpm generate component cart quantity-stepper
created : features/cart/components/quantity-stepper.tsx
skipped : none
replaced : none
manual : components/quantity-stepper.test.tsx (component capability generates
no test template)

RED (implementer, agent-45a7bd83…)
$ pnpm test -- quantity-stepper
7 failed / 7 — every failure was `Unable to find an element with role: button,
name: …` (or the `Quantity: N` label) against the scaffold's "TODO: build
QuantityStepper." — right class: controls/labels/value missing; module resolved
and rendered (no import/typo errors).

IMPLEMENT
quantity-stepper.tsx: presentational control — props value, min (default 1),
max (default MAX_LINE_QUANTITY imported from ../model/cart-line.schema — the
single 99 literal), onValueChange, disabled, className merged last; Button
size="icon" (h-touch/w-touch = 48dp) + Icon Minus/Plus with accessibilityLabel
"Decrease quantity"/"Increase quantity"; value Text with accessibilityLabel
`Quantity: N` + accessibilityLiveRegion="polite" (repo precedent: alert.tsx:34,
input.tsx:46, error-state.tsx, offline-notice.tsx); emissions clamped
(Math.max/Math.min), never fired when disabled or next===value. Test-local
jest.mock("lucide-react-native") documented in-file — jest.config.js lacks the
transform allowlist and shared/core-config edits are forbidden by AC-13, so the
per-file mock is the only in-contract solution (Lead standardized the exact
text for T07/T08; see review.md T06 note).

GREEN
$ pnpm test -- quantity-stepper → 7/7, zero console output
$ pnpm test → 23 suites / 246 tests PASS

AFFECTED CHECKS
$ pnpm typecheck → clean
$ pnpm lint → clean
$ pnpm format:check → clean (prettier run on the new test file, focused re-run
7/7 after)

DIFF
2 new files in features/cart/components/\*\* (+ the Lead's todo.md
scaffold-status edit). Nothing outside scope. index.ts untouched.

TASK REVIEW (fresh, agent-c9c2e83b…)
0 blocking / 0 major / 1 minor / 2 nits (R-T06-01…03 — recorded in review.md).
Dispositions: R-T06-01 (NaN passthrough) → T07 (Number.isFinite fail-safe +
regression test at the real wiring); R-T06-02 (MIN literal asymmetry) → T07
(schema exports MIN_LINE_QUANTITY, stepper imports it; rules' internal floor
stays — R-T02-02 centralized only 99); R-T06-03 (compound test 4) → accepted
as-is (nit).

GATE: PASS

### T07 — CartItemRow component (+ T06 deferred remediations)

MODE: behavior
ACCEPTANCE: Supporting AC-03, AC-04, AC-12

SCAFFOLD (Lead, before delegating)
$ pnpm generate component cart cart-item-row
created : features/cart/components/cart-item-row.tsx
skipped : none
replaced : none
manual : components/cart-item-row.test.tsx (component capability generates
no test template)

RED (implementer, agent-c6954107…)
$ pnpm test -- cart-item-row → 7 failed / 7 — `Unable to find…` (product
name, `Quantity: 2`, button `Remove Cappuccino`, image role) against the
scaffold's "TODO: build CartItemRow." — right class: missing row content.
$ pnpm test -- quantity-stepper → 1 failed / 8 — `Quantity: NaN` rendered,
decrement enabled — precisely R-T06-01.
$ pnpm test -- cart-line.schema → 1 failed / 15 — MIN_LINE_QUANTITY
undefined — precisely R-T06-02.

IMPLEMENT
cart-item-row.tsx: presentational row — AppImage (alt = product name,
fallback per its own contract), Text h3 product name, caption Text =
variantLabel · optionValueLabels (snapshot-derived only), QuantityStepper
wired (disabled at locked||pending), remove Button size="icon"
variant="outline" + Icon Trash2 + accessibilityLabel "Remove <product>" →
REAL ConfirmDialog (destructive, product-named copy, confirmLabel "Remove");
only onConfirm calls onRemove. R-T06-01: quantity-stepper safeValue =
Number.isFinite(value) ? value : min (display + disabled + emission
uniformly). R-T06-02: schema exports MIN_LINE_QUANTITY (single literal,
.min() uses it), stepper imports it, pinning test added. Tests: 7 row tests
(real AppImage/ConfirmDialog/Button/Text unmocked; lucide mock =
standardized text extended with Trash2/ImageOff), 1 NaN regression test,
1 MIN pinning test.

GREEN
$ pnpm test -- cart-item-row → 7/7; quantity-stepper → 8/8;
cart-line.schema → 15/15
$ pnpm test → 24 suites / 255 tests PASS, zero console output
$ pnpm typecheck / lint / format:check → clean
$ npx eslint --max-warnings=0 on both test files → exit 0 (the hook's
invocation; caught + fixed one unused var mid-run)

DIFF
6 files: cart-item-row pair (new), quantity-stepper pair + cart-line.schema
pair (remediations). Nothing outside allowed scope; cart-rules.ts untouched;
index.ts untouched.

TASK REVIEW (fresh, agent-64b320d6…)
0 blocking / 0 major / 0 minor / 3 nits (R-T07-01…03 — recorded in
review.md, all accepted as-is with reasons). Reviewer verified all focused
suites, the full 24/255, checks, the hook-eslint invocation, and scope; also
verified against installed sources that RNTL 14.0.1 cannot role-query the
dialog Content (plain View without accessible) — the heading/button-based
openness assertion was judged sound and adopted as the pattern.

GATE: PASS

### T08 — QuickCartSheet adaptive surface

MODE: behavior
ACCEPTANCE: Acceptance AC-10

SCAFFOLD (Lead, before delegating)
$ pnpm generate component cart quick-cart-sheet
created : features/cart/components/quick-cart-sheet.tsx
skipped : none
replaced : none
manual : components/quick-cart-sheet.test.tsx (component capability generates
no test template)

RED (implementer, agent-f2377d83…)
$ pnpm test -- quick-cart-sheet
11 failed / 11 — `Unable to find …` (heading `Your Cart · N`, buttons, rows,
alerts) against the scaffold's "TODO: build QuickCartSheet." — right class.
One honest restructure at RED: the original "closed renders nothing" test
passed vacuously (pure absence assertions); rebuilt as one-open +
one-closed instance asserting the open content appears exactly once — which
then failed correctly.

IMPLEMENT
quick-cart-sheet.tsx: stateful public surface on the REAL AdaptiveSheet (=
DialogPrimitive.Root; controlled open/onOpenChange threaded verbatim); title
carries selectTotalQuantity; ScrollView of CartItemRow (mutations via
useCartStore.getState() with the store's real signatures); EmptyState when
empty; Alert warning at memoryOnly / Alert destructive at clearFailed (exact
status union from the store); rows disabled at locked; footer Continue
Shopping (AdaptiveSheetClose asChild → onOpenChange(false)) + View Full Cart
(onViewFullCart optional — hidden when absent; stays enabled while locked:
navigation, not mutation). Doc comment honestly stateful (plan decision 12).
DISCOVERY (empirical — implementer probe, reviewer re-verified): jest's
default window is 750×1334 (compact portrait → bottom sheet), NOT the
1024×768 the plan's risk row assumed; core/testing render initialMetrics
drives insets only, not presentation. Tests set Dimensions.set({window,
screen}) BEFORE render: 1024×768 → side panel, 480×900 → bottom sheet — both
presentations genuinely exercised (View Full Cart interaction asserted under
compact too). Plan risk row + todo spec line reworded by the Lead (R-T08-01).
Store control: singleton setState seeding + beforeEach reset + setLogSink
silencing (sanctioned pattern); settleDurableWrites settles the
fire-and-forget persistNow inside act (zero act warnings).

GREEN
$ pnpm test -- quick-cart-sheet → 11/11, zero console output
$ pnpm test → 25 suites / 266 tests PASS

AFFECTED CHECKS
$ pnpm typecheck / lint → clean; format:check clean; hook-eslint
(--max-warnings=0, both files) → exit 0

DIFF
2 new files in features/cart/components/\*\*. No state-file edits (read-only
consumption); no shared/core edits; index.ts untouched.

TASK REVIEW (fresh, agent-770eb0a1…)
0 blocking / 0 major / 1 minor / 3 nits (R-T08-01…04 — recorded in
review.md). Dispositions: R-T08-01 (plan/todo risk-row inversion) → fixed by
Lead at gate (both docs reworded with the verified facts); R-T08-02 (doc
comment claimed index export) → fixed in remediation (softened to "intended
for"; T10 wires it); R-T08-03 (no inverse alert-absence assertions) → fixed
in remediation (text-query inverses in populated + empty tests; probed:
accessibilityRole="alert" is NOT role-queryable under this RNTL build —
same limitation class as the T07 dialog carry-forward); R-T08-04 → resolved
by this entry.

REMEDIATION (same implementer, resumed)
R-T08-02 + R-T08-03 as above; re-verified: focused 11/11, full 25/266,
typecheck/lint/format/hook-eslint clean.

GATE: PASS

## T09 — Full Cart screen + /cart route

Lead scaffold (ran before delegation): `pnpm generate screen cart full-cart`

- `pnpm generate route cart cart --role=customer --screen=full-cart` —
  screen placeholder + test placeholder, thin `app/(customer)/cart.tsx`
  (template-identical), `features/cart/index.ts` route-gen export
  `export { FullCartScreen } from "./screens/full-cart/full-cart-screen"`.
  Scaffold recorded in todo.md.

RED (implementer, agent-a24e20fc…)
$ pnpm test -- full-cart
First run 12 failed / 12 — one wrong-class failure honestly reported and
fixed before implementing (ROUTE_PATH one directory short → ENENT; harness
bug, not missing behavior). Second run 11 failed / 1 passed: every behavior
test `Unable to find …` (loading label, empty copy, row text, alert copies,
locked buttons, Browse Products, Clear Cart, frame content) against the
generated placeholder — right class. The 1 pass is the static
route-thinness contract pin (discriminating against store/Supabase/deep
imports; its companion render test failed).

IMPLEMENT
full-cart-screen.tsx: stateful Screen composition — restore-pending →
SkeletonList early-return (no rows/empty/summary guess); empty → shared
EmptyState with action prop "Browse Products" → router.push("/") (the
SCREEN owns this navigation per plan decision 13, unlike the sheet);
populated → ScrollView of CartItemRow (mutations via
useCartStore.getState() real signatures; locked passed through; locked also
disables Clear Cart with the store-level exemption rationale comment);
summary via module selectors selectTotalQuantity/selectDistinctLineCount
(never mirrored; singular/plural); persistence honesty — memoryOnly →
Alert warning, clearFailed → Alert destructive, persisted → nothing;
fixed footer = SafeAreaView edges ["bottom"] sibling of scroll content
(the Screen primitive has no footer prop — its real mechanism is the
edges contract, per components/layout/screen.tsx); Clear Cart opens the
shared ConfirmDialog destructive; ONLY onConfirm calls clearCart().
Footer/edges invariant: one bottom-inset owner per presentation
(FOOTER_EDGES / FOOTERLESS_EDGES constants track the footer's mount state
— R-T09-01 remediation).
Tests (13): copy the T08-proven helpers VERBATIM (setFrame
Dimensions.set-before-render 1024×768 AND 480×900, resetCartSingleton/
seedCart, settleDurableWrites act-wrapped, standardized lucide mock);
router = minimal documented module mock of expo-router useRouter
(no repo precedent — features/auth navigate only via the root Stack;
grep-verified; hoisting-safe, documented like the lucide mock; asserts
push called once with "/"); route contract pinned TWO ways — render the
route module itself through `@/features/cart` asserting real screen
content, + static import analysis (from-imports AND side-effect imports;
sanctioned set @/features/cart / react / react-native / expo-router).
Tests: skeleton, empty escape, populated rows+summary+stepper-mutates-
store, memoryOnly warning + persisted inverse, clearFailed destructive,
locked rows+trigger, clear flow (real dialog → confirm → store cleared →
honest post-clear status), compact + landscape frames, remove end-to-end
(R-T09-02 remediation).

GREEN
$ pnpm test -- full-cart → 13/13, zero console output (no act warnings)
$ pnpm test → 26 suites / 279 tests PASS
$ pnpm typecheck → clean (after 2 honest noUncheckedIndexedAccess fixes
in the test: type-predicate filter + explicit undefined guard, no casts)
$ pnpm lint / hook-eslint (--max-warnings=0, both files) → clean
$ pnpm format:check / check:docs → clean
rg catalog/supabase over screen/test/route/index → zero matches

DIFF
2 files replaced under features/cart/screens/full-cart/\*\*; index.ts and
app/(customer)/cart.tsx verified-only (generator output untouched);
no store edits; no screen-local components needed (inline composition).

TASK REVIEW (fresh, agent-2599520a…)
Re-ran everything fresh: focused 12/12 ×4 (stable), full 26/278,
typecheck/lint/hook-eslint/format/check:docs clean; working tree exactly
the declared files; index.ts export byte-identical to generator render;
route template-identical; no eslint-disables; no casts; all implementer
claims verified TRUE.
0 blocking / 0 major / 2 minor (R-T09-01, R-T09-02 — recorded in
review.md). Clean: AC-11 fidelity, summary derivation, restore-pending
honesty, locked semantics, clear flow, persistence warnings, router mock,
route pinning, T08 carry-forwards, RN hazards, a11y, boundaries.

REMEDIATION (same implementer, resumed)
R-T09-01: Screen edges track the footer's mount state
(FOOTER_EDGES/FOOTERLESS_EDGES); every presentation owns the bottom edge
exactly once. R-T09-02: one screen-level remove end-to-end test (press →
real dialog → confirm → store line gone → empty state revealed, which also
exercises the footer→footer-less edge handover).
Re-verified: focused 13/13, full 26 suites/279, typecheck/lint/
hook-eslint/format clean.

GATE: PASS

## T10 — useCart hook + public API

Lead scaffold: N/A (no generator capability covers a public-API wrapper —
plan feature-shape table). Composed task packet: download/composed-t10.md.

START DISCREPANCY (honest record, R-T10-02)
The task opened against an unexpected tree state: an UNREPORTED prior T10
attempt sat uncommitted (index.ts edited + use-cart.ts + use-cart.test.tsx
untracked) — the work of an earlier subagent launch whose report was lost
to a transport timeout. The implementer backed it up verbatim to
/tmp/t10-prior-attempt-backup/, reset to clean HEAD 9ff8a20, and ran the
RED→GREEN cycle. EVIDENCE RECORD CORRECTION (Lead, at gate, per R-T10-02):
the final implementation and tests are the prior attempt's content reused
verbatim (index.ts + use-cart.ts byte-identical; the test file differs
only in comment wording) — the "from scratch" phrasing in the implementer's
report was wrong about provenance. The code itself is sound: the fresh
reviewer reviewed it independently and re-ran every check (all PASS —
see TASK REVIEW below), so this review stands as the authority on the
code's correctness.

RED (against clean HEAD)
$ pnpm test -- use-cart
9 failed / 9 — right class: missing exports (`QuantityStepper` undefined,
`useCart is not a function`, plain actions missing) and unregistered
cleanup (runSignOutCleanup left seeded lines + durable key intact).

IMPLEMENT
state/use-cart.ts: useCart() — per-slice subscriptions on the real
singleton (lines/persistence/hydrated/locked) + derived totals via the
T04 module selectors (never mirrored); bound actions delegating through
getState() (stable identities); hydration ownership: useActiveProfile() +
effect keyed [profile.id] calling the store's serialized idempotent
hydrate; lastHydratedOwner ref is effect hygiene only (StrictMode
double-invoke guard, set before the call); NO store changes. Plain action
functions for non-React callers (addItem, setLineQuantity, removeLine,
clearCart, lockCart, unlockCart, hydrateCart, getCartSnapshot —
lockCart/unlockCart/hydrateCart map to store lock/unlock/hydrate;
getCartSnapshot returns a frozen-in-time plain snapshot incl. ownerId).
Type re-exports: CartLine, AddToCartInput, PersistenceStatus (one public
types source).
index.ts: EXACTLY 13 runtime exports (QuantityStepper, CartItemRow,
QuickCartSheet, FullCartScreen, useCart, 8 plain actions) + 3 type
exports + `import "./state/sign-out-cleanup"` registration side-effect
(decision 10). FORBIDDEN and absent: useCartStore, createCartStore,
clearCartForSignOut (R-T05-05). FullCartScreen export line kept
byte-identical to the route-gen output. Doc comment: what is public and
why; Zustand stays an implementation detail (decision 11).
state/use-cart.test.tsx (9 tests): public-API surface (exact runtime
export set + forbidden absent + type presence pinned compile-time),
registration live through the index (seed → runSignOutCleanup → memory
AND durable cleared), hook view restores a pre-seeded envelope through a
probe render only (hydration ownership), owner switch (old lines
discarded + envelope miss), bound actions update view+store,
getCartSnapshot time-independence, plain actions from non-React context.
Registry hygiene: registration stays live per file (module-load once;
jest per-file registries); store+durable resets per test; documented.

GREEN
$ pnpm test -- use-cart → 9/9, zero console output
$ pnpm test -- sign-out-cleanup → 5/5 (T05 hygiene unbroken)
$ pnpm test → 27 suites / 288 tests PASS
$ pnpm typecheck / lint / hook-eslint (3 files, --max-warnings=0) / format:check → clean

DIFF
3 files (2 new, 1 edit) — all within features/cart/state/\*\* + index.ts.

TASK REVIEW (fresh, agent-3f42e39d…)
Re-ran everything fresh incl. ALL 5 auth suites (41/41 — no cross-suite
surprise from the side-effect import). Findings:

- R-T10-01 BLOCKING (feature-level): no runtime consumer of useCart() —
  /cart would render restore-pending forever. Disposition: Lead revised
  the plan (design decision 15 + T11 row) — T11 wires FullCartScreen to
  useCart(). Not a T10 defect: T10's own spec is met and verified.
- R-T10-02 MAJOR: evidence-record accuracy (see START DISCREPANCY above —
  corrected here at gate).
- R-T10-03 MINOR: exact-surface pin only caught function-valued exports.
- R-T10-04 MINOR: CartView per-render identity undocumented.
  Clean: side-effect trace + idempotence, hook mechanics, hydration
  ownership tests, plain-action mapping, snapshot semantics, boundaries,
  test quality, no circular imports.

REMEDIATION (same implementer, resumed)
R-T10-03: full key equality (Object.keys sorted vs the 13-name list) —
catches any export kind; discrimination probe: temporary stray
CART_T10_PROBE export failed the test, then reverted (index.ts verified
byte-identical). R-T10-04: CartView doc comment (destructure the view;
identity is per-render).
Re-verified: 9/9 focused, 27/288 full, typecheck/lint/hook-eslint/format
clean.

GATE: PASS (R-T10-01 tracked as T11 — the feature-level hole is closed by
T11 before the Round 2 gate; the plan revision is recorded in plan.md)

## ROUND 2 GATE — UI surfaces and public API

Tasks: T06, T07, T08, T09, T10, T11 — ALL GATE: PASS.

Accumulated round diff (72a03fb →): features/cart/components/** (6 files:
quantity-stepper / cart-item-row / quick-cart-sheet pairs),
features/cart/screens/full-cart/** (2 files: screen pair),
features/cart/state/use-cart pair, features/cart/index.ts (public API),
app/(customer)/cart.tsx (thin generated route — verified only),
model MIN/MAX literal centralization (T06/T07 remediation rows), and
features/cart/docs/** updates. NO file outside features/cart/** + the one
route file.

T11 gate record (behavior wiring; no worklog section of its own — the
task packet's evidence lives in the Lead's workspace log, EXEC-3/T11 +
GATE-T11): 2-file scope exact (screen +48 lines, test +208; 206+/50-);
RED = the R-T10-01 proof test (pre-seeded durable envelope, no manual
hydrate → screen stuck on SkeletonList); GREEN = screen consumes
useCart() (one call, identical 6 CartView fields, bound actions with
identical signatures, zero useCartStore references) + suite adapted to
the auth gate (wrappers mirroring Stack.Protected, same-owner seeding);
focused 14/14 ×4 stable, full 27/289. GATE: PASS (independent
verification — see review.md T11 note).

Subsystem verification (Lead delegate, on the full round state at 9b3b029):

$ pnpm test → 27 suites / 289 tests PASS
$ pnpm typecheck → clean
$ pnpm lint → clean (architecture boundaries enforced)
$ pnpm format:check → clean
$ pnpm check:docs → PASS (63 files checked)

Cross-task coherence (Lead delegate review of the combined state):

- `rg "useCartStore" features/cart/screens/` → matches ONLY in
  full-cart-screen.test.tsx (the sanctioned singleton-seeding pattern);
  the screen itself: ZERO — it consumes useCart() only. QuickCartSheet's
  direct store reads live in components/ (sanctioned, plan decision 15).
- `rg "features/catalog|from \"@/core/supabase\"" features/cart/
--glob '!*.md'` → no matches — no real imports; the negative contract
  (backend-invisible cart) holds through the entire feature.
- `git diff c07ca4d..HEAD --stat` → exactly the 4 declared files
  (full-cart-screen.tsx, its test, review.md, todo.md) — nothing else
  moved between the T10 gate and this one.
- One cart model end-to-end: sheet (direct reads) and screen (useCart
  view) read the SAME singleton; totals always selector-derived, never
  mirrored; hydration has exactly ONE runtime owner (the useCart effect
  keyed on profile.id — R-T10-01 closed); sign-out cleanup registration
  is live through the index side-effect import; lock contract surfaces
  identically in both presentations.

Integration pre-check (Draft PR readiness):

$ git merge-tree $(git merge-base origin/develop HEAD) origin/develop
HEAD → clean — no conflicts: zero "changed in both" entries, zero
conflict markers; every entry is "added in remote" (the feature's new
files). merge-base 80b8ac3 = origin/develop tip = origin/main tip, so
develop carries main's history forward and the PR merge is effectively
fast-forward-able. Expected and fine.

T11 deviation disposition (restore-pending skeleton): ACCEPTED — the
transient `!hydrated` SkeletonList frame is unobservable in this harness
(mock auth + AsyncStorage chains are pure microtasks that settle inside
RNTL v14's awaited render/act); re-pinning it would require an
unsanctioned timing seam testing the harness, not the app. Pinned
instead: awaited landed-empty state + proof the hook caused it + no-guess
inverses (no rows, no footer, no Clear Cart), while the `!hydrated` early
return stays code-pinned and commented in the screen. The R-T10-01
substance — runtime owner-scoped restore with NO manual hydrate — is
proven more strongly by the durable-envelope test than a skeleton-frame
pin ever would be (review.md R-T11-01).

Round gate: PASS

## DRAFT PR — feature/cart → develop

Push (one-off credential URL — nothing stored in .git/config or any
file): feature/cart → origin (mohammed7779948484-tech/Kisok_react_app)
as a NEW remote branch, no rejection; 15 commits at first push
(80b8ac3..5a343e7 — true at that moment: T01..T11 code + gates + docs);
the final range 80b8ac3..37dca64 carries 16 commits — this Draft PR
record commit is the 16th (R-FR-01/QA-01, corrected at closeout). Upstream
tracking set afterwards via a credential-less fetch (origin is
public-readable; cosmetic only).

PR: #8 — https://github.com/mohammed7779948484-tech/Kisok_react_app/pull/8
head feature/cart → base develop; state open, DRAFT (not for merge).
Body: what (client-local cart), scope discipline (negative contract
honored, no shared/core edits, features/cart/\*\* + the thin route), task
trail T01→T11, verification summary (27 suites / 289 tests; checks
clean; every task + round gate PASS), draft rationale (Lead final
verification, code review, quality audit, CI pending), evidence
pointers to this docs/ set. Created via the GitHub REST API (no gh CLI
in this sandbox).

The Draft PR opened AFTER Round 2 gate PASS per the workflow; Round 1's
push constraint is resolved (its note above is the historical record).
Next: develop integration check, Lead final verification, code review,
quality audit, feature gate.

## FINAL VERIFICATION

Run by the Lead's final-verification delegate on the frozen feature HEAD
37dca64 (full record: Lead workspace log, FINAL-VERIFY entry), then re-run
by the closing delegate on the closeout tree — all closeout edits in,
including the use-cart.ts comment sentence and these records:

$ pnpm verify → EXIT 0
typecheck PASS · lint PASS · format:check PASS · test:ci
27 suites / 289 tests PASS · check:docs PASS (63 files) ·
check:commits PASS · check:e2e-appid PASS · check:ci-scripts PASS
("pnpm verify matches the CI verify job") · db:verify SKIPPED locally
(no PostgreSQL in this sandbox — expected; CI runs it REQUIRED) ·
generate:smoke PASS ("KISOK generator smoke test passed")

GitHub CI on 37dca64 (check-runs API): Expo doctor SUCCESS, Web bundle
SUCCESS, "Verify (typecheck, lint, format, tests, guards, db, generator)"
SUCCESS — db:verify green in CI. Maestro flows + Android prebuild check
SKIPPED — label-gated ('e2e' / 'android-build' labels absent from the
draft PR), by design, not failures.

All 13 acceptance criteria carry direct jest evidence (brief ↔ tests, both
directions):

| AC    | jest evidence (suite: test)                                                                                                                                                                                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | cart-store: "hydrate — owner-scoped restore (AC-01, AC-02)" — mismatched owner discarded + durably cleared, clearFailed when discard fails, owner switch discards in-memory; use-cart: re-hydrate on profile-id change                                                                                      |
| AC-02 | cart-store: owner-match restore, fresh-tablet empty, corrupt / wrong-version / duplicate lineIds → clean start + durable clear, cold-start round-trip; full-cart-screen: "restores a pre-seeded durable envelope … no manual hydrate anywhere"; use-cart: "renders the REAL restored cart through the hook" |
| AC-03 | cart-store: "addItem — add, merge, distinct lines (AC-03)"; cart-rules: addLine/deriveLineId; cart-item-row: line snapshot rendering                                                                                                                                                                        |
| AC-04 | cart-store: "setLineQuantity / removeLine … (AC-04)"; quantity-stepper: bounds; cart-item-row: confirmed-removal pair; full-cart-screen: end-to-end remove; cart-line.schema: min/cap rejections                                                                                                            |
| AC-05 | cart-store: "clearCart — the UI-facing clear (AC-05)" + "clear — owner-aware template semantics"; full-cart-screen: end-to-end Clear Cart confirm                                                                                                                                                           |
| AC-06 | cart-store: "persistNow — serialized, honest writes (AC-06)"; memoryOnly warning rendered in BOTH surfaces                                                                                                                                                                                                  |
| AC-07 | sign-out-cleanup: "cart sign-out cleanup (AC-07)"; use-cart: index side-effect registration                                                                                                                                                                                                                 |
| AC-08 | cart-store: "derived summaries — totalQuantity and distinctLineCount (AC-08)"; cart-rules: deriveTotalQuantity/deriveDistinctLineCount                                                                                                                                                                      |
| AC-09 | cart-store: "lock — interaction lock … (AC-09)"; disabled-controls tests in cart-item-row / quick-cart-sheet / full-cart-screen; use-cart: lockCart/unlockCart                                                                                                                                              |
| AC-10 | quick-cart-sheet component suite (populated incl. total quantity in title, empty state, memoryOnly warning, clearFailed alert, locked rows, Continue Shopping/View Full Cart intents, 1024×768 side-panel + 480×900 compact frames)                                                                         |
| AC-11 | full-cart-screen suite (restore-pending, empty + Browse Products escape, populated + summary, warnings, locked); "/cart route" tests render through the public index export; boundary greps: zero features/catalog / @/core/supabase imports; diff confined to features/cart/\*\* + app/(customer)/cart.tsx |
| AC-12 | a11y names/roles/disabled asserted across suites (26 toBeDisabled assertions; accessible names on steppers/rows; polite value label; fallback image labelled); both frames in screen and sheet tests; touch targets MEASURED ≥48px at runtime — see RUNTIME EVIDENCE                                        |
| AC-13 | use-cart: "cart public API (AC-13)" exact-surface test (imports @/features/cart only; full key equality + forbidden-name pins); 27-file diff confinement                                                                                                                                                    |

## FINAL CODE REVIEW

Verdict: PASS — 0 blocking / 0 major / 4 minor (R-FR-01..R-FR-04), all
dispositioned; no remediation required beyond the records made at closeout.
Findings table + dispositions: review.md, section "FINAL CODE REVIEW
(80b8ac3..37dca64)". The reviewer independently re-ran the battery on the
frozen HEAD (the full suite twice — 27 suites / 289 tests — with zero
console output) and re-verified R-T10-01's remediation, the architecture
boundaries, and the exact 13-runtime-export public surface.

## QUALITY AUDIT

Verdict: CLEAN-WITH-OBSERVATIONS (QA-01..QA-06, all dispositioned; no
remediation required beyond the records made at closeout). Findings +
dispositions: review.md, section "QUALITY AUDIT". Strongest independent
evidence: the auditor's fresh re-run of the full check battery on 37dca64,
the GitHub CI verification on the same sha, the merge-tree pre-check into
develop, and the docs-vs-diff truth sweep.

## RUNTIME EVIDENCE

Browser record against the REAL hosted TEST project (production static
export of 37dca64 — `pnpm export:web`, the same web bundle CI builds green —
served on 127.0.0.1:8081; full record: review.md, section "RUNTIME
EVIDENCE", and the Lead workspace log RUNTIME-EVIDENCE entry):

- REAL Customer sign-in (Supabase auth, end to end); app boots clean.
- `/cart` cold restore of a seeded 2-line envelope — ownerId captured from
  the app's own `current_active_profile()` call.
- Quantity +/−, confirmed remove, confirmed clear; RELOAD → edits durably
  persisted (envelope matches memory; after clear the key is REMOVED and
  the empty state renders through the hook's own restore).
- Empty state + Browse Products escape → `/`.
- Three prescribed sizes — 1280×800, 800×1180, 480×900 — zero horizontal
  overflow; MEASURED touch targets at 480×900: steppers 48×48, Remove
  48×48, Clear Cart 432×56.
- Zero console messages, zero page errors, no redirect loops; signed-out
  direct `/cart` → `/sign-in` (auth gate holds).
- Sign-out durably clears `kisok:cart:lines` once the feature module has
  rendered in-session.
- New finding R-FR-05 (minor, carry-forward): static-export lazy route
  loading — a fresh session that signs in/out without visiting /cart leaves
  the envelope on disk (cleanup registration is a module-load side-effect);
  mitigations: owner-scoped mismatch discard at the next hydrate
  (jest-proven) + fail-closed handoff marker; disposition: carry-forward to
  the future Catalog customer shell (which imports @/features/cart for
  QuickCartSheet/addItem — module loaded at shell level, cleanup always
  registered).

Explicitly unverified (recorded, with reasons): the `pnpm web` dev-server
transport (environmental inotify ENOSPC — verbatim log at
runtime-evidence/expo-web-ENOSPC-failure.log in the Lead workspace; static
export substituted); QuickCartSheet runtime frames (no runtime consumer by
design — component tests stand); second-customer owner-mismatch at runtime
(one TEST account; jest-covered); native/device tier (no cart maestro flow —
N/A by plan). Screenshots (5) + logs: the Lead workspace runtime-evidence/
directory.
