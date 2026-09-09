# Cart — brief

**WHAT this feature is, and how we will know it is done.** No implementation
sequencing here; that belongs in `plan.md`.

Status: complete — every TODO replaced; the implementation-readiness signal
lives in `plan.md` (`DRAFT` → `READY`).

## Objective

Give a customer on a shared store tablet a local, durable shopping cart they
can build and manage while browsing: add a selected product variant, adjust
quantities, remove lines, and clear the cart — with the cart surviving app
restarts, never leaking between customer profiles, and reporting honestly when
its state could not be saved. The cart is **client-owned local state**; the
backend has no cart, and none is invented. This feature delivers the cart
model, persistence, behavior, and Cart-owned UI surfaces (an adaptive quick
cart and a Full Cart screen) as an independently mergeable PR that does not
touch the parallel Catalog feature.

## User-visible behaviour

A signed-in customer opens the Full Cart at `/cart` (or a future shell opens
the quick cart sheet after "Add to cart" — wiring deferred to Catalog
integration). They see their cart: each line shows the product image (with
fallback), product name, the selected variant/options label, a quantity
stepper, and a remove control. The cart can be empty (with an action to browse
products), persisted from a previous session, or — after a failed save —
carrying a visible "saved in memory only" warning. Destructive actions (remove
line, clear cart) confirm first. All quantities total is visible at a glance.
During a future critical operation (checkout) the cart locks: controls disable
instead of silently ignoring taps. On sign-out, the customer's cart state is
cleared from memory and disk so the next customer starts clean; if the durable
clear cannot be proven, that failure surfaces rather than being swallowed.

No prices, subtotals, or money of any kind appear anywhere in the cart.

## Acceptance criteria

Each one must be observable and checkable. These become tests.

**IDs are stable.** Every task in `plan.md` links to one by ID. Once the plan
is `READY`, never renumber or reuse an ID: a new criterion gets a new ID, and a
removed one stays here marked superseded, with the reason. Renumbering silently
invalidates every reference in `worklog.md`.

| ID    | Criterion                                                                                                                                                                                                                                                                                                                                                                      | Observable how                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | Cart ownership is scoped to the active customer profile: the persisted payload records its owner; restoring under a different profile never surfaces another customer's cart — mismatched data is discarded and durably cleared                                                                                                                                                | Store test: hydrate with mismatched owner → empty memory + key removed; if durable discard fails → `clearFailed`, never restored                                                              |
| AC-02 | Durable restore: a previously persisted cart for the same active profile is restored after restart (lines + quantities); nothing persisted → empty; a corrupt/unreadable payload starts clean without crashing                                                                                                                                                                 | Store tests: hit/owner-match restores; miss → empty; rejected → clean start + attempted durable clear                                                                                         |
| AC-03 | Add/merge/distinct-line behavior: adding the same variant + same option-value selection as an existing line merges by summing quantities; a different variant or different option selection creates a distinct line; each line carries the display snapshot needed to render itself without Catalog                                                                            | Domain/store tests with a fake add input: merge sums; distinct selection → new line; line identity stable across re-adds                                                                      |
| AC-04 | Quantity behavior: per-line quantity can be incremented and decremented; minimum is 1 (decrement disabled at 1); removal of a line is an explicit, confirmed action; every change persists durably through the store                                                                                                                                                           | Store + component tests: stepper bounds; remove opens destructive confirm; setQuantity persists via serialized write path                                                                     |
| AC-05 | Clear-cart: clears memory immediately and durably (with confirmation in UI); a failed durable clear is reported as `clearFailed` — never as `memoryOnly` or `persisted` — and follows the store template's remove→overwrite fallback                                                                                                                                           | Store tests (memory backend `failOn`): successful clear; remove-fails-but-overwrite-succeeds; both fail → `clearFailed`; UI: clear asks for confirmation                                      |
| AC-06 | Persistence truthfulness: every cart mutation writes through `@/core/storage` with serialized (never interleaved) writes; success → `persisted`; failed durable write → `memoryOnly` with a visible warning in cart surfaces; the store never claims durable success after a failed write                                                                                      | Store tests: write failure → `memoryOnly`; concurrent rapid mutations → writes serialized, final state on disk; component test: warning rendered when `memoryOnly`                            |
| AC-07 | Sign-out cleanup: Cart registers destructive cleanup through the CURRENT `core/auth` public registry (`registerSignOutCleanup`), clears memory + durable cart state, propagates failure (throws) so the auth emergency fallback can run, and registers NO sign-out guard (that belongs to future Checkout)                                                                     | Integration test: registration present, `runSignOutCleanup()` clears memory + disk; clear-failure path throws; no guard registered by cart                                                    |
| AC-08 | Correct summaries: total quantity (sum of line quantities) and distinct line count are derived from the single cart model and exposed for surfaces and the future shell badge                                                                                                                                                                                                  | Store tests: totals recompute on add/merge/quantity-change/remove/clear                                                                                                                       |
| AC-09 | Interaction lock for future critical operations: `lock`/`unlock` are exposed; while locked, user-driven mutations (add, set quantity, remove) do not change state and controls render disabled; the programmatic clear path (post-checkout-success) is not blocked by the lock                                                                                                 | Store tests: locked mutations are no-ops, clear still works; component test: controls disabled when locked                                                                                    |
| AC-10 | Adaptive quick-cart surface exists as a public Cart component on the approved `AdaptiveSheet` primitive: expanded (landscape) → side panel, compact/portrait → bottom sheet; shows total quantity, per-line quantity control and remove, empty state, `memoryOnly` warning, locked-disabled controls, and Continue Shopping / View Full Cart intents                           | Component tests (both layout modes via initial metrics): sheet renders populated/empty/locked/warning states; intents callable; runtime browser check at tablet sizes                         |
| AC-11 | Full Cart management screen reachable at a NEW disjoint customer route `/cart` that renders the feature screen via its public API; the route file stays thin; the screen handles restore-pending, empty (with escape action), populated list, persistence warning, and locked states; no import from `features/catalog/**`                                                     | Screen/route tests + runtime: `/cart` renders, empty state offers browse escape, populated cart editable; ESLint/architecture check: no catalog imports, `app/(customer)/index.tsx` untouched |
| AC-12 | Responsive and accessible: cart surfaces work at tablet landscape, tablet portrait, and compact/narrow web; interactive elements have accessible names/roles and ≥48dp touch targets; warnings announce politely; disabled state is exposed as accessibility state, not colour alone                                                                                           | Component tests via `getByRole`/`getByLabelText`/`toBeDisabled()`; runtime browser verification at the three representative sizes                                                             |
| AC-13 | Narrow public API and parallel isolation: Cart exposes types, a consumer hook, plain actions, and its surfaces via `features/cart/index.ts` only; no deep imports needed by future Catalog/Checkout; no edits to `features/catalog/**`, `features/preparation/**`, `app/(customer)/index.tsx`, `app/(customer)/_layout.tsx`, `core/**`, `components/**`, or Supabase artifacts | Public-API test importing `@/features/cart` only; diff review: changed files limited to `features/cart/**` + `app/(customer)/cart.tsx`                                                        |

