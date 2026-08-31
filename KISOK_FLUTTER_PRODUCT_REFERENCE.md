# KISOK Flutter Product & Behavior Reference

> **Purpose:** Product/behavior reference for the React Native/Expo rebuild and for the agent that will prepare the Golden `main` foundation.
>
> **This document is NOT a request to port Flutter code line-for-line or reproduce the Flutter UI pixel-for-pixel.**
> The Flutter application is the reference for product scope, user journeys, safety invariants, operational behavior, edge cases, and useful UX ideas. The React Native implementation should improve the experience where appropriate while preserving the business and reliability guarantees documented here.

---

## 1. Source of Truth and Precedence

### Flutter behavior reference
Repository:

- `mohammed7779948484-tech/kisok_flutter`
- Reference branch: `feature/customer-experience-redesign`
- Reference commit: `88d36ff913e1249cb6b863432f28ccde35896421`
- Commit intent: customer-experience redesign + checkout hardening.

This branch is used because it contains the newest customer UX and the strongest checkout/recovery behavior currently present in the Flutter application.

### React/Supabase data-contract reference
Repository:

- `mohammed7779948484-tech/Kisok_react_app`
- Reference branch: `main`
- Reference commit inspected: `78e3255bc5daef4a8066bdf8c2ec2e82546a444e`
- Database migrations live under `supabase/migrations/`.

### Precedence rule

When sources disagree:

1. **React repository Lean V2 Supabase migrations** are authoritative for the new data model, database contracts, roles, RLS, RPC inputs/outputs, and Realtime exposure.
2. **Actual Flutter code on the reference commit** is authoritative for currently implemented product behavior and UX.
3. The current Flutter customer-redesign plan is a rich product/UX reference.
4. Older Flutter context documents are background only if they conflict with current code.
5. The new React implementation is allowed and encouraged to improve UX/UI rather than cloning Flutter.

A known documentation drift exists: older Flutter product documentation says customer order tracking is out of scope, but the reference Flutter branch contains a real Track Order route, screen, controller, privacy timeout, and Realtime behavior. Treat the actual code as the source of truth for the existing Flutter experience.

---

# 2. Product Definition

KISOK is a **private in-store catalog and ordering application** running on store-owned tablets. It is not a public shopping application.

The application has two operational experiences in the same client:

1. **Customer / Kiosk**
   - A store-managed customer account is already signed in or manually signed in.
   - A customer physically inside the store browses the catalog.
   - The customer selects a product variant/options and quantity.
   - The customer manages a local cart.
   - The customer reviews and submits one order.
   - After a confirmed order, the kiosk safely resets for the next customer.

2. **Preparation**
   - A store employee uses a preparation account.
   - The employee receives active orders.
   - The employee starts preparation, marks assigned orders ready, or cancels eligible orders.
   - The employee can inspect order details and terminal history.

There is a third database role, **Admin**, but admin management belongs to the separate web admin application, not this React Native kiosk application.

---

# 3. Non-Goals / Hard Product Boundaries

Do not silently introduce any of these into the mobile/tablet application:

- No prices.
- No cart subtotal/total price.
- No payments or payment methods.
- No checkout charging.
- No delivery.
- No shipping.
- No public outside-store ordering.
- No public customer registration.
- No public signup/onboarding.
- No social login.
- No user creation from the tablet client.
- No general customer account/profile management.
- No catalog mutation from the customer/preparation tablet.
- No Supabase service-role key in the client.
- No Cloudinary API secret in the client.
- Exact stock quantity is **not** a forbidden product concept in the React rebuild. It may be shown when the product UX benefits from it and a secure backend contract exposes it. The current Lean V2 customer catalog snapshot only exposes boolean `is_available`, so do not bypass RLS or invent an unsafe client read merely to show quantity.
- No client-side security decisions as a substitute for database authorization.
- No duplicate order submission because of network ambiguity/retry.
- No generic Flutter-style `Flavor` database assumption in the React rebuild; the Lean V2 database uses generic variants and option types/values.

---

# 4. Roles and Startup User Stories

## 4.1 Session restoration

**As a store user,**
I want the app to restore the current Supabase session on startup,
so I do not need to sign in every time the tablet restarts.

Expected behavior:

- Startup begins in a dedicated resolving state.
- The app restores/checks the Supabase session.
- The app resolves the active profile.
- Loading should be clear and accessible.
- Startup failure provides a safe retry instead of silently falling into a broken screen.

Flutter currently presents:
- “Validating session”
- “Preparing the application…”
- retry if session verification fails.

## 4.2 No valid session

**As a store operator,**
when no valid session exists,
I need a simple sign-in screen for a manually provisioned store account.

Expected behavior:

- Email + password.
- Password visibility toggle.
- Submit disabled while request is running.
- Error/notice appears accessibly.
- Responsive layout.
- No signup or public onboarding links.

## 4.3 Active Customer profile

**As a customer kiosk session,**
after authentication I should land only in the Customer experience.

Flutter route root:
`/customer/catalog`

## 4.4 Active Preparation profile

**As a preparation employee,**
after authentication I should land only in the Preparation workspace.

Flutter route root:
`/preparation/orders`

## 4.5 Inactive/missing/unsupported profile

The client must not grant operational access.

- Missing/inactive profile must be rejected.
- Admin is not a mobile/tablet experience.
- Client routing is UX protection only.
- Supabase RLS/RPC authorization remains authoritative.

---

# 5. Complete Flutter Screen / Route Inventory

## Shared

