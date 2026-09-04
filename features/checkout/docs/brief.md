# Checkout — brief

**WHAT this feature is, and how we will know it is done.** No implementation
sequencing here; that belongs in `plan.md`.

Status: `READY` (filled after research; see Evidence).

## Objective

Let a customer with a populated local Cart submit it as ONE safe order through
the single authoritative Customer RPC `create_order(client_request_id, items)`,
with idempotent submission that survives retries, app restarts, and ambiguous
network results without ever creating a duplicate order — and finish with the
confirmed Order Success / Next Customer experience a shared kiosk requires.

This is an in-store order submission flow. It is NOT an e-commerce payment
checkout: no prices, no totals in money, no payment methods, no delivery.

## User-visible behaviour

As the person at the tablet:

1. From my populated Cart, a **Review Order** action takes me to the Checkout
   Review screen.
2. The Review screen shows what I am about to submit: each line's product
   name, variant/options label, and quantity; plus total quantity and distinct
   line count. No prices anywhere. I can go **Back to Cart**.
3. When I press **Confirm Order**, the screen locks (a visible "submitting"
   state, no double taps, no back navigation) while the order is sent.
4. If the order is confirmed, I see the **Order Success** screen: a strong
   confirmed state, my order's display number, the items I submitted, and a
   **Next Customer** action. After a period of inactivity (or when I press
   Next Customer) the kiosk resets to the Customer home for the next person.
5. If some items are no longer available in sufficient quantity, I see a
   **stock conflict** panel naming the affected items with what I asked for
   and what is available. My cart is NOT changed — I explicitly return to the
   cart to correct it.
6. If the result could not be determined (network lost mid-submission), I see
   an **unknown result** panel that tells me the order may already exist and
   offers a safe retry — the app never silently submits a second order.
7. If the submission definitely failed, I see a clear failure message with
   retry only where a retry can help.
8. If I restart the app while a submission is unresolved, the app recovers it
   safely before letting me (or anyone) edit the cart, submit again, or sign
   out.

## Acceptance criteria

Each one must be observable and checkable. These become tests.

**IDs are stable.** Every task in `plan.md` links to one by ID. Once the plan
is `READY`, never renumber or reuse an ID: a new criterion gets a new ID, and
a removed one stays here marked superseded, with the reason. Renumbering
silently invalidates every reference in `worklog.md`.

