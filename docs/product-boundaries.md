# Product boundaries

KISOK is a **private in-store catalog and ordering system** on store-owned
tablets. It is not an e-commerce app, and the architecture should not anticipate
becoming one.

## Deliberately absent

| Not in scope                                           | Why                                          |
| ------------------------------------------------------ | -------------------------------------------- |
| Prices, subtotals, totals                              | The kiosk does not transact money            |
| Payments, checkout charging                            | Handled at the counter                       |
| Delivery, shipping, addresses                          | The customer is physically in the store      |
| Public signup, onboarding                              | Accounts are provisioned by an administrator |
| Social login                                           | Same                                         |
| Account creation or profile management from the tablet | Same                                         |
| Catalog editing from the tablet                        | Belongs to the web admin app                 |
| Public/outside-store ordering                          | The app is for in-store use                  |
| Admin management screens                               | A separate web application                   |

If a request seems to need one of these, raise it rather than building it.

## Judgement calls, not prohibitions

**Exact stock quantity** is _not_ forbidden as product design. Today the customer
catalog snapshot exposes only boolean `is_available`, so showing a quantity would
require a new secure backend contract — not a client workaround, and never a
direct read of `inventory` by a customer.

**Customer order tracking** exists in the Flutter app and is a legitimate product
goal. It is blocked on a secure backend contract, not on product appetite. See
[adr/0006-customer-tracking-gap.md](./adr/0006-customer-tracking-gap.md).

## Invariants that must not be casually changed

- Role-gated customer and preparation experiences
- Catalog visibility enforced by the backend, never by client filtering
- The cart is local, non-authoritative client state
- Cart persistence failures are surfaced, never swallowed
- Inventory and order creation are server-authoritative
- Checkout is idempotent; an ambiguous result is **not** an ordinary failure
- Unresolved checkout metadata survives until it can be safely resolved
- The cart clears only after confirmed server success
- Order item snapshots are immutable — never rebuild a historical order label
  from current catalog rows
- A stock conflict never silently mutates the cart
- Reset and sign-out can never create duplicate-order risk
- Realtime is an invalidation signal
- Store timezone (`store_settings.store_timezone`) defines the operational day
- No client secrets; RLS and RPC authorization are the real boundary
