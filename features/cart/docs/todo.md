# Cart — execution state

**This file is the working memory.** After a context compaction, an interrupted
session, or a handoff, this is what tells the next agent exactly where the work
stopped and what the next legal move is. Keep it current as you go, not at the
end.

Reasoning lives in `plan.md`; evidence lives in `worklog.md`. Do not restate
either here — a `todo.md` that duplicates the plan stops being scannable, which
defeats its only purpose.

## Current checkpoint

The single answer to "where are we?". Update it whenever any of it changes; it
is the first thing the next agent reads.

```
Current round     : 2
Current task      : T10
Current stage     : not started (no scaffold — public-API wrapper has no generator capability)
Last gate         : T09 GATE: PASS
Next legal action : Lead composes + delegates T10 (useCart hook + public API in index.ts; honor T09/T05 carry-forwards: hydration via useActiveProfile, sign-out-cleanup side-effect import, NO re-export of clearCartForSignOut)
Blocked by        : — (push credentials now available; Draft PR opens after Round 2 gate)
```

## Rules

- A task is **DONE only at `GATE: PASS`**.
- **Task N+1 does not start until every dependency is `PASS`.**
- A failed gate is fixed **in that task**, not compensated in a later one.
- Every task declares a **verification mode** first — see the
  `test-driven-development` skill. All cart tasks are `behavior`: each opens
  with a failing test for the missing behaviour.
- **No task starts while `plan.md` is `DRAFT`.** (Plan is `READY`.)
- **The Lead runs the scaffold**, immediately before delegating the task. The
  implementer starts only once `Scaffold status` is `READY`.

## Status board

Scan this first. Detail is below.

| Task | Mode     | Acceptance                                   | Objective                                       | Deps               | Stage       | Gate    |
| ---- | -------- | -------------------------------------------- | ----------------------------------------------- | ------------------ | ----------- | ------- |
| T01  | behavior | Supporting AC-01, AC-02, AC-03               | Line + persisted-cart Zod schemas               | —                  | done        | PASS    |
| T02  | behavior | Supporting AC-03, AC-08                      | Pure cart rules (identity/merge/bounds/summary) | T01                | done        | PASS    |
| T03  | behavior | Acceptance AC-01, AC-02, AC-06               | Store restore/persistence/ownership             | T01, T02           | done        | PASS    |
| T04  | behavior | Acceptance AC-03, AC-04, AC-05, AC-08, AC-09 | Store mutations/lock/summaries                  | T03                | done        | PASS    |
| T05  | behavior | Acceptance AC-07                             | Sign-out cleanup wiring                         | T04                | done        | PASS    |
| T06  | behavior | Supporting AC-04, AC-12                      | QuantityStepper component                       | — (seq. after T05) | done        | PASS    |
| T07  | behavior | Supporting AC-03, AC-04, AC-12               | CartItemRow component                           | T01, T06           | done        | PASS    |
| T08  | behavior | Acceptance AC-10                             | QuickCartSheet adaptive surface                 | T04, T07           | done        | PASS    |
| T09  | behavior | Acceptance AC-11                             | Full Cart screen + /cart route                  | T04, T07           | done        | PASS    |
| T10  | behavior | Acceptance AC-13                             | useCart hook + public API in index.ts           | T05, T08, T09      | not started | PENDING |

Stage is one of: `not started` · `scaffolding` · `red/baseline` ·
`implementing` · `green` · `checks` · `diff review` · `done`.

This board is the only summary. Do not add a second task-checkbox list beside
it — two summaries disagree the moment one is updated and the other is not.

## Round 1 — Cart domain and state foundation

