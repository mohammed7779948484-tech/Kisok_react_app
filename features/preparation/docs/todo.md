# Preparation — execution state

**This file is the working memory.** After a context compaction, an interrupted
session, or a handoff, this is what tells the next agent exactly where the work
stopped and what the next legal move is. Keep it current as you go, not at the
end.

Reasoning lives in `plan.md`; evidence lives in `worklog.md`. Do not restate
either here — a `todo.md` that duplicates the plan stops being scannable, which
defeats its only purpose.

## Current checkpoint

```
Current round     : Round 3 — Order details and store-day history
Current task      : T14
Current stage     : Round 3 GATE PASS — all tasks and rounds done
Last gate         : Round 3 GATE: PASS (pnpm verify EXIT=0; cross-task review
                    no blocking/major; R3-01/R3-02 fixed, disclosed)
Next legal action : Lead pushes feature/preparation and opens the DRAFT PR
                    against develop, then the develop integration check,
                    final verification, final code review, quality audit,
                    Feature Gate
Blocked by        : —
```

## Rules

- A task is **DONE only at `GATE: PASS`**.
- **Task N+1 does not start until every dependency is `PASS`.**
- A failed gate is fixed **in that task**, not compensated in a later one.
- Every task declares a **verification mode** first — see
  the `test-driven-development` skill. The mode decides the entry evidence:
  `behavior` / `bug` / `behavior-change` need a failing test, `refactor` needs
  a named green baseline, `config` needs the command that exercises the artifact.
- **No task starts while `plan.md` is `DRAFT`.**
- **The Lead runs the scaffold**, immediately before delegating the task. The
  implementer starts only once `Scaffold status` is `READY`.

## Carried constraints (from reviews — REQUIRED in the named task's packet)

The working memory for pending tasks. Each item was a review finding whose
fix belongs to a FUTURE task; the task's packet MUST include it.

