# Checkout — execution state

**This file is the working memory.** After a context compaction, an interrupted
session, or a handoff, this is what tells the next agent exactly where the work
stopped and what the next legal move is. Keep it current as you go, not at
the end.

Reasoning lives in `plan.md`; evidence lives in `worklog.md`. Do not restate
either here — a `todo.md` that duplicates the plan stops being scannable, which
defeats its only purpose.

## Current checkpoint

The single answer to "where are we?". Update it whenever any of it changes; it
is the first thing the next agent reads.

```
Current round     : 1
Current task      : T01
Current stage     : Round 1 complete — T04 GATE PASS; ROUND GATE pending
Last gate         : T04 GATE PASS (Round 1 tasks complete)
Next legal action : Round 1 gate — accumulated diff review + fresh Round reviewer
Blocked by        : —
```

## Rules

- A task is **DONE only at `GATE: PASS`**.
- **Task N+1 does not start until every dependency is `PASS`.**
- A failed gate is fixed **in that task**, not compensated in a later one.
- Every task declares a **verification mode** first — see the
  `test-driven-development` skill. The mode decides the entry evidence:
  `behavior` / `bug` / `behavior-change` need a failing test, `refactor` needs a
  named green baseline, `config` needs the command that exercises the artifact.
- **No task starts while `plan.md` is `DRAFT`.**
- **The Lead runs the scaffold**, immediately before delegating the task. The
  implementer starts only once `Scaffold status` is `READY`.

## Status board

Scan this first. Detail is below.

| Task | Mode     | Acceptance                            | Objective                                                  | Deps                    | Stage       | Gate    |
| ---- | -------- | ------------------------------------- | ---------------------------------------------------------- | ----------------------- | ----------- | ------- |
| T01  | behavior | Supporting AC-07, AC-08               | create-order-response schema                               | —                       | done        | PASS    |
| T02  | behavior | Acceptance: AC-05                     | normalized-request pure rules                              | —                       | done        | PASS    |
| T03  | behavior | Supporting AC-06, AC-07               | checkout-attempt record schema                             | T02                     | done        | PASS    |
| T04  | behavior | Supporting AC-07–AC-10                | submit-order api + mutation hook                           | T01                     | done        | PASS    |
| T05  | behavior | Supporting AC-07, AC-11               | Cart `clearCartDurable()` extension                        | —                       | not started | PENDING |
| T06  | behavior | Acceptance: AC-04, AC-06, AC-09–AC-11 | Checkout attempt store (state machine + durable lifecycle) | T02, T03, T04, T05      | not started | PENDING |
| T07  | behavior | Acceptance: AC-12                     | Sign-out guard + cleanup registration                      | T06                     | not started | PENDING |
| T08  | behavior | Acceptance: AC-02, AC-03              | Order Review screen + order-line-row                       | —                       | not started | PENDING |
| T09  | behavior | Acceptance: AC-04, AC-08–AC-10        | Review submission flow + outcome panels                    | T04, T06, T08           | not started | PENDING |
| T10  | behavior | Supporting AC-14                      | Catalog settings seam                                      | —                       | not started | PENDING |
| T11  | behavior | Acceptance: AC-07, AC-14, AC-15       | Order Success screen + countdown                           | T06, T08, T10           | not started | PENDING |
| T12  | behavior | Acceptance: AC-13                     | recovery-gate + layout mounting                            | T06, T07                | not started | PENDING |
| T13  | config   | N/A — routing                         | Routes: /checkout, /checkout-success                       | T08, T11                | not started | PENDING |
| T14  | behavior | Acceptance: AC-01                     | Full Cart Review Order CTA                                 | T13                     | not started | PENDING |
| T15  | behavior | Acceptance: AC-16                     | Customer journey integration test                          | T09, T11, T12, T13, T14 | not started | PENDING |

Stage is one of: `not started` · `scaffolding` · `red/baseline` ·
`implementing` · `green` · `checks` · `diff review` · `done`.

This board is the only summary. Do not add a second task-checkbox list beside
it — two summaries disagree the moment one is updated and the other is not.

