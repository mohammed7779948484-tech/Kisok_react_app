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
