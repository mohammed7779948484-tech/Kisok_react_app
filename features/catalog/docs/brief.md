# Catalog — brief

**WHAT this feature is, and how we will know it is done.** No implementation
sequencing here; that belongs in `plan.md`.

Status: `READY`

## Objective

Replace the Customer Foundation placeholder with the first production Catalog
experience, so an authenticated in-store customer can discover the current
customer-visible assortment, move between products, brands, categories and
search, and inspect product media, generic variants/options and availability.
Catalog is inspection and discovery only: it does not own cart state or order
submission.

## User-visible behaviour

The Customer lands on a Catalog Home that identifies the store when settings are
available and otherwise uses a neutral Catalog heading. Home provides direct
entry to all products, brands, categories and search, plus bounded discovery
sections from the current snapshot.

Products appear in responsive, touch-friendly grids with safe imagery and
textual availability. Customers can browse every returned product, narrow the
assortment through a brand or category, search locally, and open Product Detail.
Category discovery includes the two-level hierarchy supported by the current
backend; a parent category includes products linked directly to it or to one of
its direct children, and Category Detail can be narrowed by brand.

Product Detail shows the selected product's imagery, optional brand and
description, category context, and every concrete generic variant represented by
ordered option types/values. Selecting a variant changes the displayed variant
context and media. Available and unavailable variants remain inspectable and are
labelled in words. Because no approved Cart public API exists yet, Catalog shows
no quantity control, Add-to-Cart action, cart sheet, or other dead ordering UI.

Root Catalog destinations use clear Home, Products, Brands, Categories and
Search navigation. Detail screens retain an obvious way back to the discovery
surface that opened them. Re-selecting a root destination replaces rather than
stacks duplicate root history.

## Acceptance criteria

Each one is observable and checkable. These become tests.

**IDs are stable.** Every task in `plan.md` links to one by ID. Once the plan is
`READY`, never renumber or reuse an ID: a new criterion gets a new ID, and a
removed one stays here marked superseded, with the reason. Renumbering silently
invalidates every reference in `worklog.md`.

| ID    | Criterion                                                                                                                                                                                                                                                                                                                                                                                                         | Observable how                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | An authenticated Customer reaches the real Catalog at `app/(customer)/index.tsx`, and the complete Catalog read uses the current customer-safe `get_customer_catalog()` snapshot with runtime validation.                                                                                                                                                                                                         | The Foundation placeholder is absent; one successful RPC response supplies the screens, malformed payloads are rejected, and a retryable read failure shows a safe retry action.                                                                                                                                                                                                                                                                |
| AC-02 | Catalog Home provides useful discovery without assuming optional settings or optional collections exist.                                                                                                                                                                                                                                                                                                          | Home shows store identity when present, falls back to a neutral heading when absent, links to Products/Brands/Categories/Search, shows bounded display-order brand/category and featured-product sections when available, and shows a whole-catalog empty state when no products are returned.                                                                                                                                                  |
| AC-03 | Customers can browse all returned products in a scalable responsive grid and open the selected Product Detail.                                                                                                                                                                                                                                                                                                    | Product count, product identity, image/fallback and textual derived availability are visible; all-unavailable products remain discoverable; selecting a card opens the matching product.                                                                                                                                                                                                                                                        |
| AC-04 | Customers can browse returned brands and inspect brand-scoped products.                                                                                                                                                                                                                                                                                                                                           | All Brands shows whole-card brand navigation and derived product counts; an empty brand collection directs the customer to Products; Brand Detail resolves the requested brand, shows only that brand's products, and handles a stale/invalid brand ID safely.                                                                                                                                                                                  |
| AC-05 | Customers can browse the current two-level category hierarchy and inspect category-scoped products with an optional brand filter.                                                                                                                                                                                                                                                                                 | All Categories shows whole-card category navigation; Category Detail resolves the requested category, shows direct children where applicable, includes products linked to the category or its direct children, defaults to all brands, clearly represents the selected brand, and offers a reset when that filter has no matches.                                                                                                               |
| AC-06 | Customers can search the loaded Catalog using the generic Lean V2 model without another backend request.                                                                                                                                                                                                                                                                                                          | After two non-whitespace characters, normalized matching covers product names/keywords and associated brand, category, variant-title/keywords and option type/value labels; idle, too-short, no-match and result states are distinct; results open the matching Product Detail. SKU and barcode are not customer search fields.                                                                                                                 |
| AC-07 | Product Detail presents customer-safe product, media, generic variant/option and availability information without inventing Cart behaviour. (The "no Add-to-Cart control" clause is superseded for exactly ONE sanctioned action by the `catalog-cart-integration` feature — see its plan decision 2 and the supersession note in `product-detail-screen.tsx`; quantity/Checkout/price/stock prohibitions stand.) | The requested product resolves or shows a safe not-found state; concrete variants are labelled by `title_override`, ordered option values, or a neutral ordered fallback when neither exists; option names/values are understandable, variant media falls back to product media and then the shared image fallback, availability is textual, and no quantity/Add-to-Cart/Checkout control is rendered (Add-to-Cart clause superseded as noted). |
| AC-08 | Catalog navigation remains role-correct and usable across the complete discovery journey.                                                                                                                                                                                                                                                                                                                         | A Customer can move among Home, Products, Brands, Categories, Search and detail routes without redirect loops or duplicate root stacking; non-Customer access remains excluded by the existing protected customer route group and the RPC's active-Customer authorization.                                                                                                                                                                      |