## Round 1 — domain model & contract

### T01 — create-order-response schema

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-07, AC-08`
- **Depends on**: —
- **Skills**: test-driven-development, supabase
- **Lead scaffold**: `pnpm generate schema checkout create-order-response`
- **Expected generated files**: `model/create-order-response.schema.ts`,
  `model/create-order-response.schema.test.ts`
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/model/create-order-response.schema*`

### T02 — normalized-request pure rules

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-05`
- **Depends on**: —
- **Skills**: test-driven-development
- **Lead scaffold**: — (manual: no capability fits pure mapping rules)
- **Expected generated files**: —
- **Allowed manual files**: `model/normalized-request.ts`,
  `model/normalized-request.test.ts`
- **Scaffold status**: `N/A — no generator capability applies (pure domain rules, planned in plan.md)`
- **Allowed file scope**: `features/checkout/model/normalized-request*`

### T03 — checkout-attempt record schema

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-06, AC-07`
- **Depends on**: T02
- **Skills**: test-driven-development
- **Lead scaffold**: `pnpm generate schema checkout checkout-attempt`
- **Expected generated files**: `model/checkout-attempt.schema.ts`,
  `model/checkout-attempt.schema.test.ts`
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/model/checkout-attempt.schema*`

### T04 — submit-order api + mutation hook

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-07, AC-08, AC-09, AC-10`
- **Depends on**: T01
- **Skills**: test-driven-development, supabase
- **Lead scaffold**: `pnpm generate mutation checkout submit-order`
- **Expected generated files**: `api/submit-order.ts`,
  `queries/use-submit-order-mutation.ts`, `queries/keys.ts`
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/api/submit-order*`,
  `features/checkout/queries/*`

## Round 2 — attempt lifecycle & safety

### T05 — Cart `clearCartDurable()` extension

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-07, AC-11`
- **Depends on**: —
- **Skills**: test-driven-development
- **Lead scaffold**: — (edit of an existing owning-feature file; no capability applies)
- **Expected generated files**: —
- **Allowed manual files**: edits to `features/cart/state/use-cart.ts`,
  `features/cart/index.ts` (additive public delegate + export), plus tests in
  the cart feature's existing test files
- **Scaffold status**: `N/A — owning-feature edit, planned in plan.md`
- **Allowed file scope**: `features/cart/state/use-cart.ts`,
  `features/cart/index.ts`, `features/cart/state/*.test.ts`

### T06 — Checkout attempt store

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-04, AC-06, AC-09, AC-10, AC-11`
- **Depends on**: T02, T03, T04, T05
- **Skills**: test-driven-development
- **Lead scaffold**: `pnpm generate store checkout attempt`
- **Expected generated files**: `state/attempt-store.ts`,
  `state/attempt-store.test.ts`
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/state/attempt-store*`

### T07 — Sign-out guard + cleanup registration

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-12`
- **Depends on**: T06
- **Skills**: test-driven-development
- **Lead scaffold**: — (module side-effect registration; cart precedent; no capability)
- **Expected generated files**: —
- **Allowed manual files**: `features/checkout/state/sign-out-cleanup.ts` (+ its
  test), edit `features/checkout/index.ts` (side-effect import)
- **Scaffold status**: `N/A — lifecycle registration, planned in plan.md`
- **Allowed file scope**: `features/checkout/state/sign-out-cleanup*`,
  `features/checkout/index.ts`

## Round 3 — surfaces

### T08 — Order Review screen + order-line-row

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-02, AC-03`
- **Depends on**: —
- **Skills**: test-driven-development, kisok-design-system, kisok-react-native-rules
- **Lead scaffold**: `pnpm generate component checkout order-line-row` then
  `pnpm generate screen checkout order-review`
- **Expected generated files**: `components/order-line-row.tsx` (+ test),
  `screens/order-review/order-review-screen.tsx` (+ test)
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/components/order-line-row*`,
  `features/checkout/screens/order-review/**`

### T09 — Review submission flow + outcome panels

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-04, AC-08, AC-09, AC-10`
- **Depends on**: T04, T06, T08
- **Skills**: test-driven-development, kisok-design-system, kisok-react-native-rules
- **Lead scaffold**: — (wiring the existing screen/store/hook; no new structure)
- **Expected generated files**: —
- **Allowed manual files**: screen-local components under
  `features/checkout/screens/order-review/components/` for the outcome panels
  (planned: conflict panel, unknown panel, failure panel)
- **Scaffold status**: `N/A — wiring task over existing scaffold`
- **Allowed file scope**: `features/checkout/screens/order-review/**`,
  `features/checkout/queries/**` (hook wiring)

### T10 — Catalog settings seam

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-14`
- **Depends on**: —
- **Skills**: test-driven-development
- **Lead scaffold**: — (manual thin selector over the existing query; generating a query would create a second RPC path — plan D6)
- **Expected generated files**: —
- **Allowed manual files**: `features/catalog/queries/use-customer-settings.ts`
  (+ test), edit `features/catalog/index.ts` (export)
- **Scaffold status**: `N/A — thin selector, planned in plan.md (D6)`
- **Allowed file scope**: `features/catalog/queries/use-customer-settings*`,
  `features/catalog/index.ts`

### T11 — Order Success screen + countdown

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-07, AC-14, AC-15`
- **Depends on**: T06, T08, T10
- **Skills**: test-driven-development, kisok-design-system, kisok-react-native-rules
- **Lead scaffold**: `pnpm generate screen checkout order-success` then
  `pnpm generate component checkout success-countdown --screen=order-success`
- **Expected generated files**: `screens/order-success/order-success-screen.tsx`
  (+ test), `screens/order-success/components/success-countdown.tsx` (+ test)
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/screens/order-success/**`

### T12 — recovery-gate + layout mounting

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-13`
- **Depends on**: T06, T07
- **Skills**: test-driven-development, kisok-design-system, expo-router
- **Lead scaffold**: `pnpm generate component checkout recovery-gate`
- **Expected generated files**: `components/recovery-gate.tsx` (+ test)
- **Allowed manual files**: edit `app/(customer)/_layout.tsx` (mount the gate),
  edit `features/checkout/index.ts` (export the gate)
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/components/recovery-gate*`,
  `features/checkout/index.ts`, `app/(customer)/_layout.tsx`

## Round 4 — routes, entry & journey

### T13 — routes

- **Mode**: config
- **Acceptance**: `N/A — routing`
- **Depends on**: T08, T11
- **Skills**: test-driven-development, expo-router
- **Lead scaffold**: `pnpm generate route checkout checkout --role=customer --screen=order-review` then
  `pnpm generate route checkout checkout-success --role=customer --screen=order-success`
- **Expected generated files**: `app/(customer)/checkout.tsx`,
  `app/(customer)/checkout-success.tsx`, index.ts export additions
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `app/(customer)/checkout.tsx`,
  `app/(customer)/checkout-success.tsx`, `features/checkout/index.ts`

### T14 — Full Cart Review Order CTA

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-01`
- **Depends on**: T13
- **Skills**: test-driven-development, kisok-design-system, expo-router
- **Lead scaffold**: — (owning-feature edit)
- **Expected generated files**: —
- **Allowed manual files**: edits to
  `features/cart/screens/full-cart/full-cart-screen.tsx` and its test
- **Scaffold status**: `N/A — owning-feature edit, planned in plan.md`
- **Allowed file scope**: `features/cart/screens/full-cart/**`

### T15 — Customer journey integration test

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-16`
- **Depends on**: T09, T11, T12, T13, T14
- **Skills**: test-driven-development, kisok-react-native-rules
- **Lead scaffold**: — (integration test, convergence.test.tsx precedent)
- **Expected generated files**: —
- **Allowed manual files**: `features/checkout/checkout-journey.test.tsx`
- **Scaffold status**: `N/A — integration test, planned in plan.md`
- **Allowed file scope**: `features/checkout/checkout-journey.test.tsx`

Round gate: `PENDING` (all four rounds)

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

- —