| Experience | Flutter route | Screen |
|---|---|---|
| Startup | `/startup` | Startup/session restoration |
| Auth | `/login` | Store account sign-in |

## Customer / Kiosk

| Flutter route | Screen / Surface | Purpose |
|---|---|---|
| `/customer/catalog` | Catalog Home | Main discovery/home |
| `/customer/products` | All Products | Full product discovery |
| `/customer/brands` | All Brands | Brand discovery |
| `/customer/brands/:brandId` | Brand Detail / Products | Products scoped to a brand |
| `/customer/categories` | All Categories | Category discovery |
| `/customer/categories/:categoryId` | Category Detail / Products | Subcategories + brand filter + products |
| `/customer/search` | Search | Find catalog items |
| `/customer/products/:productId` | Product Detail | Variant/options + quantity + add to cart |
| overlay / adaptive surface | Cart Sheet | Quick cart after add/tap cart |
| `/customer/cart` | Full Cart | Complete cart management |
| `/customer/review` | Order Review | Final reconciliation + submission |
| `/customer/success/:orderId` | Order Success | Confirmation + safe reset |
| `/customer/track-order` | Track Order | Customer-facing order status lookup |
| `/customer/maintenance` | Hidden Maintenance | Employee diagnostics/reset/logout |

## Preparation

| Flutter route | Screen | Purpose |
|---|---|---|
| `/preparation/orders` | Preparation Workspace | New / Preparing / Ready board |
| `/preparation/orders/:orderId` | Order Details | Inspect one order + allowed actions |
| `/preparation/history` | Order History | Completed / Cancelled for store day |

---

# 6. Customer Shell and Navigation

The customer experience currently uses a persistent store identity and catalog navigation.

## Medium / expanded behavior

Primary root destinations:

- Home
- Products
- Brands
- Categories
- Track Order

Always-prominent actions:

- Search
- Cart with total-quantity badge

Store identity:

- Shows logo + store name.
- Tap returns Home.
- Long press opens an employee-maintenance confirmation.
- Maintenance is intentionally hidden from normal customer navigation.

Navigation behavior:

- Current root destination has a selected state.
- Tapping the already-active root should not create duplicate navigation history.
- Root destinations behave like branch/root navigation.
- Product Detail and transactional/detail flows behave like pushed detail routes.
- Back from Product Detail should preserve the originating catalog/grid context and scroll state where practical.

## Compact behavior

- Keep store identity visible.
- Keep Search directly available.
- Keep Cart directly available.
- Root catalog destinations may move into a touch-friendly menu.
- Active destination remains clearly indicated.
- Do not rely on hover.

## React direction

Do not mechanically reproduce the Flutter top bar. Preserve the information architecture and ergonomic goals, but design the best tablet-first Expo Router shell for React Native/Web.

---

# 7. Cross-Screen Customer UX Acceptance Baseline

Every customer-facing feature should consider, where applicable:

- Clear page hierarchy.
- Loading state or matching skeleton.
- Empty state.
- Safe error state.
- Retry action.
- Tablet portrait behavior.
- Tablet landscape behavior.
- Narrower web/dev-preview behavior.
- Safe-area behavior.
- Increased text-size / text-scale resilience.
- Accessibility labels/roles.
- Logical keyboard/focus traversal on web where relevant.
- Minimum practical touch targets (Flutter redesign targeted ~48 logical px minimum).
- Visible pressed state.
- Visible selected state.
- Disabled state.
- Focus state where relevant.
- Reduced-motion behavior.
- No price or financial UI.
- No essential action that depends on hover.
- No uncontrolled animation loops.
- Images should have graceful placeholder/error behavior.

These are quality requirements, not requirements to copy Flutter widgets.

---

# 8. Catalog Home User Stories

## Main customer story

**As a customer,**
I want to understand the store and discover products quickly,
without needing an employee to explain the catalog verbally.

Flutter Home currently includes, in order:

1. Hero
2. Curated Brands
3. Shop by Category
4. Featured Products
5. Track Your Order teaser

### Hero

Currently communicates store identity and provides:
- Browse Products
- Browse Categories

React may redesign the hero substantially if it improves tablet UX.

### Brands section

- Shows brand image/logo with fallback.
- Shows name.
- Supports opening brand detail.
- Empty state if no brands are available.

### Category section

- Image-oriented category discovery.
- Supports opening category detail.
- Empty state.

### Featured Products

- Uses shared Product Card.
- Responsive grid.
- Opens Product Detail.

### Tracking teaser

- Direct entry into Track Order.

### Data direction in Lean V2

The new backend intentionally provides `get_customer_catalog()` as one customer-safe catalog snapshot. Home/search/brand/category/detail projections can be derived locally from that snapshot unless real scale/profiling later proves another contract is needed.

Do **not** automatically recreate the older planned RPC family (`get_customer_catalog_home`, paginated list RPCs, product-detail RPC, search RPC) just because the Flutter redesign plan once proposed them. Lean V2 deliberately simplified this.

---

# 9. All Products

**As a customer,**
I want one place to browse every visible orderable product.

Useful Flutter behavior:

- Header with product count.
- Responsive product grid.
- Loading skeleton.
- Empty catalog state.
- Retryable error.
- Pull-to-refresh.
- Long list support.
- Append/loading state.
- Back-to-top after meaningful scrolling.
- Scroll preservation after opening and returning from Product Detail.

### React/Lean V2 note

Flutter branch has pagination code from an older data-contract direction. Lean V2 now returns a complete customer snapshot. Do not preserve pagination architecture automatically. Choose local filtering/virtualization appropriate to real catalog size first; add server pagination only when justified.

