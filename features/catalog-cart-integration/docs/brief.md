# CatalogCartIntegration — brief

**WHAT this feature is, and how we will know it is done.** No implementation
sequencing here; that belongs in `plan.md`.

Status: `READY` — every TODO replaced; the implementation-readiness signal
lives in `plan.md` (`DRAFT` → `READY`).

## Objective

A signed-in Customer browsing the real hosted Catalog can select an AVAILABLE
concrete variant on Product Detail, add it to the LOCAL Cart, immediately
inspect it in the Quick Cart sheet, return to browsing, reopen the Cart any
time through a persistent cart affordance with a live count badge, manage the
Full Cart at `/cart`, reload the app and find the cart retained locally for
the same profile, and sign out knowing the cart is cleared. The Cart stays
local device state — no server cart, no Cart table, no Cart RPC, no Cart
Realtime, no multi-device synchronization. This feature only closes the
deliberately deferred Catalog ↔ Cart seam that both merged features left
open; it is not a Catalog rewrite, not a Cart rewrite, not a customer shell
redesign, and not Checkout.

## User-visible behaviour

A customer signs in and browses the Catalog exactly as before — every merged
Catalog surface is unchanged in content and navigation. On Product Detail,
below the variant list, a primary **Add to cart** action appears: selecting
an AVAILABLE variant enables it; selecting an UNAVAILABLE variant keeps the
variant fully inspectable but disables Add (the honest availability wording
never changes). Pressing Add puts exactly one unit of that concrete selection
into the local cart and opens the Quick Cart sheet: the newly added line with
its product name, variant/options caption, image (with fallback), and
quantity 1 — and the sheet title shows the new total. Continue Shopping
closes the sheet and returns to browsing; View Full Cart navigates to `/cart`.
While browsing anywhere in the customer experience (Home, Products, Search,
Brands, Categories, Product Detail), a persistent cart button with a count
badge (hidden on `/cart` itself, where it would be redundant) reopens the
Quick Cart without adding another item. Adding the same variant with the same
option selection again merges into the existing line; a different variant or
different option selection creates a distinct line. Reloading the app keeps
the cart for the same signed-in profile. Signing out clears the cart through
the existing cleanup contract, and signing back in starts empty.

No price, subtotal, money total, stock count, SKU, or barcode appears
anywhere in this flow — the cart contract forbids them and nothing in this
feature adds them.

## Acceptance criteria

Each one must be observable and checkable. These become tests.

**IDs are stable.** Every task in `plan.md` links to one by ID. Once the plan
is `READY`, never renumber or reuse an ID: a new criterion gets a new ID, and
a removed one stays here marked superseded, with the reason. Renumbering
silently invalidates every reference in `worklog.md`.