- ~~**T09** — add the `Equals<Tables<"orders"> extends
OrderActionOrder…>` compile-time pin in fetch-active-orders.test.ts
  (T07-R01; the model cannot import generated types — ESLint confines
  @/core/supabase to api/\*\*).~~ DONE at the T09 gate (~7 additive lines,
  the file's own type+const+expect idiom; ACCEPTED as disclosed).
- ~~**T11/T13** — the cancel-rejection flow specifically (T10-R01): on a
  rejected cancel → dialog `open=false`, feedback near the card, then
  invalidate/refetch — with its own screen test (not only
  start-preparing/mark-ready rejections). T11 half DONE at the T11 gate
  (own dedicated test); T13 half DONE at the T13 gate (dedicated test:
  dialog closed FIRST, then near-action feedback + refetch).~~
- **T12** — ~~four T11 carried minors~~ DONE at the T12 gate (R02 timer+
  cleanup, R03 empty-group pin, R04 InlineError banner, R05 hour % 24
  absorption; see the T12 entry).
- ~~**T11/T13** — screens own AC-10's rejected-transition refresh:
  onError → invalidate/refetch (T05-R02; the hook invalidates on success
  only).~~ Both DONE at their gates (every rejection test asserts
  refetch ≥ 2).
- **T11/T13/T14** — error-state rendering must NOT assume `error.kind`
  (T04 O-1: transport-level throws are not AppError at screens). T11/T13
  halves DONE; ~~the T14 half REMAINS REQUIRED~~ DONE at the T14 gate
  (history.error flows as unknown; grep-verified zero .kind reads).
- ~~**T13** — the details screen MUST branch on a missing `orderId` route
  param and render the unavailable state without fabricating an id
  (T03-R03; a fabricated id stringifies into a doomed retryable request).~~
  DONE at the T13 gate (branch-first; two no-fetch assertions).
- ~~**T14** — decide the history rollover policy: accept event-driven
  rollover (realtime + focus refetch self-correct) or add a screen-level
  refetchInterval (R1-05; the dayKey rolls on the next render, not on a
  timer).~~ DONE at the T14 gate: event-driven accepted, NO refetchInterval;
  docblock rationale in the screen + hook; rollover pin made falsifiable
  (parked day retained across midnight even with timers advanced — the
  T14-R01 re-review fix).
- ~~**T14** — T13-R01 (carried): lift `formatCreatedAt` into
  `features/preparation/model/order-display.ts` (+ unit test for the
  pure helper) — T14 is the third consumer; both existing screens delete
  their local copies and import it.~~ DONE at the T14 gate (logic-identical
  lift, 3 unit tests; the pending-label map stayed per-screen).
- ~~**T14** — T13-R02 (carried, additive test): in
  `features/preparation/screens/order-details/order-details-screen.test.tsx`,
  reject the read with a non-retryable AppError → assert no "Try again"
  (pins the retryable/non-retryable distinction judgement call 2 rests
  on).~~ DONE at the T14 gate (forbidden non-retryable read → no "Try again").
- ~~**T14** — T13-R03 (folded one-liner): compound
  `key={`${label}-${index}`}` for the option-label map in
  order-details-screen.tsx (duplicate-key hardening; no test change).~~
  DONE at the T14 gate.

Shared-file notes (ACCEPTED — Lead-owned foundation chores, NOT feature
work; do not edit core/\*\* from this feature):

- core/testing/supabase.ts doc lists two tables; store_settings is also
  an allowed preparation direct read (T04-R02).
- core/testing's installMockSupabase chain has no `or` method (T06);
  feature api tests use the in-file recording stub instead.
- useMutation tests need mutations.gcTime: Infinity for jest to exit
  (T05); test-local createMutationTestClient until the shared helper
  gains it.

## Status board

Scan this first. Detail is below.

| Task | Mode     | Acceptance                        | Objective                                                            | Deps                              | Stage | Gate |
| ---- | -------- | --------------------------------- | -------------------------------------------------------------------- | --------------------------------- | ----- | ---- |
| T01  | behavior | Sup: AC-04/05/06                  | Zod schema for `update_order_status` result                          | —                                 | done  | PASS |
| T02  | behavior | Sup: AC-01/02/03                  | Active-orders read (api + hook + keys)                               | —                                 | done  | PASS |
| T03  | behavior | Sup: AC-07                        | Order-detail read (api + hook)                                       | T02 (scaffold ordering)           | done  | PASS |
| T04  | behavior | Sup: AC-03/07/08                  | Store-settings read (api + hook)                                     | T02 (scaffold ordering)           | done  | PASS |
| T05  | behavior | Sup: AC-04/05/06/10               | update-order-status mutation (api + hook)                            | T01                               | done  | PASS |
| T06  | behavior | Sup: AC-08                        | Store-day-history read + store-day model                             | T04                               | done  | PASS |
| T07  | behavior | Sup: AC-04/05/06/10               | status-actions eligibility rules                                     | —                                 | done  | PASS |
| T08  | behavior | Sup: AC-03/07/08                  | OrderStatusBadge component                                           | —                                 | done  | PASS |
| T09  | behavior | AC-03                             | OrderCard component                                                  | T07, T08                          | done  | PASS |
| T10  | behavior | AC-06                             | CancelOrderDialog component                                          | T05                               | done  | PASS |
| T11  | behavior | AC-01, AC-02, AC-04, AC-05, AC-10 | WorkspaceScreen + board-section + index route (replaces placeholder) | T02, T04, T05, T07, T08, T09, T10 | done  | PASS |
| T12  | behavior | AC-09                             | Orders realtime invalidation wired into workspace                    | T11                               | done  | PASS |
| T13  | behavior | AC-07, AC-10                      | OrderDetailsScreen + route                                           | T03, T04, T05, T07, T08, T10      | done  | PASS |
| T14  | behavior | AC-08                             | StoreDayHistoryScreen + route                                        | T04, T06, T08, T09                | done  | PASS |

Stage is one of: `not started` · `scaffolding` · `red/baseline` ·
`implementing` · `green` · `checks` · `diff review` · `done`.

This board is the only summary. Do not add a second task-checkbox list beside
it — two summaries disagree the moment one is updated and the other is not.

## Round 1 — Domain and data layer

### T01 — order-status-update schema

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-04/AC-05/AC-06`
- **Depends on**: —
- **Skills**: test-driven-development, supabase
- **Lead scaffold**: `pnpm generate schema preparation order-status-update`
- **Expected generated files**: `features/preparation/model/order-status-update.schema.ts`, `features/preparation/model/order-status-update.schema.test.ts`
- **Allowed manual files**: —
- **Allowed file scope**: `features/preparation/model/**`

### T02 — active-orders read

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-01/AC-02/AC-03`
- **Depends on**: — (a direct table read; no schema involved)
- **Skills**: test-driven-development, supabase
- **Lead scaffold**: `pnpm generate query preparation active-orders`
- **Expected generated files**: `features/preparation/api/fetch-active-orders.ts`, `features/preparation/queries/use-active-orders.ts`, `features/preparation/queries/keys.ts`
- **Allowed manual files**: —
- **Allowed file scope**: `features/preparation/api/**`, `features/preparation/queries/**`

### T03 — order-detail read

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-07`
- **Depends on**: T02 (scaffold ordering: keys.ts is generated once, by the first query)
- **Skills**: test-driven-development, supabase
- **Lead scaffold**: `pnpm generate query preparation order-detail`
- **Expected generated files**: `features/preparation/api/fetch-order-detail.ts`, `features/preparation/queries/use-order-detail.ts`
- **Allowed manual files**: —
- **Allowed file scope**: `features/preparation/api/**`, `features/preparation/queries/**`

### T04 — store-settings read

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-03/AC-07/AC-08`
- **Depends on**: T02 (scaffold ordering, as above)
- **Skills**: test-driven-development, supabase
- **Lead scaffold**: `pnpm generate query preparation store-settings`
- **Expected generated files**: `features/preparation/api/fetch-store-settings.ts`, `features/preparation/queries/use-store-settings.ts`
- **Allowed manual files**: —
- **Allowed file scope**: `features/preparation/api/**`, `features/preparation/queries/**`

### T05 — update-order-status mutation

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-04/AC-05/AC-06/AC-10`
- **Depends on**: T01
- **Skills**: test-driven-development, supabase
- **Lead scaffold**: `pnpm generate mutation preparation update-order-status`
- **Expected generated files**: `features/preparation/api/update-order-status.ts`, `features/preparation/queries/use-update-order-status-mutation.ts`
- **Allowed manual files**: —
- **Allowed file scope**: `features/preparation/api/**`, `features/preparation/queries/**`

### T06 — store-day-history read + store-day model

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-08`
- **Depends on**: T04
- **Skills**: test-driven-development, supabase
- **Lead scaffold**: `pnpm generate query preparation store-day-history`
- **Expected generated files**: `features/preparation/api/fetch-store-day-history.ts`, `features/preparation/queries/use-store-day-history.ts`
- **Allowed manual files**: `features/preparation/model/store-day.ts` (+ `.test.ts`) — pure day-window/terminal-filter/timezone-resolver rules; no capability fits
- **Allowed file scope**: `features/preparation/api/**`, `features/preparation/queries/**`, `features/preparation/model/**`

### T07 — status-actions rules

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-04/AC-05/AC-06/AC-10`
- **Depends on**: —
- **Skills**: test-driven-development, supabase
- **Lead scaffold**: — (N/A — no generator capability applies; pure domain rules)
- **Expected generated files**: —
- **Allowed manual files**: `features/preparation/model/status-actions.ts` (+ `.test.ts`) — action-eligibility matrix mirroring migration 08
- **Allowed file scope**: `features/preparation/model/**`

## Round 2 — The workspace board

### T08 — OrderStatusBadge

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-03/AC-07/AC-08`
- **Depends on**: — (uses only the generated status type)
- **Skills**: test-driven-development, kisok-design-system
- **Lead scaffold**: `pnpm generate component preparation order-status-badge`
- **Expected generated files**: `features/preparation/components/order-status-badge.tsx`
- **Allowed manual files**: —
- **Allowed file scope**: `features/preparation/components/**`

### T09 — OrderCard

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-03`
- **Depends on**: T07, T08
- **Skills**: test-driven-development, kisok-design-system, kisok-react-native-rules
- **Lead scaffold**: `pnpm generate component preparation order-card`
- **Expected generated files**: `features/preparation/components/order-card.tsx`
- **Allowed manual files**: `features/preparation/model/order-display.ts` — item summary / deterministic ordering / option-label helpers, if needed
- **Allowed file scope**: `features/preparation/components/**`, `features/preparation/model/**`

### T10 — CancelOrderDialog

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-06`
- **Depends on**: T05
- **Skills**: test-driven-development, kisok-design-system
- **Lead scaffold**: `pnpm generate component preparation cancel-order-dialog`
- **Expected generated files**: `features/preparation/components/cancel-order-dialog.tsx`
- **Allowed manual files**: —
- **Allowed file scope**: `features/preparation/components/**`

### T11 — WorkspaceScreen + board-section + index route

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-01, AC-02, AC-04, AC-05, AC-10`
- **Depends on**: T02, T04, T05, T07, T08, T09, T10
- **Skills**: test-driven-development, kisok-design-system, kisok-react-native-rules, expo-router
- **Lead scaffold**: `pnpm generate screen preparation workspace` + `pnpm generate component preparation board-section --screen=workspace` + `pnpm generate route preparation index --role=preparation --screen=workspace --force`
- **Expected generated files**: `features/preparation/screens/workspace/workspace-screen.tsx`, `features/preparation/screens/workspace/workspace-screen.test.tsx`, `features/preparation/screens/workspace/components/board-section.tsx`, `app/(preparation)/index.tsx` (REPLACES the Foundation placeholder — planned `--force`), `features/preparation/index.ts` (appended export)
- **Allowed manual files**: —
- **Allowed file scope**: `features/preparation/screens/workspace/**`, `app/(preparation)/index.tsx`, `features/preparation/index.ts`

### T12 — Orders realtime invalidation

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-09`
- **Depends on**: T11
- **Skills**: test-driven-development, supabase, kisok-react-native-rules
- **Lead scaffold**: `pnpm generate realtime preparation orders --role=preparation`
- **Expected generated files**: `features/preparation/queries/use-orders-realtime.ts`
- **Allowed manual files**: —
- **Allowed file scope**: `features/preparation/queries/**`, `features/preparation/screens/workspace/**` (wiring only)

## Round 3 — Order details and store-day history

### T13 — OrderDetailsScreen + route

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-07, AC-10`
- **Depends on**: T03, T04, T05, T07, T08, T10
- **Skills**: test-driven-development, kisok-design-system, kisok-react-native-rules, expo-router
- **Lead scaffold**: `pnpm generate screen preparation order-details` + `pnpm generate route preparation order-details --role=preparation --screen=order-details`
- **Expected generated files**: `features/preparation/screens/order-details/order-details-screen.tsx`, `features/preparation/screens/order-details/order-details-screen.test.tsx`, `app/(preparation)/order-details.tsx`, `features/preparation/index.ts` (appended export)
- **Allowed manual files**: —
- **Allowed file scope**: `features/preparation/screens/order-details/**`, `app/(preparation)/order-details.tsx`, `features/preparation/index.ts`

### T14 — StoreDayHistoryScreen + route

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-08`
- **Depends on**: T04, T06, T08, T09
- **Skills**: test-driven-development, kisok-design-system, kisok-react-native-rules, expo-router
- **Lead scaffold**: `pnpm generate screen preparation store-day-history` + `pnpm generate route preparation history --role=preparation --screen=store-day-history`
- **Expected generated files**: `features/preparation/screens/store-day-history/store-day-history-screen.tsx`, `features/preparation/screens/store-day-history/store-day-history-screen.test.tsx`, `app/(preparation)/history.tsx`, `features/preparation/index.ts` (appended export)
- **Allowed manual files**: `features/preparation/model/order-display.ts` (+ `.test.ts`) — the T13-R01 lift of
  `formatCreatedAt` into the planned shared helper (T14 is the third consumer)
- **Allowed file scope** (extended for the T13 carried findings — sanctioned by the Lead at the T13 gate;
  reconciled at the T14 gate to match the real diff, per the re-review's T14-N01):
  `features/preparation/screens/store-day-history/**`, `app/(preparation)/history.tsx`,
  `features/preparation/index.ts`, `features/preparation/model/**` (order-display lift),
  `features/preparation/screens/workspace/workspace-screen.tsx` (local formatCreatedAt
  deleted → import, PLUS the AC-08 History affordance + its docblock line — both in the
  Lead's sanctioned packet) and `workspace-screen.test.tsx` (+1 History-navigation test),
  `features/preparation/screens/order-details/order-details-screen.tsx` (local
  formatCreatedAt deleted → import + the T13-R03 one-line key change — nothing else) and
  `order-details-screen.test.tsx` (one additive non-retryable-read test)

Round gates: R1 `PASS` · R2 `PASS` · R3 `PASS`

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