---

# 10. Brands

## All Brands

**As a customer,**
I want to browse by brand.

Flutter behavior:

- Responsive brand grid.
- Image/logo and fallback.
- Brand name.
- Product count.
- Whole-card touch target.
- Loading/empty/error/refresh states.

## Brand Detail

**As a customer,**
after choosing a brand I want to see products from that brand and retain context.

Flutter behavior:

- Back/context link to All Brands.
- Brand heading.
- Product count.
- Product grid.
- Normal catalog loading/error/empty behavior.

### React/Lean V2

Brand scoping should normally be a projection/filter over the Lean V2 catalog snapshot.

---

# 11. Categories

## All Categories

**As a customer,**
I want to browse product groups visually.

Flutter behavior:

- Responsive image-card grid.
- Category image or fallback.
- Whole-card touch target.
- Loading/empty/error/refresh.

## Category Detail

**As a customer,**
I want to explore a category, optional subcategories, and optionally narrow it by brand.

Flutter behavior:

1. Route/breadcrumb context.
2. Category heading and count.
3. Direct child subcategories if any.
4. Brand filter.
5. Product results.

Important interaction rule:

- Brand filter defaults to **All Brands**.
- The user should see products immediately.
- Do not force a brand selection before showing results.
- Selected filter is obvious.
- Subcategory cards are touch friendly.
- Parent category logic may include direct-child category products.

### Lean V2 category model

Lean V2 limits category hierarchy to two levels.
`product_categories` is many-to-many.
There is no “primary category” and no category-specific product rank.

---

# 12. Search

**As a customer,**
I want to find relevant products quickly by typing normal catalog terms.

Flutter behavior:

- Search field autofocuses on entry.
- Clear action.
- Minimum query threshold in current UI: 2 characters.
- State machine:
  - idle
  - too-short
  - loading
  - error
  - no matches
  - results
- Results use shared Product Card and open Product Detail.
- Flutter text says search across Products, Brands, Categories and Flavors.

### React/Lean V2 translation

“Flavor” is not a fixed schema concept anymore.
Search should consider the new generic model:
- product name
- product keywords
- brand
- category
- variant title override/SKU/barcode only if appropriate for customer UX
- option type/value labels where useful

Since `get_customer_catalog()` returns the data required for customer discovery, local search is a valid default.

Use debouncing only when it improves behavior; local in-memory search may not need network debouncing.

---

# 13. Product Detail

**As a customer,**
I want to inspect a product, understand available choices, choose the correct variant/options, select quantity, and add it to my cart.

Flutter behavior worth preserving conceptually:

- Loading skeleton.
- Retryable error.
- Pull/refresh.
- Responsive compact stacked layout vs larger two-column layout.
- Main product/variant image.
- Variant/choice thumbnails when available.
- Brand.
- Product name.
- Availability.
- Category context.
- Product description.
- Choice selector.
- Quantity stepper.
- Clear Add to Cart action.
- Unavailable choices cannot be selected as orderable.
- Add to Cart gives immediate cart feedback.
- Added cart line is revealed/highlighted.

Flutter quantity range:
- minimum 1
- maximum 99

The React team may revisit the UI limit if product requirements change, but the server accepts positive integer quantities and remains authoritative.

## Critical terminology translation

Flutter legacy code frequently uses:

- `Flavor`
- `flavorId`
- `flavorName`

The Lean V2 database uses:

- `product_variants`
- `variant_id`
- generic `option_types`
- generic `option_values`
- `variant_option_values`
- optional `title_override`

React **must not hardcode “flavor” as the architecture**.
A display name for a variant may be produced from `title_override` or ordered option values.

---

# 14. Adaptive Cart Sheet

This is a non-route customer surface that gives immediate access to the cart.

**As a customer,**
after adding an item or tapping Cart,
I want to inspect/change my cart without always leaving the current shopping context.

Flutter adaptive behavior:

- Expanded layout: right-side cart panel/dialog.
- Smaller layout: modal bottom sheet.
- Newly added line may be automatically scrolled into view and highlighted.
- Shows total quantity.
- Shows product/variant line items.
- Quantity control.
- Remove.
- Per-line pending state.
- Continue Shopping.
- View Full Cart.
- Empty state.
- Persistence warning if the in-memory cart update succeeded but durable storage failed.

Interaction is blocked when cart mutations/checkout reset safety locks require it.

### React direction

React Native Reusables or another approved design-system primitive can provide Drawer/Sheet/Dialog mechanics. Preserve the adaptive behavior goal, not the exact Flutter implementation.

---

# 15. Cart State and Persistence Invariants

The cart is **non-authoritative local client state**.

Important Flutter behavior:

- Cart is scoped to the active Customer profile.
- Restored from local persistence.
- Add/change/remove mutate local state.
- Persistence writes are serialized.
- A persistence failure does not pretend success was durable.
- The UI can distinguish:
  - persisted
  - memory-only
  - rejected
- Cart interaction can be locked during critical operations.
- Cart is not a server-side cart.
- Different variants/options are distinct lines.
- Same selection can merge according to the cart model.

### React recommendation for behavior

Use the chosen client-state/persistence standard (likely Zustand + an approved storage adapter), but keep these semantics:
- local cart
- explicit persistence failure state
- no second independent cart model
- checkout can lock cart mutations
- customer/session ownership is respected

---

# 16. Full Cart and Reconciliation

**As a customer,**
before review I want the app to verify that my saved cart still represents currently orderable items.