### T01 — Line + persisted-cart Zod schemas

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-01, AC-02, AC-03`
- **Depends on**: —
- **Skills**: test-driven-development
- **Lead scaffold**:
  `pnpm generate schema cart cart-line` + `pnpm generate schema cart persisted-cart`
- **Expected generated files**: `model/cart-line.schema.ts` (+ test),
  `model/persisted-cart.schema.ts` (+ test)
- **Allowed manual files**: —
- **Scaffold status**: READY (ran; 4 files created)
- **Allowed file scope**: `features/cart/model/**`
- **Spec**: `cartLineSchema` — lineId, variantId/productId (uuid),
  productDisplayName, variantLabel, optionSelections
  ({optionTypeId, optionValueId, optionValueLabel}[]), imageUri
  (string|null), quantity int 1–99. `persistedCartSchema` — version
  (literal 1), ownerId (uuid), lines (array).

### T02 — Pure cart rules

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-03, AC-08`
- **Depends on**: T01
- **Skills**: test-driven-development
- **Lead scaffold**: N/A — no capability fits (pure domain rules)
- **Expected generated files**: —
- **Allowed manual files**: `model/cart-rules.ts` + `model/cart-rules.test.ts`
- **Scaffold status**: N/A — domain rules have no generator capability (completed)
- **Allowed file scope**: `features/cart/model/**`
- **Spec**: line identity derivation (variantId + ordered optionValueIds);
  merge-same-selection sums quantities; distinct selection → new line;
  quantity bounds helpers; totalQuantity/lineCount derivation.

### T03 — Store restore/persistence/ownership

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-01, AC-02, AC-06`
- **Depends on**: T01, T02
- **Skills**: test-driven-development
- **Lead scaffold**: `pnpm generate store cart cart`
- **Expected generated files**: `state/cart-store.ts` + `state/cart-store.test.ts`
- **Allowed manual files**: —
- **Scaffold status**: READY (ran; 2 files created)
- **Allowed file scope**: `features/cart/state/**`, `features/cart/model/**`
- **Spec**: STORAGE_KEY is deliberately `storageKey("cart", "lines")` (edit of
  the generated `kisok:cart:cart` — planned, see plan design decision 1);
  `hydrate(ownerId)` owner-scoped restore; mismatch discard + durable clear;
  miss → empty; corrupt → attempted clear (`clearFailed` if it cannot);
  serialized trailing-coalesced writes; persisted/memoryOnly/clearFailed
  honesty; factory pattern with injectable backend.

### T04 — Store mutations/lock/summaries

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-03, AC-04, AC-05, AC-08, AC-09`
- **Depends on**: T03
- **Skills**: test-driven-development
- **Lead scaffold**: N/A — same store scaffold as T03
- **Expected generated files**: —
- **Allowed manual files**: —
- **Scaffold status**: N/A — continues T03's scaffold
- **Allowed file scope**: `features/cart/state/**`, `features/cart/model/**`
- **Spec**: add (merge/append via rules), setLineQuantity (min 1, UX cap 99),
  removeLine, clearCart (lock-exempt; remove→overwrite fallback; honest
  status), lock/unlock (user mutations no-op while locked), summaries
  recompute on every mutation.

### T05 — Sign-out cleanup wiring

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-07`
- **Depends on**: T04
- **Skills**: test-driven-development
- **Lead scaffold**: N/A — no capability covers lifecycle registration
- **Expected generated files**: —
- **Allowed manual files**: `state/sign-out-cleanup.ts` +
  `state/sign-out-cleanup.test.ts`
- **Scaffold status**: N/A — lifecycle wiring has no generator capability
- **Allowed file scope**: `features/cart/state/**`
- **Spec**: module side-effect registers `registerSignOutCleanup({name:
"cart", …})`; task clears memory + durable cart; THROWS on clearFailed
  (auth emergency path collects it); registers NO guard; exports nothing the
  public API doesn't.

Round gate: `PASS` — 22 suites / 239 tests, typecheck/lint/format/
check:docs clean on the full round state; cross-task coherence reviewed
(worklog.md "ROUND 1 GATE" section). Committed as bb6d170.

Draft PR note: the workflow wants the Draft PR opened NOW (early, after first
coherent verified work). Push to origin is currently IMPOSSIBLE from this
sandbox (no gh CLI, no SSH, no stored token — `git push --dry-run` fails at
auth). Local work continues; the PR (base develop) opens the moment push
access exists. See `Blocked`.

## Round 2 — Cart UI surfaces and public API

### T06 — QuantityStepper component

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-04, AC-12`
- **Depends on**: — (executed sequentially after T05)
- **Skills**: test-driven-development, kisok-design-system
- **Lead scaffold**: `pnpm generate component cart quantity-stepper`
- **Expected generated files**: `components/quantity-stepper.tsx`
- **Allowed manual files**: `components/quantity-stepper.test.tsx` (test
  colocated; the component capability generates no test template)
- **Scaffold status**: READY (ran; 1 file created)
- **Allowed file scope**: `features/cart/components/**`
- **Spec**: presentational (value, min, max, onValueChange, disabled);
  Button size="icon" h-touch/w-touch with Minus/Plus Icon; value Text
  (accessible); minus disabled at min, plus disabled at max; labels
  "Increase quantity"/"Decrease quantity"; value announced politely.

### T07 — CartItemRow component

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-03, AC-04, AC-12`
- **Depends on**: T01, T06
- **Skills**: test-driven-development, kisok-design-system,
  kisok-react-native-rules
- **Lead scaffold**: `pnpm generate component cart cart-item-row`
- **Expected generated files**: `components/cart-item-row.tsx`
- **Allowed manual files**: `components/cart-item-row.test.tsx`
- **Scaffold status**: READY (ran; 1 file created)
- **Allowed file scope**: `features/cart/components/**`
- **Spec**: AppImage (alt text, fallback), product name (Text body/h3),
  variant/options label (Text caption muted), QuantityStepper, remove
  (icon Button + accessibilityLabel incl. product name) opening
  ConfirmDialog (destructive, confirmLabel "Remove"); disabled when locked;
  optional per-line pending state.

### T08 — QuickCartSheet adaptive surface

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-10`
- **Depends on**: T04, T07
- **Skills**: test-driven-development, kisok-design-system,
  kisok-react-native-rules
- **Lead scaffold**: `pnpm generate component cart quick-cart-sheet`
- **Expected generated files**: `components/quick-cart-sheet.tsx`
- **Allowed manual files**: `components/quick-cart-sheet.test.tsx`
- **Scaffold status**: READY (ran; 1 file created)
- **Allowed file scope**: `features/cart/components/**`,
  `features/cart/state/**` (read-only consumption)
- **Spec**: public controlled surface `{open, onOpenChange, onViewFullCart?}`;
  composes AdaptiveSheet (Content/Header/Title/Footer); body ScrollView of
  CartItemRow list; empty → EmptyState; memoryOnly → Alert warning;
  clearFailed → Alert destructive; locked → controls disabled; footer:
  Continue Shopping (AdaptiveSheetClose) + View Full Cart intent; total
  quantity in title; stateful (reads store; updates doc comment honestly);
  tests cover BOTH presentations (Dimensions.set before render: 1024×768 side panel + 480×900 compact bottom sheet; jest's default window is 750×1334 compact portrait — initialMetrics drives insets only).

### T09 — Full Cart screen + /cart route

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-11`
- **Depends on**: T04, T07
- **Skills**: test-driven-development, kisok-design-system,
  kisok-react-native-rules, expo-router
- **Lead scaffold**: `pnpm generate screen cart full-cart` THEN
  `pnpm generate route cart cart --role=customer --screen=full-cart`
- **Expected generated files**: `screens/full-cart/full-cart-screen.tsx` (+ test
  placeholder), `app/(customer)/cart.tsx`, index.ts export appended by route gen
- **Allowed manual files**: screen-local components under
  `screens/full-cart/components/**` if needed (summary/footer block)
- **Scaffold status**: READY (ran; screen + route + index export)
- **Gate**: PASS (review 0 blocking / 0 major / 2 minor — both remediated
  in-task; see worklog + review.md R-T09-01/02)
- **Allowed file scope**: `features/cart/screens/full-cart/**`,
  `features/cart/index.ts` (route-gen export), `app/(customer)/cart.tsx`
  (generated — verify only)
- **Spec**: Screen + ScrollView list + summary (total quantity, line count) +
  fixed footer; restore-pending → SkeletonList; empty → EmptyState with
  Browse Products (router.push("/")); populated → rows + persistence warning;
  locked → disabled; clear cart button with destructive ConfirmDialog;
  NO imports from `features/catalog/**`; route stays thin.

### T10 — useCart hook + public API

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-13`
- **Depends on**: T05, T08, T09
- **Skills**: test-driven-development, kisok-design-system
- **Lead scaffold**: N/A — public-API wrapper is behavior-specific
- **Expected generated files**: —
- **Allowed manual files**: `state/use-cart.ts` + `state/use-cart.test.ts`;
  edits to `features/cart/index.ts` (planned public exports)
- **Scaffold status**: N/A — no capability generates public-API wrappers
- **Allowed file scope**: `features/cart/state/**`, `features/cart/index.ts`
- **Spec**: `useCart()` narrow view (lines, totalQuantity, distinctLineCount,
  persistence, hydrated, locked + bound actions); owns hydration via
  `useActiveProfile()`; plain action functions (addItem, setLineQuantity,
  removeLine, clearCart, lockCart, unlockCart, hydrateCart, getCartSnapshot)
  delegating to store `getState()`; index.ts exports components/hook/actions/
  types + `import "./state/sign-out-cleanup"` registration side-effect; public
  API test imports `@/features/cart` only.

Round gate: `PENDING`

## Feature gate

Every line is a box, and `pnpm verify` alone is not the authority — several
of these depend on an environment only CI has. See `review.md` for the review and
audit findings this checklist points at.

- [ ] Every Task Gate PASS
- [ ] Every Round Gate PASS
- [ ] Every AC verified
- [ ] `pnpm verify` PASS after the final local change
- [ ] required fast GitHub CI PASS on the final HEAD
- [ ] required runtime evidence recorded
- [ ] required native tier(s) PASS, N/A, or explicitly unverified
- [ ] Reviewer findings dispositioned
- [ ] blocking/major fixes re-reviewed
- [ ] Quality Audit clean
- [ ] anything not verified explicitly recorded
- [ ] shared/core changes justified
- [ ] PR evidence matches the worklog

FEATURE GATE: PENDING

## Blocked

What cannot proceed, and what it is waiting for. Empty is good.

- **Draft-PR push (external)**: opening the Draft PR on GitHub requires pushing
  `feature/cart` to origin. This sandbox has NO push credentials (no gh CLI,
  no SSH binary, no stored token; `git push --dry-run` → "could not read
  Username"). All local gates are unaffected. Required external action: push
  access or the push itself (`git push -u origin feature/cart`) + PR creation
  (base `develop`, draft). The Lead prepared to open it the moment access
  exists. This does NOT block Tasks/Rounds/Reviews — only the remote PR
  artifact and its CI evidence.
