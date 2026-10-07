# Maintenance — brief

**WHAT this feature is, and how we will know it is done.** No implementation
sequencing here; that belongs in `plan.md`.

Status: `READY`

## Objective

A cashier/store operator signs the shared Customer tablet into its Customer
account; customers then use it all shift. When responsibility changes, staff need
a reliable, discreet way to sign that account out so another authorised operator
can sign in — without a visible customer-facing "Sign out" button.

## User-visible behaviour

Customers see nothing new. Staff press and hold the store logo in the catalog
header for about three seconds; a full-screen **Staff** page opens. It names the
signed-in account, says whether a cart is in progress (and that signing out
clears it), and offers **Back to the catalog** and **Sign out**. Signing out
shows progress, then the sign-in screen. A failure is shown on the page and can
be retried.

## Acceptance criteria

| ID    | Criterion                                                                                                                                                                              | Observable how                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| AC-01 | A tap on the catalog store lockup still goes Home; a ~3 s hold opens the Staff page. No visible affordance or hint is added.                                                           | Shell test: press → Home; long press → `/maintenance`.                         |
| AC-02 | The Staff page shows the signed-in account name and, when the cart has lines, "A cart with N items is in progress. Signing out clears it." It offers Back to the catalog and Sign out. | Screen test with an empty and a non-empty cart.                                |
| AC-03 | Sign out discards the shared cart first (memory and tablet storage, even before hydration), then signs out locally through `core/auth`; success lands on sign-in.                      | Screen test asserts order; cart test asserts storage removal; root guard test. |
| AC-04 | If the cart discard cannot be saved to the tablet, sign-out does not start and the page explains why.                                                                                  | Screen test with a failing storage write.                                      |
| AC-05 | While signing out the action is disabled and says "Signing out…"; a repeated press does nothing; a failed sign-out keeps the page with an alert message and can be retried.            | Screen test for pending, double press, failure, retry.                         |
| AC-06 | The checkout pending/idempotency record is never touched, and the Staff page is unreachable while `CheckoutGate` covers an unresolved order.                                           | Screen test asserts no checkout API use; gate covers the `(customer)` group.   |
| AC-07 | Signing the Customer account out does not crash the customer tree (no error boundary) even though customer components read the active profile.                                         | `app/__tests__/customer-sign-out-teardown.test.tsx` (real router).             |

## Scope

Hidden entry, Staff page, cart discard, local sign-out, the docs that become
false (customer UI "has no sign-out").

## Out of scope

PIN/password re-entry or any second auth mechanism; MDM, kiosk or device-owner
control; diagnostics, catalog refresh, "reset kiosk"; an idle timer; any change
to checkout state. This is not a security boundary (see Flutter reference §20).

## Constraints

Use `core/auth` `signOut()` (scope local); no new grants, RPCs or migrations;
cross-feature imports through public APIs only.

## Evidence

`worklog.md` per task; root guard test; screen tests; Android runtime noted as
verified or explicitly unverified.