Flutter full-cart behavior:

- Restore loading/error.
- Empty state with Browse Products.
- Responsive list + summary.
- Each line shows image, product, selected option/variant, quantity.
- Availability is rechecked before review.
- If a line is no longer valid, user receives explicit correction choices.
- No silent deletion.
- No silent quantity reduction.

Flutter correction choices include:
- Set to Available quantity when a correction quantity is known.
- Remove.
- Retry availability check.

The Review action remains disabled when:
- reconciliation is loading
- reconciliation failed
- corrections remain
- critical cart interaction is locked

Before entering Review, Flutter rechecks and verifies that the cart did not change during reconciliation.

## Important Lean V2 difference

The new Lean V2 database currently has:
- **no reconciliation RPC**
- server `create_order()` remains the final transaction/stock defense
- the current customer catalog snapshot exposes only `is_available`, not exact stock quantity

This does **not** mean exact stock must remain hidden forever. If the React product design later benefits from showing stock quantity, design an intentional secure backend contract rather than bypassing RLS or coupling the customer UI directly to privileged inventory access.

Therefore the React foundation must **not invent an exact-quantity customer reconciliation contract**.

Possible future product decision:
- rely on current boolean availability during shopping and handle exact quantity conflicts from `create_order()`
- or add a dedicated secure customer-safe reconciliation RPC later if explicit pre-review correction remains a product requirement

This is a product/backend contract decision, not something a feature agent should invent on its own.

---

# 17. Order Review

**As a customer,**
I want a final clear confirmation screen before sending the order.

Flutter behavior:

- Current cart must still match validation/reconciliation context.
- Shows item snapshots and quantities.
- Shows total quantity and distinct item count.
- Back to Cart.
- Confirm Order.
- Submission blocks duplicate interactions/back navigation.
- Visual submitting overlay.
- Stock conflict panel.
- Unknown-result panel.
- Failed-result panel.
- Unknown state changes CTA semantics to retry safely.

Do not add prices.

---

# 18. Checkout Reliability — MUST PRESERVE

This is one of the most important behavioral areas in the entire Flutter application.

The React implementation may use different libraries/state-management code, but it must preserve the reliability model.

## State model

Flutter has explicit conceptual states:

- Idle
- Submitting
- Stock Conflict
- Unknown / Ambiguous Result
- Failed
- Succeeded

Avoid reducing this to only `isLoading` + `error`.

## Idempotent attempt

Before sending an order:

1. Build normalized order lines.
2. Compute/associate the request fingerprint.
3. Create/reuse a `client_request_id`.
4. Persist unresolved checkout metadata locally.
5. Call the backend.

## Duplicate protection

- Ignore duplicate submit presses while one submission is already in flight.
- If a request result is ambiguous, a retry must use the **same** idempotency identity for the same cart/fingerprint.
- Never generate a fresh order request merely because the network response was lost.

## Success

Before clearing the cart:

- Capture an immutable success payload/snapshot for the success screen.
- Mark the local attempt confirmed safely.
- Clear cart only after server success is known.
- Clean up pending attempt metadata safely.
- If local cleanup persistence fails, do not lose the fact that the server order was already confirmed.

## Stock conflict

- Keep the cart.
- Surface affected variants.
- Let customer explicitly correct/remove.
- Do not create an order.

## Unknown result

This is not the same as failure.

Examples:
- request may have reached Supabase but response was lost
- network died after commit

Required behavior:
- preserve the pending attempt
- preserve request fingerprint/client request id
- lock unsafe cart/reset behavior
- allow safe recovery/retry
- do not create a second order

## Lean V2 `create_order()` guarantees

The new database contract is stronger and generic:

Input:
- `client_request_id: uuid`
- `items: jsonb`
- every item must contain exactly:
  - `variant_id`
  - `quantity`

Server behavior:
- active Customer role required
- request validation
- duplicate variant rejection
- deterministic request fingerprint
- advisory lock by request ID
- idempotent replay of same request
- conflicting reuse of same request ID rejected
- active catalog/variant validation
- deterministic inventory row locking
- stock conflict response with requested and available quantity
- immutable order item snapshots
- atomic inventory deduction
- inventory adjustment ledger
- success returns order ID, display number, created time

The React checkout feature must call this contract rather than reimplementing server transaction logic.

---

# 19. Order Success / Next Customer

**As the current customer,**
after confirmed submission I need clear proof that the order exists.

**As the store,**
the shared kiosk must safely reset for the next customer.

Flutter behavior:

- Strong confirmed state.
- Displays submitted item snapshots.
- Uses immutable success payload captured before cart clear.
- Shows order reference/display number.
- Current Flutter intentionally requires “Tap to Reveal Order Number”.
- Track Order action.
- Next Customer action.
- Automatic inactivity countdown.
- Default is 25 seconds.
- Uses `store_settings.customer_success_reset_seconds` when available.
- User interaction restarts countdown.
- App resume recomputes countdown from a deadline rather than trusting a paused tick counter.
- Safe reset must succeed before returning to Home.
- If unresolved checkout recovery blocks reset, the screen does not discard it.
- Direct/stale success route without the immutable payload warns the user **not to resubmit an old cart**.

### React freedom

The reveal interaction and exact presentation may be redesigned if a better premium kiosk UX exists, as long as:
- order reference is clear
- privacy/shared-kiosk considerations are handled
- reset is safe
- ambiguous checkout cannot cause duplicate submission

---

# 20. Hidden Maintenance