State requirements are **capability-aware**. Put a state into an AC only when
that feature can actually reach it — inventing an empty state for a screen that
cannot be empty produces a test asserting something impossible.

| If the feature has…     | The states to specify                                           |
| ----------------------- | --------------------------------------------------------------- |
| a data-backed read      | loading, empty, error with retry, success — only as applicable  |
| a mutation              | pending, success, business conflict, error — only as applicable |
| static or local-only UI | only the states that genuinely exist                            |

The cart is local-only client state: it has **no** server loading/error/retry
or business-conflict states. Its genuine states are: restore-pending (async
local read), empty, populated, `memoryOnly` warning, `clearFailed`, and
locked. Stock/availability reconciliation is NOT a cart state — see out of
scope.

## General delivery requirements

These are Definition-of-Done checks, not extra Acceptance Criteria, so they do
not get fake AC IDs and tasks do not link to them as if they described product
behaviour.

- [x] Applicable read/mutation states above are handled. (N/A — local-only UI;
      the genuinely reachable states are specified in AC-02/AC-05/AC-06/AC-10/AC-11.)
- [x] Works at the tablet sizes in `docs/design-system.md` (landscape and portrait).
      (RUNTIME EVIDENCE, review.md: 1280×800 / 800×1180 / 480×900 — zero horizontal
      overflow; measured touch targets at 480×900: steppers 48×48, Remove 48×48,
      Clear Cart 432×56. Component suites pin both AdaptiveSheet frames.)
- [x] Accessible: roles and labels on interactive elements; no colour-only meaning.
      (a11y names/roles/live-region/toBeDisabled() asserted across suites — 26
      disabled-state assertions; disabled exposed as state, warnings announce
      politely; AC-12 evidence table in worklog.md.)

## Scope

- `features/cart/` — the cart feature slice: model (line/persisted schemas,
  pure rules), state (Zustand store with owner-scoped persistence, serialized
  writes, interaction lock, sign-out cleanup registration), components
  (quantity stepper, cart line row, adaptive quick-cart sheet), and the
  Full Cart screen.
- One new thin route file: `app/(customer)/cart.tsx` (renders the Cart screen
  through the feature public API).