| ID    | Criterion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Observable how                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | Session-wide cart readiness: a signed-in Customer browsing Catalog has the single cart hydrated for the active profile BEFORE Add-to-Cart can run — the integration mounts `useCart()` once at the customer experience level, so an Add press can never silently no-op for an un-hydrated cart, and the cart module (with its sign-out cleanup registration) is loaded for the whole session                                                                                                                                                                 | Provider test: mounted provider hydrates via useActiveProfile; Add press after hydration is a real mutation (not a logged no-op); cart module import observed at shell level (R-FR-05 closure) |
| AC-02 | Product Detail Add-to-Cart: an AVAILABLE selected variant enables the Add action and adds quantity 1; an UNAVAILABLE selected variant keeps the variant selectable for inspection but leaves Add disabled (disabled state exposed, not colour-only); no inventory quantity is invented or displayed                                                                                                                                                                                                                                                          | Screen test: variant select flips Add enabled/disabled; unavailable → disabled + no cart mutation; available → addItem called with quantity 1                                                  |
| AC-03 | Correct AddToCartInput mapping: the integration derives the cart input from the resolved Product + selected Variant — productId, variantId, productDisplayName, variantLabel, optionSelections (optionTypeId, optionValueId, optionValueLabel), imageUri (the variant's primary media incl. product-cover fallback, else null), quantity = 1 — and NEVER price, subtotal, brand snapshot, category snapshot, SKU, barcode, stock, or availability snapshot                                                                                                   | Pure mapping tests over every variant family (override, option-backed, no-option single, no-option multi, no-media); forbidden-field pins                                                      |
| AC-04 | Caption correctness: the derived variantLabel never duplicates user-visible option values in a cart row caption (the row renders `[variantLabel, ...optionValueLabels].join(" · ")`). Rule: title_override used verbatim; option-backed variants without override get the joined option TYPE names as the label (values arrive only via optionSelections); a no-option single variant is "Standard option"; a no-option variant among several is "Option N"                                                                                                  | Deterministic mapping tests pinning all four families + the negative "Flavor: Watermelon · Watermelon" shape; live check against real option-backed products                                   |
| AC-05 | Quick Cart after Add: a successful Add opens the QuickCartSheet (existing public component, not a reimplementation); the newly added line is visible with correct caption/image/quantity; the total updates; Continue Shopping closes the sheet; View Full Cart navigates to `/cart`                                                                                                                                                                                                                                                                         | Provider + screen tests: open-state flips on add; sheet content via public QuickCartSheet; intents wired (close / router.push("/cart"))                                                        |
| AC-06 | Persistent cart access: a cart affordance with a count badge derived from the cart's existing total remains available while browsing Home, Products, Search, Brands, Categories, and Product Detail; it is hidden on `/cart`; pressing it opens the Quick Cart without adding anything; the badge is text-carrying, never colour-only                                                                                                                                                                                                                        | Provider tests: affordance rendered on browsing routes, absent on /cart; press → sheet open, no mutation; badge equals totalQuantity from the single cart model (no mirrored state)            |
| AC-07 | Cart semantics preserved: the same variant + same option-value set merges into the existing line (quantity sums, capped by the cart's own bound); a different variant or different option selection produces a distinct line; the integration never reimplements line identity or merge — `deriveLineId` and the store rules stay authoritative                                                                                                                                                                                                              | Integration tests through the public cart API: re-add same selection → merged; add different variant/options → distinct line; cart suite still green unchanged                                 |
| AC-08 | Local persistence: with items in the cart, an app reload restores the same lines and quantities for the same active profile through the cart's existing durable restore; no Supabase cart call exists anywhere in the network path                                                                                                                                                                                                                                                                                                                           | Provider/store tests for re-hydration; boundary scans: zero cart REST/RPC/Realtime usage in the integration; live reload check                                                                 |
| AC-09 | Sign-out safety: signing out clears the cart through the existing core/auth cleanup registry (registered at feature-module load — now guaranteed because the integration loads the cart module at the customer experience level); after re-authentication the previous cart does not resurrect                                                                                                                                                                                                                                                               | Jest: cleanup registration observed through the public import path (R-FR-05 closure); live sign-out → re-sign-in journey with empty cart                                                       |
| AC-10 | Responsive and accessible: the Add action, cart affordance/badge, Quick Cart (side panel in landscape, bottom sheet in compact/portrait), and Full Cart work at 1280×800, 800×1180, and 480×900 with ≥48dp touch targets, exposed disabled states, correct accessible names, dialog semantics on the sheet, no nested-interactive DOM violations, no clipping or horizontal overflow                                                                                                                                                                         | Component tests in both layout frames (as the cart suites do) + live browser verification at the three sizes incl. keyboard focus traversal and console cleanliness                            |
| AC-11 | Boundary discipline: the only files edited outside `features/catalog-cart-integration/**` are the two plan-justified edits — `app/(customer)/_layout.tsx` (thin provider mount) and `features/catalog/screens/product-detail/product-detail-screen.tsx` (+ its test, the Add action as a Catalog-owning edit consuming the integration's public API). Cross-feature imports go through `@/features/catalog-cart-integration` and `@/features/cart` public surfaces only; no deep imports in either direction; no new shared primitive; no ESLint suppression | Public-API import tests; ESLint boundary rules green; diff review confined to the declared file set; generator conformity checks pass                                                          |

State requirements are **capability-aware**. This integration adds no new
data-backed read (Catalog owns the catalog read; the cart read is the merged
Cart feature's local state). Its genuine UI states: the Add action's
enabled/disabled states (variant availability), the Quick Cart's open/closed
state, the affordance's badge count (including zero), and — inherited, not
re-implemented — the cart's own persistence warnings and lock states surfacing
inside the reused QuickCartSheet.

## General delivery requirements

- [x] Applicable read/mutation states above are handled. (No new network
      states; UI states enumerated under AC-02/AC-05/AC-06; cart states
      surface through the reused public QuickCartSheet.)
- [x] Works at the tablet sizes in `docs/design-system.md` (landscape and portrait).
      (LIVE HOSTED JOURNEY: 1280×800 / 800×1180 / 480×900 — zero horizontal overflow at
      all three; affordance measured 48×48; Add clearance 96px verified at 480.)
- [x] Accessible: roles and labels on interactive elements; no colour-only meaning.
      (Accessible names, disabled-as-state, text-carrying badge, dialog role + focus
      containment + Escape close — component tests + the live journey.)

## Scope

- `features/catalog-cart-integration/` — the integration slice: the
  experience-level provider (cart readiness + Quick Cart open state +
  persistent affordance), the pure product→cart-input mapping model, the
  Add-to-cart action component, and their tests.
- Two plan-justified edits in already-merged features:
  `app/(customer)/_layout.tsx` (wrap the customer Stack in the integration
  provider — a thin mount) and
  `features/catalog/screens/product-detail/product-detail-screen.tsx` (+ test)
  to render the Add action through the integration's public API.
- A narrow public API (`features/catalog-cart-integration/index.ts`) consumed
  by Product Detail and the customer layout.

## Out of scope

Be explicit. This is what stops a feature growing while it is being built.

- **Checkout / order submission**: `create_order()`, idempotency, order
  review, order success, payment — future Checkout owns all of it. The cart
  lock stays unused.
- **Prices, subtotals, money, exact inventory, SKU, barcode** display —
  permanent cart/product boundaries, not deferrals.
- **Server cart persistence**: any Supabase cart table, Cart RPC, Cart
  Realtime, or Cart mutation endpoint. Also multi-device cart
  synchronization and conflict resolution — the single-kiosk-tablet product
  has one local cart by design; the server becomes authoritative only when
  Checkout submits normalized order items.
- **Customer tracking / analytics** (ADR-0006 gap stands).
- Redesigning Catalog screens, the Cart screens, or the customer shell
  beyond the two declared edits; adding a customer sign-out affordance
  (future customer-shell scope — the Cart brief's B-FR-02 note applies).
- Preparation/Admin behavior; kiosk-runtime behavior; native device tiers
  beyond what current repository policy requires.
- Re-opening settled Catalog or Cart acceptance criteria; re-planning their
  architecture; deep-importing either feature's internals.

## Constraints

- Backend contracts come from `supabase/migrations/*.sql`. No new RPC,
  migration, RLS change, or grant is needed or allowed for this feature —
  the hosted TEST database is read-only for Catalog and untouched for Cart.
- The Cart is exactly ONE local model (the merged Zustand store). This
  integration must not create a second cart store, mirror cart state, or
  re-implement `deriveLineId` / merge / quantity bounds / summaries.
- Catalog server state stays TanStack-owned (`useCatalog`); no catalog data
  is copied into cart state beyond the AddToCartInput display snapshot.
- Cross-feature imports through public APIs only:
  `@/features/cart` (components/hook/actions/types) and
  `@/features/catalog-cart-integration` (provider/mapping/Add action).
  `features/catalog/**` internals are never imported by the integration
  (the Product Detail edit is the owning-feature edit, justified in the
  plan); `features/cart/**` internals are never imported by anyone new.
- Ephemeral Quick Cart open/close state uses plain React composition/context
  owned by the integration provider (the minimal correct integration
  approach — no second Zustand store for domain state).
- The customer layout edit stays thin: mounting the provider and nothing
  else; feature/state logic lives in the integration-owned component.
- UI composes existing design-system primitives (`Button`, `Badge`, `Text`,
  `AdaptiveSheet` via `QuickCartSheet`, `Screen`) with semantic tokens and
  ≥48dp touch targets. No new shared primitive, no raw hex, no
  Dimensions/TouchableOpacity (design-system rules).
- `usePathname` from expo-router may be read inside the provider to hide the
  affordance on `/cart`; navigation to `/cart` uses the router's public push.

## Evidence

- Merged dependencies on current develop (62f3634): `features/catalog/**`
  (PR #10) and `features/cart/**` (PR #8), with their control documents —
  Cart's R-FR-05 carry-forward ("the future Catalog customer shell imports
  @/features/cart … loading the feature module at shell level so the cleanup
  is always registered") and R-FR-02 hydration seam are exactly what this
  integration closes.
- `features/catalog/model/catalog-view.ts` — the variant label derivation
  (title_override / joined option pairs / "Standard option" / "Option N"),
  `primaryMedia` fallback chain, and option type/value shapes.
- `features/cart/model/cart-line.schema.ts` (AddToCartInput contract),
  `features/cart/components/cart-item-row.tsx` (caption composition that
  creates the duplication hazard), `features/cart/model/cart-rules.ts`
  (line identity + merge semantics), `features/cart/state/use-cart.ts`
  (hydration ownership), `features/cart/components/quick-cart-sheet.tsx`
  (controlled sheet contract), `features/cart/index.ts` (public API + the
  cleanup-registration module side-effect).
- `app/(customer)/_layout.tsx` (thin Stack layout — the provider mount
  point), `app/_layout.tsx` (PortalHost present at root),
  `components/ui/adaptive-sheet.tsx` (side/bottom presentation modes),
  `components/ui/badge.tsx` (text-carrying badge).
- `docs/state-management.md`, `docs/design-system.md`, `.claude/rules/ui.md`
  and `.claude/rules/routes.md` — state ownership, badge and touch-target
  rules, thin-route rule.
- Live hosted TEST Catalog dataset (populated products/variants incl.
  option-backed ones) for the final browser journey; Customer test account
  from `docs/environment.md`.