Maintenance is intentionally an employee-oriented escape hatch and diagnostic surface, not normal customer navigation.

Flutter entry:
1. deliberate long press on store identity/logo
2. explicit employee confirmation

This barrier prevents accidental customer entry but is **not a security boundary**.

Useful current contents:

- app version
- safe environment label
- internet connectivity
- current auth/session reachability
- catalog reachability
- Refresh Catalog
- Reset Kiosk
- Sign Out

Must never show:
- Supabase service-role key
- auth tokens
- database passwords
- Cloudinary secret
- sensitive diagnostics

## Safe reset/logout invariant

Reset/Sign Out must first resolve pending checkout state.

If the previous request outcome is still ambiguous:
- do not wipe the cart
- do not wipe idempotency/request metadata
- do not start a fresh order
- block reset until safe recovery succeeds

When safe:
- clear ordinary customer cart state
- clear stale tracking/search state
- refresh/invalidate catalog state
- optionally sign out
- return to customer Home only when appropriate

---

# 21. Customer Order Tracking

Customer Track Order exists in the reference Flutter branch.

## User story

**As a customer,**
after receiving an order number I want to see whether the order was received, is being prepared, is ready, completed, or cancelled.

Flutter input behavior:

- 6-character order number.
- Uppercase normalization.
- Allowed alphabet avoids ambiguous characters.
- Clear action.
- Track button.
- Seedable from Order Success.
- Invalid format gives explicit error.

Flutter states:

- idle
- loading
- not found
- error
- data

Tracked result includes:
- display number
- created time
- current status
- submitted items
- images when available
- quantity
- timeline

Flutter timeline does **not** fabricate intermediate timestamps it does not have.
It has real:
- created timestamp
- completed timestamp when completed
- cancelled timestamp when cancelled

## Privacy behavior

Flutter tracking controller:
- clears tracking state after ~2 minutes of inactivity
- refreshes inactivity timer on interaction
- disposes subscription when cleared/disposed
- refreshes on app resume
- Realtime is an invalidation/refresh signal, not source of truth
- coalesces refresh signals while refresh is in flight

## Critical Lean V2 contract gap

At the inspected React `main` commit:

- customer does **not** have direct `orders`/`order_items` SELECT policies
- `orders` Realtime is explicitly intended for Preparation
- there is no `get_customer_order_tracking()` RPC in the Lean V2 migrations

Therefore:
- Do **not** implement customer tracking by bypassing RLS.
- Do **not** grant broad customer order-table SELECT simply to reproduce Flutter.
- Do **not** invent a security-definer function casually.
- Treat customer tracking as an existing product experience whose secure Lean V2 backend contract is currently unresolved.
- The foundation may reserve architecture/UI capability for it, but the actual feature must be implemented only after a deliberate secure backend design decision.

---

# 22. Preparation Workspace

## User story

**As a preparation employee,**
I want an operational board showing active orders grouped by their current state.

Active statuses:
- New
- Preparing
- Ready

### Expanded layout

Flutter presents 3 simultaneous columns:
- New
- Preparing
- Ready

Each column shows count and order cards.

### Compact / medium layout

Flutter uses tabs:
- New
- Preparing
- Ready

### States

- Loading skeleton.
- Empty board.
- Error + retry.
- Manual refresh.
- Interactions blocked while a status mutation is being processed.

### Order card

Useful information includes:
- large order display number
- created time
- item summary
- assignment/status
- next allowed actions
- opens Order Details

### React UX freedom

The React version may use a better tablet operations-board design if usability improves, while keeping the three operational statuses and fast actionability.

---

# 23. Preparation Order Actions

The Flutter UI availability policy mirrors the backend but does not replace it.

### New order

If unassigned:
- Start preparing

Eligible New orders:
- Cancel

### Preparing order

If assigned to current preparation employee:
- Mark ready

Eligible Preparing orders:
- Cancel

### Ready

Preparation has no further transition.

### Completed / Cancelled

No preparation mutation.

## Lean V2 authoritative RPC

`update_order_status(order_id, target_status, reason)`

Server rules include:

- active Admin or Preparation required
- final orders cannot transition
- Preparation:
  - New → Preparing
  - Preparing → Ready only by the assigned preparation employee
  - Cancel only New or Preparing
- Admin:
  - Ready → Completed
  - may cancel non-final orders under server rules
- cancellation restores inventory exactly once using ledger constraints
- server row locking/concurrency checks are authoritative

UI should show only actions likely to succeed, but backend remains the final authority.

---

# 24. Preparation Order Details

**As a preparation employee,**
I want to inspect one order clearly before acting.

Flutter displays:

- large display number
- status badge
- submitted time in store timezone
- assignment context
- available actions
- item list
- quantity prominently
- product snapshot
- legacy flavor/variant snapshot
- brand snapshot

If the order disappears from the current workspace:
- show “Order unavailable” instead of stale content.

### React / Lean V2

Use immutable `order_items` snapshot fields:
- product name
- variant name
- variant SKU
- variant options JSON
- brand name
- image
- quantity

Do not reconstruct historical order labels from current catalog rows when immutable snapshots exist.

---

# 25. Preparation History

**As a preparation employee,**
I want to inspect terminal orders for the current store day.

Flutter groups:
- Completed
- Cancelled

Important:
- Store-day formatting uses configured `store_settings.store_timezone`.
- Database timestamps remain UTC.
- History is read-only.
- Empty state per terminal section/day.
- Order cards can open details.

---

# 26. Realtime Semantics

## Flutter principle