| ID    | Criterion                                                                                                                                                                                                                                                                                                                                                                                                           | Observable how                                                                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | The Full Cart screen offers a **Review Order** action that is enabled only while the cart is hydrated, populated, and not locked, and navigates to the Checkout Review route                                                                                                                                                                                                                                        | Browser/test: cart screen renders the action; disabled in restore-pending, empty, and locked presentations; press navigates to the review route                                                       |
| AC-02 | Checkout Review shows the hydrated cart contents: per-line product display name, variant/options display label, and quantity, plus total quantity and distinct line count, with **no prices**; a **Back to Cart** action returns to `/cart`                                                                                                                                                                         | Browser/test: rendered line rows and summary match the cart snapshot; navigating back returns to the cart route; no monetary values anywhere in the tree                                              |
| AC-03 | Checkout Review handles its real pre-submission states honestly: restore-pending skeleton, empty-cart escape (no submission possible), and cart persistence warnings surfaced as in the Cart feature; submission is prevented unless the cart is hydrated and populated                                                                                                                                             | Test: each reachable pre-state renders its dedicated presentation; Confirm Order is unreachable/disabled when the cart is not safely submittable                                                      |
| AC-04 | Confirming the order enters an explicit **submitting** state: duplicate presses are ignored, back navigation is prevented, a blocking overlay is shown, and the cart is locked against user edits                                                                                                                                                                                                                   | Test: second press while in flight produces no second RPC call; router back is prevented; cart controls disabled; overlay announced                                                                   |
| AC-05 | The submitted request is **normalized**: unique `variant_id` entries, positive integer quantities, exactly the two RPC keys per item, at most 100 entries, deterministic for the same logical cart (Cart lines sharing a variant are merged by summing quantities)                                                                                                                                                  | Test: cart lines with the same variantId but different option selections produce ONE request entry with the summed quantity; identical carts produce identical requests                               |
| AC-06 | Idempotent attempt ownership: a `client_request_id` is created and durably persisted, bound to the normalized request, BEFORE the first network submit; a retry of the same logical request reuses the same id and request; a changed cart never silently reuses an existing identity; a persistence failure before first submit prevents the network call                                                          | Test: stored attempt record exists before RPC fires; retry reuses id; changed cart mints a new id; failed durable write aborts submission with an honest error                                        |
| AC-07 | On a validated server success (`kind: "success"`), the app captures the immutable submitted snapshot and server fields (order_id, display_number, created_at) durably BEFORE clearing the cart, clears the cart only after confirmed success, and shows the Order Success screen with confirmed state, the display number, the submitted item snapshots and quantities, and a Next Customer action                  | Test: success payload runtime-validated with Zod; snapshot captured before clear; clear happens only on the success path; screen shows reference + items                                              |
| AC-08 | A `stock_conflict` response is a definite no-order outcome: the panel lists each affected variant with requested and available quantity (joined to cart display data), the cart is preserved without silent mutation, the customer explicitly returns to the cart, and the interaction lock is released only when it is safe to edit again                                                                          | Test: conflict panel renders per-variant requested/available values; cart lines unchanged; Return to Cart enabled; RPC not auto-retried                                                               |
| AC-09 | An ambiguous/unknown transport result is preserved as an unresolved durable attempt: the exact normalized request and idempotency identity survive, the UX is distinct from definite failure, an explicit safe retry replays the SAME identity, and the cart is not cleared                                                                                                                                         | Test: simulated transport failure leaves the attempt unresolved on disk with the same id; retry reuses id and request; unknown panel ≠ error panel                                                    |
| AC-10 | Definite server/business failures (validation, unavailable, forbidden, idempotency-conflict, server) are surfaced separately from the unknown state; a K1003 idempotency conflict is surfaced honestly and never resolved by automatically minting a new request id                                                                                                                                                 | Test: each mapped AppError kind renders the failure presentation; K1003 shows its dedicated message and does not trigger re-minting or auto-resubmission                                              |
| AC-11 | Post-success durability: a server-confirmed order remains known as CONFIRMED even if local cart cleanup fails; the unsafe local cleanup state is surfaced honestly; recovery metadata is kept until safe cleanup is proven; restart/reset cannot create a duplicate order from the confirmed state                                                                                                                  | Test: failed durable cart clear after success keeps the confirmed record, shows the cleanup warning, and blocks the Next Customer reset until cleanup succeeds                                        |
| AC-12 | Sign-out is blocked while an unresolved ambiguous attempt exists, through the public `core/auth` SignOutGuard registry, with a clear reason; the guard is side-effect-free                                                                                                                                                                                                                                          | Test: registered guard returns `blocked` while unresolved; sign-out UI shows the reason; guard performs no destructive work                                                                           |
| AC-13 | App restart/resume recovery: unresolved attempt metadata survives restart; recovery runs early enough that cart editing, fresh submission, sign-out, and Next Customer are blocked until the attempt is resolved; recovery replays the same idempotency identity and resolves to the standard outcome paths; a foreign-owner unresolved attempt is discarded without replay                                         | Test: remount/restart with a persisted unresolved attempt shows the recovery surface and locks the cart; replay uses the stored id; foreign-owner attempt is discarded and unlocked                   |
| AC-14 | Order Success reset: Next Customer and the inactivity countdown (configured `customer_success_reset_seconds`, falling back to 25s when absent) reset the kiosk to the Customer home only after the order is confirmed and local cleanup is safe; user interaction restarts the countdown; app resume recomputes from a deadline, not a paused tick counter; Checkout-owned success/attempt data is cleared at reset | Test: countdown uses the setting and falls back; interaction restarts; resume recomputes; reset blocked while cleanup unsafe; after reset, success data is gone and navigation lands on customer home |
| AC-15 | A stale or direct Order Success route with no valid immutable success payload shows a safe recovery/escape state that does not encourage resubmitting an old cart                                                                                                                                                                                                                                                   | Test: navigating to the success route with no confirmed record renders the escape state, not the success content and not the cart                                                                     |
| AC-16 | The whole flow works at tablet landscape (1280×800), tablet portrait (800×1180), and narrow web (480×900), with accessible names, announced states, ≥48dp touch targets, and no colour-only meaning                                                                                                                                                                                                                 | Browser evidence at the three sizes; test assertions on roles/labels                                                                                                                                  |