State requirements are **capability-aware**. Catalog has one network-backed
snapshot read: cold loading, retryable/non-retryable error handling, success, and
a reachable whole-catalog empty state. Brand/category emptiness, filtered
no-match, search states and stale route IDs are local projections of a successful
snapshot and do not pretend to have independent network loading/error states.
There is no Catalog mutation.

## General delivery requirements

These are Definition-of-Done checks, not extra Acceptance Criteria, so they do
not get fake AC IDs and tasks do not link to them as if they described product
behaviour.

- [ ] Applicable read states above are handled with existing feedback primitives.
- [ ] Works at compact/narrow web, tablet portrait and tablet landscape sizes from
      `docs/design-system.md`.
- [ ] Accessible: 48dp-or-larger controls, named links/buttons/inputs, selected and
      disabled state announced, result/error changes announced, no colour-only
      meaning, and no clipping at 200% text scaling.
- [ ] Growing product/brand/category result sets use the repository's appropriate
      virtualization strategy; bounded Home and Product Detail sections do not
      virtualize ceremonially.
- [ ] Images use `AppImage`, preserve layout on missing/failed URLs, and never
      expose a secret or upload capability.

## Scope

- Customer Catalog Home.
- All Products.
- All Brands and Brand Detail.
- All Categories and Category Detail, including direct-child discovery and a
  local brand filter.
- Customer Catalog Search.
- Product Detail for product identity, descriptive content, categories, media,
  generic variants/options and boolean availability.
- Catalog-owned navigation/chrome required to move among those surfaces without
  changing the shared Customer layout.
- One runtime-validated customer snapshot query and pure local projections for
  all discovery surfaces.
- Thin Customer routes for every screen above.

## Out of scope

- Cart state, cart persistence, quantity management, Add-to-Cart actions, cart
  sheet integration or cart badges. Cart owns these through a future approved
  public Feature API.
- Checkout, order review/submission, order success/reset, or order creation.
- Customer order tracking. The current backend has no secure Customer tracking
  contract.
- Preparation or Admin behaviour, catalog mutation, media upload, inventory
  mutation, or unsafe direct catalog/inventory table reads.
- Prices, subtotals, totals, payments, delivery, shipping, public signup, social
  login or account management.
- Exact stock quantity or low-stock messaging; the customer contract exposes
  boolean `is_available` only.
- Server-side Catalog search, server pagination, separate Home/Search/Detail RPCs,
  Catalog Realtime, or incremental synchronization.
- A persistent cross-feature Customer shell or changes to
  `app/(customer)/_layout.tsx`; Catalog keeps its own additive navigation until a
  shared shell is deliberately planned across Catalog, Cart and Checkout.

## Constraints

- Backend contracts come from `supabase/migrations/*.sql`. Catalog uses only the
  zero-argument `get_customer_catalog()` RPC; it never invents another contract.
- Customer raw catalog-table reads are ineffective under RLS and must not be
  attempted. Never weaken RLS, add a grant, or write a security-definer
  workaround.
- `schema_version` must be exactly `kiosk.catalog.lean.v1`; all JSON collections
  are validated before use. The optional `settings` object may be `{}`.
- Product/category membership is many-to-many with no primary category.
  Categories have at most one child level.
- A returned product always has at least one valid active variant, but every
  returned variant may be unavailable.
- Availability is boolean. No client inference of exact or low stock is allowed.
- Server state stays in TanStack Query. Screen filters, search text and selected
  variant/media are ephemeral React state; Catalog has no Zustand store.
- Routes stay thin and import screens only from `@/features/catalog`.
- The Customer root placeholder replacement is the only route generation that
  may use `--force`.

## Evidence

- `supabase/migrations/20260826050006_lean_customer_catalog.sql:1-263` — active
  Customer authorization, exact snapshot shape/filtering/order, optional settings,
  generic variants/options/media and boolean availability.
- `supabase/migrations/20260826050003_lean_catalog_schema.sql:5-211` — two-level
  categories, many-to-many memberships and generic variant constraints.
- `supabase/migrations/20260826050013_lean_rls_grants.sql:20-205,295-304` — no
  Customer catalog row policies and the final explicit RPC surface.
- `supabase/migrations/20260826050012_lean_realtime.sql:1-5` — Catalog is not
  published to Realtime.
- `KISOK_FLUTTER_PRODUCT_REFERENCE.md:195-519,1300-1346` — product behaviour only:
  discovery journeys, return context, states, image fallback and generic
  terminology; legacy schema, Flavor, pagination, Cart and Tracking were rejected.
- `docs/design-system.md`, `components/app/ui-lab.tsx`, `components/media/app-image.tsx`
  and `core/responsive/index.ts` — current primitives, semantic tokens, image
  fallback and compact/medium/expanded layout contract.