Realtime is a **refresh/invalidation signal**, not a second source of truth.

Expected architecture:

1. receive event
2. invalidate/refetch authoritative query
3. UI renders authoritative read result

Do not maintain an independent Realtime copy of the same order state unless there is a deliberate reason.

## Lean V2 current reality

Migration explicitly adds:
`public.orders` to `supabase_realtime`

Current migration comments state:
- only Preparation needs live operational updates
- customer catalog is a snapshot
- no catalog publication/touch triggers

The React foundation should wire reusable Realtime/query invalidation patterns, but actual subscriptions should be feature-owned.

---

# 27. Lean V2 Database Model for the React Rebuild

The React repository migrations define the new schema.

## Roles

`app_role`:
- `admin`
- `preparation`
- `customer`

## Order statuses

- `new`
- `preparing`
- `ready`
- `completed`
- `cancelled`

## Public tables

1. `profiles`
2. `store_settings`
3. `media_assets`
4. `brands`
5. `categories`
6. `products`
7. `product_categories`
8. `option_types`
9. `option_values`
10. `product_variants`
11. `variant_option_values`
12. `product_variant_media`
13. `inventory`
14. `inventory_adjustments`
15. `orders`
16. `order_items`

## Identity/settings

`profiles`
- id → auth.users
- display_name
- role
- is_active
- email

`store_settings`
- singleton
- store_name
- logo_media_asset_id
- global_low_stock_threshold
- customer_success_reset_seconds
- store_timezone

`media_assets`
- public_id
- secure_url
- asset metadata
- Cloudinary-style delivery information

## Catalog

`brands`
`categories`
`products`
`product_categories`
`option_types`
`option_values`
`product_variants`
`variant_option_values`
`product_variant_media`

Key concepts:

- Generic product variants.
- Generic option types and values.
- A variant can have one selected value for each option type.
- Categories have max two levels.
- Products can belong to multiple categories.
- Products can be featured.
- Product and variant visibility is controlled with `is_active`.
- Variant availability ultimately comes from inventory.

## Inventory

`inventory`
- one row per variant
- nonnegative current quantity

`inventory_adjustments`
- ledger of stock changes
- before/after quantity coherence
- adjustment type
- actor
- optional linked order

## Orders

`orders`
- unique UUID id
- 6-character display number
- unique client_request_id
- request fingerprint
- status
- created_by
- assigned_preparation_id
- completed/cancelled audit fields

`order_items`
- immutable after creation
- product/variant snapshots
- option snapshot JSON
- brand snapshot
- image snapshot
- quantity
- unique order+variant

---

# 28. Lean V2 RPC / Access Contracts Relevant to Mobile

## `current_active_profile()`

Purpose:
- startup identity/profile projection

Returns:
- id
- display_name
- role
- is_active

## `get_customer_catalog()`

Purpose:
- one customer-safe snapshot

Requires:
- authenticated active Customer profile

Payload includes:
- schema version `kiosk.catalog.lean.v1`
- store settings
- brands
- categories
- products
- product-category relations
- option types
- option values
- variants
- variant-option relationships
- variant media

Security/visibility:
- only active valid catalog entities
- customer gets no raw catalog-table SELECT policies
- variant exposes boolean `is_available`
- current snapshot does not include exact inventory count; this is a current contract fact, not a permanent UX prohibition

## `create_order(client_request_id, items)`

Atomic customer order submission described in Checkout section.

## `update_order_status(order_id, target_status, reason)`

Controlled Preparation/Admin order mutation described in Preparation section.

---

# 29. RLS / Security Facts the React Client Must Respect

Lean V2 enables RLS on all 16 public tables.

Key mobile consequences:

### Customer

- no raw `profiles` table access
- profile via `current_active_profile()`
- no raw catalog-table access
- catalog via `get_customer_catalog()`
- no direct customer order-table SELECT in current schema
- order creation via `create_order()`

### Preparation

- can read operational `orders`
- can read `order_items`
- mutations remain RPC-only
- receives Realtime on `orders`

### Admin

Admin browser/web behavior belongs to separate management app.

### Client secret policy

React Native/Web client may contain:
- Supabase project URL
- Supabase publishable key

Never contain:
- service role
- database password
- server-side secrets
- Cloudinary secret

---

# 30. Old Flutter Model → New React Lean V2 Translation

| Flutter concept | React/Lean V2 direction |
|---|---|
| `Flavor` | `ProductVariant` with generic option values |
| `flavorId` | `variantId` |
| `flavorName` | derived/stored variant display label |
| Flavor image | variant media, with product cover fallback |
| Flavor availability | variant `is_available` |
| old flavor search terms | variant/options/search keywords |
| customer catalog repository RPC family | default to one `get_customer_catalog()` snapshot |
| `create_order` old flavor item | `{ variant_id, quantity }` |
| order item flavor snapshot | `variant_name` + `variant_options` |
| exact cart reconciliation RPC | not present in Lean V2; do not invent automatically |

Do not carry obsolete Flutter database abstractions into the new React architecture.

---

# 31. UX That May Be Improved Instead of Cloned

The React rebuild should use the Flutter app as product behavior reference, but is explicitly free to improve:

- customer navigation arrangement
- Home composition
- visual hierarchy
- density
- tablet landscape use
- cards
- responsive breakpoints
- transitions
- cart Sheet/Drawer presentation
- search interactions
- category/brand discovery
- Product Detail layout
- option/variant selector
- success screen
- order status visualization
- preparation board/card design
- history layout
- maintenance UX
- loading/skeleton design
- empty/error patterns

