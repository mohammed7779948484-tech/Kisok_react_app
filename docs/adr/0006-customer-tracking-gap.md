# 0006 — Customer order tracking is blocked on a backend contract

**Status:** open · **Date:** 2026-08

## Context

The Flutter app has a working Customer Track Order experience: enter a
6-character order number, see status, items, and a timeline, with a privacy
timeout that clears the screen after inactivity. It is a real product feature.

The current database has no secure way to serve it. Reading the migrations:

- `orders` has one SELECT policy, requiring an `admin` or `preparation` profile.
  **A customer session matches no policy and can read nothing.**
- `order_items` is the same.
- `public.orders` is in the Realtime publication, but RLS applies — so a customer
  receives no events either.
- There is **no** `get_customer_order_tracking()` or equivalent RPC.

The Flutter app's tracking RPC belongs to the older database and must not be
recreated from memory.

## Decision

**Do not build customer tracking yet, and do not work around the gap.**

Specifically forbidden:

- adding a customer SELECT policy to `orders` or `order_items`
- broadening a grant to make the query work
- writing a security-definer function without a deliberate security review
- looking up an order through any other role's credentials

The foundation may reserve UI capability for it. The feature itself waits.

## What a real solution needs

A tracking contract has a genuine security problem to solve: the order number is
short, printed, and typed on a shared kiosk. Whatever is designed must consider

- **guessability** — a 6-character code from a 32-character alphabet is not a
  secret; a lookup that returns any order to anyone who guesses is a data leak
- **scope** — return the minimum: status, timestamps that actually exist, and the
  immutable item snapshots
- **rate limiting** — an unauthenticated-in-effect lookup invites enumeration
- **no fabricated timeline** — the schema has `created_at`, `completed_at`, and
  `cancelled_at`. Do not invent intermediate timestamps
- **shared-kiosk privacy** — the result must clear after inactivity

This is a backend design decision with real security weight. It should be made
deliberately, not inferred by a feature agent under time pressure.

## Related

`get_customer_catalog()` exposes boolean `is_available` but not exact stock
quantity. Showing quantity is likewise **not** forbidden as product design — it
needs an intentional secure contract, never a direct customer read of
`inventory`.