- A narrow public API for later Catalog / Checkout integration.

## Out of scope

Be explicit. This is what stops a feature growing while it is being built.

- Prices, payments, delivery, shipping, public signup, social login — permanent
  product boundaries, not deferrals. See `docs/product-boundaries.md`.
- **Catalog integration**: Product Detail "Add to cart" wiring, customer-shell
  cart button/badge, opening the quick sheet from catalog surfaces — deferred
  to a later integration task after Catalog and/or Cart lands on `develop`.
  This PR must not edit `features/catalog/**` or `app/(customer)/index.tsx`.
- **Checkout/order submission**: `create_order()` calls, idempotency metadata,
  checkout state machine, stock-conflict handling, order review, order success.
  Future Checkout owns all of it; Cart only provides the lock and read/clear
  APIs it will need.
- Exact inventory reconciliation, exact stock quantity, or any "N left" UI:
  the customer-safe contract exposes boolean `is_available` only, and there is
  no reconciliation RPC — see the plan's research synthesis. Never silently
  delete or reduce cart lines because availability changed.
- Customer order tracking (no secure backend contract — ADR-0006).
- Server-side cart storage, Supabase schema/migration changes, RLS changes,
  Realtime (only `public.orders` is published; a customer session gets
  nothing).
- Preparation/Admin behavior.

## Constraints

- Backend contracts come from `supabase/migrations/*.sql`. If an RPC you need
  does not exist there, STOP and raise it — do not invent one.
- Never weaken RLS, add a grant, or write a security-definer workaround.
- The cart is non-authoritative local client state: exactly ONE cart state
  model (the Zustand store). No local React copy, no TanStack Query cache, no
  second Checkout-owned model.
- Persistence goes through `@/core/storage` (NOT Zustand `persist`
  middleware, which cannot report failed writes). Keys are namespaced with
  `storageKey("cart", …)`.
- Cart ownership uses the active profile identity from the CURRENT auth
  foundation (`useActiveProfile()` / `current_active_profile()` projection —
  `profile.id`).
- Sign-out cleanup integrates through the CURRENT `core/auth` public cleanup
  registry; Cart registers cleanup only, never a sign-out guard (future
  Checkout owns the guard for unresolved submissions).
- Cross-feature dependencies flow through public APIs only; Cart must not
  import `features/catalog/**` and must not require Catalog to exist for its
  state/domain correctness.
- This PR runs in parallel with Catalog/Preparation: stay inside
  `features/cart/**` plus the one planned route file.
- UI composes from existing design-system primitives (`AdaptiveSheet`,
  `ConfirmDialog`, `Alert`, `EmptyState`, `AppImage`, `Button`, `Text`,
  `Badge`, `Screen`, `Separator`) with semantic tokens and ≥48dp touch
  targets. No new shared primitives.

## Evidence

Link what this brief is based on: migration files, the Flutter reference for
BEHAVIOUR only, existing screens, research findings.

- Research evidence packets (this session):
  - supabase-contract-researcher — negative contract: no server cart, no
    reconciliation RPC, boolean `is_available` only, `create_order` is
    Checkout's boundary, `current_active_profile()` is the identity signal
    (migrations `20260826050001`…`20260826050013`).
  - flutter-behavior-researcher — 22 findings from
    `KISOK_FLUTTER_PRODUCT_REFERENCE.md` §13–§20, §30, §32, §34: profile
    scoping, durable restore, merge semantics, serialized writes,
    persisted/memoryOnly/clearFailed, interaction lock, one-cart-model,
    no-price boundary, no silent cart mutation, kiosk reset gating.
  - ui-researcher — 15 findings: `AdaptiveSheet` is the approved quick-cart
    surface; `ConfirmDialog` documents "remove a cart line"; `Alert
variant="warning"` for memoryOnly; `EmptyState` for empty; quantity
    stepper genuinely missing (feature-local); ScrollView not virtualization
    (≤100 lines); a11y conventions; responsive breakpoints.
- `docs/state-management.md` — persistence result contract, memoryOnly vs
  clearFailed, sign-out lifecycle phases, cleanup registration.
- `core/storage/index.ts`, `core/auth/sign-out.ts`, `core/auth/context.tsx`,
  `core/auth/types.ts` — storage/cleanup/identity APIs as read directly.
- `tools/generator/templates/store/*.ejs` — the store template's persistence
  status, factory pattern, and clear-with-fallback contract.
- `components/ui/adaptive-sheet.tsx` — the adaptive surface primitive, read
  directly.
- Baseline `pnpm verify` PASS on the clean tree (this session; `db:verify`
  SKIPs in this sandbox — PostgreSQL unavailable — and CI provides it).