The target should feel **premium, intentional, tablet-first, touch-first, fast, and consistent**.

Do not preserve a Flutter interaction simply because it exists if a better React Native/Expo implementation can meet the same user need more clearly.

---

# 32. Behavior That Should NOT Be Casually Changed

Treat these as invariants unless the product owner explicitly changes them:

- no prices/payments
- role-gated customer/preparation experiences
- customer catalog visibility enforced by backend
- stock presentation is a product/UX decision; use only data exposed by an intentional secure backend contract
- local cart
- safe cart persistence semantics
- server-authoritative inventory/order creation
- idempotent checkout
- unknown checkout result is not treated as ordinary failure
- unresolved checkout metadata survives until safe resolution
- cart clears only after confirmed success
- immutable success/order item snapshots
- stock conflict does not silently mutate cart
- reset/sign-out cannot create duplicate-order risk
- Realtime is invalidation/refetch signal
- preparation assignment/status rules enforced server-side
- store timezone used for human operational day/time
- no client secrets
- RLS/RPC security is authoritative

---

# 33. Recommended Feature Boundaries for the React App

This section is a product-oriented suggestion to help later architecture work. The foundation agent may refine names after researching best practices.

Likely feature slices:

- `auth`
- `catalog`
- `cart`
- `checkout`
- `orders` / customer tracking
- `preparation`
- `maintenance`

Potential shared business/domain concepts:

- profile role
- order status
- order snapshots
- product/variant display types where genuinely cross-feature

Do not create premature global abstractions for every table.

---

# 34. Suggested Future Agent User Stories

These are useful for feature TODO generation.

## Auth

- Restore session.
- Resolve active profile.
- Route correct role.
- Sign in.
- Handle inactive/missing/unauthorized role.
- Sign out safely.

## Catalog

- Load one customer-safe snapshot.
- Validate/map payload.
- Home discovery.
- Browse all products.
- Browse brands.
- Browse categories/subcategories.
- Local search.
- Product detail.
- Variant/options selection.
- Availability handling.
- Refresh/recovery.

## Cart

- Restore profile-scoped cart.
- Add variant.
- Merge or separate lines correctly.
- Change quantity.
- Remove.
- Persistence warning.
- Adaptive cart surface.
- Full cart.

## Checkout

- Review.
- Create/persist idempotency attempt.
- Submit.
- Handle success.
- Handle stock conflict.
- Handle unknown response.
- Retry safely.
- Capture immutable success payload.
- Clean up cart/attempt only when safe.
- Cooperate with reset/sign-out gate.

## Success

- Show confirmation.
- Show reference.
- Show submitted item snapshots.
- Optional tracking entry.
- inactivity countdown.
- safe Next Customer reset.

## Tracking

- **Blocked pending secure Lean V2 contract decision.**
- once contract exists: validate display number, privacy timeout, query status, invalidate/refetch on safe signal, clear shared-kiosk data.

## Preparation

- Load active orders/items.
- Group New/Preparing/Ready.
- Realtime invalidation.
- Start Preparing.
- Mark Ready only for assigned employee.
- Cancel eligible order.
- Order details.
- Store-day terminal history.
- Concurrency/stale-state recovery.

## Maintenance

- hidden employee entry
- diagnostics
- refresh catalog
- safe reset
- safe sign out

---

# 35. Feature Acceptance Checklist for Future Agents

Every generated feature TODO should select applicable items rather than blindly requiring all of them.

### Product
- [ ] user story is explicit
- [ ] role/access is explicit
- [ ] happy path implemented
- [ ] empty state considered
- [ ] error state considered
- [ ] retry/recovery considered
- [ ] offline/network change considered if relevant
- [ ] app resume/reconnect considered if relevant
- [ ] no forbidden scope introduced

### Architecture
- [ ] feature owns its feature-specific API/state/UI
- [ ] no business logic in Expo Router file
- [ ] no direct Supabase call from screen
- [ ] no unnecessary global registry/barrel
- [ ] no unrelated `core`/design-system change
- [ ] cross-feature import uses approved public API
- [ ] server state and client state use the agreed foundation patterns

### Supabase
- [ ] current migration contract read first
- [ ] generated DB types used
- [ ] RLS assumptions verified
- [ ] publishable key only in public client
- [ ] RPC input/output validated where needed
- [ ] Realtime used as signal, not duplicate truth
- [ ] no invented database contract

### UI / UX
- [ ] uses design-system components
- [ ] uses tokens, not arbitrary styling
- [ ] tablet portrait checked
- [ ] tablet landscape checked
- [ ] web preview checked
- [ ] touch targets adequate
- [ ] text scaling considered
- [ ] focus/accessibility semantics considered
- [ ] loading/empty/error patterns consistent
- [ ] motion is restrained and reduced-motion safe where relevant

### Reliability
- [ ] duplicate action prevention
- [ ] concurrent/stale state considered
- [ ] destructive action confirmation where needed
- [ ] persistence failure considered when local durable state is used
- [ ] checkout-specific recovery invariants preserved when applicable

### Testing / Verification
- [ ] typecheck
- [ ] lint
- [ ] unit tests for domain/state logic
- [ ] component tests for meaningful interaction
- [ ] web preview
- [ ] Android/dev-build verification where native behavior matters
- [ ] agent updates feature TODO as tasks complete
- [ ] no TODO marked done without evidence

---

# 36. Important Guidance for the Golden `main` Foundation Agent

The foundation agent should use this document to understand **what will eventually be built**, so it can prepare shared capabilities and generators intelligently.

