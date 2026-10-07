# Maintenance — implementation plan

Status: `READY`

## Research synthesis

- `core/auth` `signOut()` is `scope: "local"`, never throws, re-checks the
  session on error, clears the query cache on success and returns
  `SignOutOutcome` (`core/auth/context.tsx:168-206`).
- The cart is persisted per owner = the shared Customer profile id, so a re-sign-in
  to the same account restores it (`features/cart/state/cart-store.ts:84-130`).
  `clear()` returns early before hydration (`cart-store.ts:155-159`).
- `CheckoutGate` wraps `app/(customer)/` and covers it during
  submitting/unknown/conflict/failure (`checkout-gate.tsx:48-58,110-122`).
- `useActiveProfile()` throws without a profile; `CheckoutGate` and `useCart`
  call it — customer sign-out has never been exercised.
- `AlertDialogOverlay` keeps an Android exit animation (the `a9c9c6a` hotfix
  covered `DialogOverlay` only), so the Staff surface is a plain screen, not a
  dialog that stays open while `(customer)` unmounts.
- Prior art: Flutter reference §20 hidden maintenance (long press on store
  identity, employee confirmation, not a security boundary);
  `docs/architecture.md` names the long-press entry in the customer shell.

## Design decisions

1. Entry: `onLongPress` + `delayLongPress={3000}` on the existing lockup in
   `features/catalog/components/catalog-shell.tsx` → `router.push("/maintenance")`.
   Catalog only knows a path; no cross-feature import.
2. Surface: a full screen at `app/(customer)/maintenance.tsx`, inside
   `CheckoutGate` by construction.
3. Order: `discardCart()` (awaited; `saved: false` blocks sign-out) → `signOut()`
   via `useAuth()` with a local single-flight/pending/message pattern copied from
   `useSignOutAction` (which hides the outcome).
4. `features/cart` gains one additive export, `discardCart(): Promise<{ saved: boolean }>`.

## Feature shape

`screens/maintenance/` (screen + test) and the route. No `api/`, `queries/`,
`state/` or `model/` — the feature owns no data.

## Generator commands, mapped to tasks

| Command                                                                            | Task |
| ---------------------------------------------------------------------------------- | ---- |
| `pnpm generate screen maintenance maintenance`                                     | T03  |
| `pnpm generate route maintenance maintenance --role=customer --screen=maintenance` | T03  |

## Rounds and tasks

| Task | Mode        | Acceptance          | Objective                                                    | Deps | Scope                                                                |
| ---- | ----------- | ------------------- | ------------------------------------------------------------ | ---- | -------------------------------------------------------------------- |
| T01  | bug (guard) | AC-07               | Customer sign-out lands on sign-in without an error boundary | —    | `app/__tests__/customer-sign-out-teardown.test.tsx`; fix only if red |
| T02  | behavior    | Supporting AC-03/04 | `discardCart()` in `features/cart`                           | —    | `features/cart/state/*`, `features/cart/index.ts`                    |
| T03  | behavior    | AC-02, AC-03–AC-06  | Staff screen + route                                         | T02  | `features/maintenance/**`, `app/(customer)/maintenance.tsx`          |
| T04  | behavior    | AC-01               | Lockup long press                                            | T03  | `features/catalog/components/catalog-shell.tsx` + test               |
| T05  | config      | N/A — docs          | Correct docs that become false                               | T03  | `docs/state-management.md`, `docs/adr/0003-client-state.md`          |

## Files expected to change outside the feature

`features/cart` (additive export), `features/catalog/components/catalog-shell.tsx`,
`app/(customer)/maintenance.tsx`, `app/__tests__/customer-sign-out-teardown.test.tsx`,
`docs/state-management.md`, `docs/adr/0003-client-state.md`.

## Risks

- Catalog screens may refetch once after the cache clear while unmounting; tests
  must not assert a silent log.
- A hung checkout recovery shows "Restoring…" without the shell, so staff cannot
  reach the Staff page in that state (accepted, documented).
- TalkBack announces a long-press action on the lockup (acceptable; not a
  security boundary).

## Verification

Focused tests per task, `pnpm typecheck`, `pnpm lint`; `pnpm verify` at the end;
Android long-press timing and sign-out navigation verified on a device or
recorded as unverified.
