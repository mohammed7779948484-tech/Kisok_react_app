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
Current round     : Round 1 — Domain and data layer
Current task      : T04
Current stage     : ready to scaffold T04 (T03 PASS)
Last gate         : T03 GATE: PASS
Next legal action : Lead runs `pnpm generate query preparation store-settings`, then delegates T04
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

## Status board

Scan this first. Detail is below.

| Task | Mode     | Acceptance                        | Objective                                                            | Deps                              | Stage       | Gate    |
| ---- | -------- | --------------------------------- | -------------------------------------------------------------------- | --------------------------------- | ----------- | ------- |
| T01  | behavior | Sup: AC-04/05/06                  | Zod schema for `update_order_status` result                          | —                                 | done        | PASS    |
| T02  | behavior | Sup: AC-01/02/03                  | Active-orders read (api + hook + keys)                               | —                                 | done        | PASS    |
| T03  | behavior | Sup: AC-07                        | Order-detail read (api + hook)                                       | T02 (scaffold ordering)           | done        | PASS    |
| T04  | behavior | Sup: AC-03/07/08                  | Store-settings read (api + hook)                                     | T02 (scaffold ordering)           | not started | PENDING |
| T05  | behavior | Sup: AC-04/05/06/10               | update-order-status mutation (api + hook)                            | T01                               | not started | PENDING |
| T06  | behavior | Sup: AC-08                        | Store-day-history read + store-day model                             | T04                               | not started | PENDING |
| T07  | behavior | Sup: AC-04/05/06/10               | status-actions eligibility rules                                     | —                                 | not started | PENDING |
| T08  | behavior | Sup: AC-03/07/08                  | OrderStatusBadge component                                           | —                                 | not started | PENDING |
| T09  | behavior | AC-03                             | OrderCard component                                                  | T07, T08                          | not started | PENDING |
| T10  | behavior | AC-06                             | CancelOrderDialog component                                          | T05                               | not started | PENDING |
| T11  | behavior | AC-01, AC-02, AC-04, AC-05, AC-10 | WorkspaceScreen + board-section + index route (replaces placeholder) | T02, T04, T05, T07, T08, T09, T10 | not started | PENDING |
| T12  | behavior | AC-09                             | Orders realtime invalidation wired into workspace                    | T11                               | not started | PENDING |
| T13  | behavior | AC-07, AC-10                      | OrderDetailsScreen + route                                           | T03, T04, T05, T07, T08, T10      | not started | PENDING |
| T14  | behavior | AC-08                             | StoreDayHistoryScreen + route                                        | T04, T06, T08, T09                | not started | PENDING |

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
- **Allowed manual files**: —
- **Allowed file scope**: `features/preparation/screens/store-day-history/**`, `app/(preparation)/history.tsx`, `features/preparation/index.ts`

Round gates: R1 `PENDING` · R2 `PENDING` · R3 `PENDING`

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