It should NOT implement every feature now.

The goal of Golden `main` is to make later feature agents fast and consistent by prebuilding the common foundation:

- architecture boundaries
- design system
- React Native Reusables integration
- shared UI states/patterns
- responsive/tablet utilities
- Supabase client + generated types workflow
- auth/session foundation
- TanStack Query foundation
- local state/persistence standard
- error model
- logger
- network/lifecycle integration
- image abstraction
- test utilities
- CI/quality gates
- dev/UI lab
- architecture documentation
- AGENTS.md
- professional Ignite generators
- generated feature TODO templates
- embedded agent guidance/comments in generated files

When deciding what to place in shared/core/main, prefer capabilities that are genuinely common and stable. Do not build a speculative internal framework for every possible future use case.

---

# 37. Source File Index — Flutter

Reference:
`mohammed7779948484-tech/kisok_flutter@88d36ff913e1249cb6b863432f28ccde35896421`

Core product/routing:
- `context/project-overview.md`
- `plan/customer-experience-redesign-plan.md`
- `lib/src/routing/app_routes.dart`
- `lib/src/routing/app_router.dart`

Auth:
- `lib/src/features/auth/presentation/screens/startup_screen.dart`
- `lib/src/features/auth/presentation/screens/login_screen.dart`
- `lib/src/features/auth/state/startup_controller.dart`

Customer shell:
- `lib/src/core/widgets/customer_app_bar.dart`
- `lib/src/core/widgets/customer_scaffold.dart`
- `lib/src/features/catalog/presentation/widgets/customer_scaffold.dart`

Catalog:
- `lib/src/features/catalog/presentation/screens/catalog_home_screen.dart`
- `lib/src/features/catalog/presentation/screens/all_products_screen.dart`
- `lib/src/features/catalog/presentation/screens/brands_screen.dart`
- `lib/src/features/catalog/presentation/screens/brand_products_screen.dart`
- `lib/src/features/catalog/presentation/screens/categories_screen.dart`
- `lib/src/features/catalog/presentation/screens/category_products_screen.dart`
- `lib/src/features/catalog/presentation/screens/search_screen.dart`
- `lib/src/features/catalog/presentation/screens/product_detail_screen.dart`
- `lib/src/features/catalog/presentation/screens/scoped_product_list_body.dart`

Cart:
- `lib/src/features/cart/state/cart_controller.dart`
- `lib/src/features/cart/presentation/widgets/customer_cart_sheet.dart`
- `lib/src/features/cart/presentation/screens/cart_screen.dart`

Checkout / orders:
- `lib/src/features/orders/presentation/controllers/checkout_controller.dart`
- `lib/src/features/orders/presentation/screens/order_review_screen.dart`
- `lib/src/features/orders/presentation/screens/order_success_screen.dart`
- `lib/src/features/orders/presentation/screens/customer_order_tracking_screen.dart`
- `lib/src/features/orders/presentation/controllers/customer_order_tracking_controller.dart`

Maintenance:
- `lib/src/features/settings/presentation/screens/settings_screen.dart`
- `lib/src/features/settings/state/kiosk_reset_controller.dart`

Preparation:
- `lib/src/features/preparation/presentation/screens/preparation_workspace_screen.dart`
- `lib/src/features/preparation/presentation/screens/preparation_order_details_screen.dart`
- `lib/src/features/preparation/presentation/screens/preparation_history_screen.dart`
- `lib/src/features/preparation/presentation/widgets/preparation_order_actions.dart`
- `lib/src/features/preparation/models/preparation_order_action.dart`

---

# 38. Source File Index — React / Supabase Lean V2

Reference:
`mohammed7779948484-tech/Kisok_react_app@78e3255bc5daef4a8066bdf8c2ec2e82546a444e`

Current starter docs:
- `design.md`
- `todo.md`
- `IGNITE.md`
- `package.json`

Database:
- `supabase/migrations/20260826050001_lean_extensions_types_utilities.sql`
- `supabase/migrations/20260826050002_lean_identity_media_settings.sql`
- `supabase/migrations/20260826050003_lean_catalog_schema.sql`
- `supabase/migrations/20260826050004_lean_inventory_orders_schema.sql`
- `supabase/migrations/20260826050005_lean_identity_admin_functions.sql`
- `supabase/migrations/20260826050006_lean_customer_catalog.sql`
- `supabase/migrations/20260826050007_lean_create_order.sql`
- `supabase/migrations/20260826050008_lean_order_operations.sql`
- `supabase/migrations/20260826050009_lean_inventory_operations.sql`
- `supabase/migrations/20260826050010_lean_admin_utilities.sql`
- `supabase/migrations/20260826050011_lean_reorder.sql`
- `supabase/migrations/20260826050012_lean_realtime.sql`
- `supabase/migrations/20260826050013_lean_rls_grants.sql`

---

# 39. Final Interpretation

The React Native rebuild should be understood as:

> Preserve KISOK's product behavior and safety guarantees, adopt the Lean V2 Supabase model as the backend truth, and redesign the user experience for a premium tablet-first React Native/Expo application.

The Flutter project is a rich behavioral and product reference, not a technical architecture to copy.

The Golden `main` foundation should be built so that later independent coding agents can:
1. start from the same stable base,
2. run Ignite generators,
3. receive correct structure, imports, comments, and TODO guidance,
4. implement one vertical feature without inventing architecture,
5. touch as few shared files as possible,
6. verify their work through common tooling,
7. open a focused PR with minimal merge conflicts.