State requirements are **capability-aware**: the states specified above are
exactly the ones this feature can actually reach (idle/review, submitting,
stock conflict, unknown, definite failure, confirmed success — plus the
review's pre-submission cart states). A "loading order from server" state on
Order Success does not exist: customers cannot re-read orders, and inventing
it would test something impossible.

## General delivery requirements

These are Definition-of-Done checks, not extra Acceptance Criteria, so they do
not get fake AC IDs and tasks do not link to them as if they described product
behaviour.

- [x] Applicable read/mutation states above are handled (mutation: pending,
      success, business conflict, ambiguous, error; the feature performs no
      data-backed read of its own).
- [x] Works at the tablet sizes in `docs/design-system.md` (landscape and portrait).
- [x] Accessible: roles and labels on interactive elements; no colour-only meaning.

## Scope

- One customer feature: `features/checkout` — model schemas, the create_order
  api module, the durable attempt store, review/success screens, read-only
  line presentation, and the session-level recovery composition.
- Two routes: checkout review and order success.
- Deliberate cross-feature seams (each minimal, owning-feature-owned):
  the Cart's Review Order CTA, a Cart-owned awaitable durable clear, a
  Catalog-owned settings read, and the customer layout mounting the
  checkout recovery composition.

## Out of scope

Be explicit. This is what stops a feature growing while it is being built.

- Prices, payments, delivery, shipping, public signup, social login — permanent
  product boundaries, not deferrals. See `docs/product-boundaries.md`.
- **Customer order tracking** — the current backend has no secure Customer
  read contract for `orders`/`order_items`, and `orders` Realtime is
  Preparation-only (ADR-0006). The success screen shows only what Checkout
  itself captured.
- Exact stock quantities before submission — the catalog snapshot carries
  boolean `is_available` only; inventing a quantity contract is a backend
  decision, not a client workaround.
- Preparation/Admin behaviour of any kind; server Cart (there is none);
  catalog cache invalidation after an order (no cross-feature contract
  exists, and Realtime gives the customer nothing).
- Any database migration, RLS change, grant, or new RPC.
- Pre-review exact-quantity reconciliation (the Flutter app's §16 flow has no
  Lean V2 contract; boolean availability already governs the cart baseline).

## Constraints

- Backend contracts come from `supabase/migrations/*.sql`. If an RPC you need
  does not exist there, STOP and raise it — do not invent one. The only
  mutation this feature may call is `create_order(client_request_id uuid,
items jsonb)` (migration `20260826050007`).
- Never weaken RLS, add a grant, or write a security-definer workaround.
- The cart is driven ONLY through `@/features/cart`'s public API
  (`useCart()`, `getCartSnapshot()`, `lockCart()`, `unlockCart()`,
  `clearCart()`, `hydrateCart()`). Never deep-import the cart store; never
  mirror cart lines into a second mutable store.
- Sign-out safety integrates ONLY through `core/auth`'s public guard registry.
  Checkout registers its own guard; the Cart must not register it for us, and
  auth policy is not edited.
- Durable client state goes through `@/core/storage` (`storageKey("checkout", …)`)
  with honest write results — a failed durable write is surfaced, never
  swallowed.
- The server owns checkout correctness (idempotency, fingerprint, locking,
  snapshots, atomic deduction). The client never reimplements any of it.
- The server snapshots display fields itself; the request carries ONLY
  `variant_id` + `quantity`. No prices, SKUs, names, or option labels to the RPC.
- Hosted TEST project usage follows `docs/environment.md`: real sign-in with
  the documented Customer account, a minimal number of real test orders, no
  reset/reseed/migration of the shared project.

## Evidence

Link what this brief is based on: migration files, the Flutter reference for
BEHAVIOUR only, existing screens, research findings.

- `supabase/migrations/20260826050007_lean_create_order.sql` — the entire
  create_order contract: validation (exactly two keys, 1–100 items, unique
  variants), fingerprint, advisory lock, idempotent replay, K1001/K1002/K1003/
  K1006/42501, stock_conflict JSON, success JSON (Lead spot-checked lines
  40–210 directly).
- `supabase/migrations/20260826050013_lean_rls_grants.sql` — customer has zero
  direct rows on `orders`/`order_items`/`inventory`; `create_order` granted to
  `authenticated` only; Realtime `public.orders` is admin/preparation-visible
  only (researcher R-07/R-08/R-12, corroborated against the migration).
- `supabase/migrations/20260826050002_lean_identity_media_settings.sql:123–124`
  — `customer_success_reset_seconds integer not null default 25 check (> 0)`
  (Lead spot-check; note the constraint is `> 0`, not `> 1`).
- `supabase/migrations/20260826050006_lean_customer_catalog.sql:99–113, 206–222`
  — settings embedded in the catalog snapshot (may be `{}` when no row
  exists); per-variant `is_available` boolean only.
- `KISOK_FLUTTER_PRODUCT_REFERENCE.md` §17–§21, §28, §32, §34 — behaviour
  only: explicit six-state model, idempotent attempt ordering, unknown ≠
  failure, stock-conflict cart preservation, success snapshot before clear,
  countdown deadline semantics, stale-success-route warning, tracking gap.
- `features/cart/index.ts` + `state/use-cart.ts` + `state/cart-store.ts` —
  the public cart API, the lock semantics, the fire-and-forget `clearCart()`
  seam, and the honest `PersistenceStatus` (Lead read in full).
- `core/auth/sign-out.ts` + `docs/state-management.md:158–171` — the
  SignOutGuard registry with checkout as the documented motivating case.
- `core/errors/index.ts` — `AppError` kinds; `network` is the ambiguity
  signal; KISOK_CODE_MAP covers K1001–K1006 and 42501.
- `core/storage/index.ts` — result-returning storage, `storageKey`
  namespacing, `clearKisokStorage` emergency reset.
- Research Evidence Packets (session research, distilled in `plan.md`):
  supabase-contract-researcher (15 findings), flutter-behavior-researcher
  (25 findings), ui-researcher (14 findings).
