# Catalog — implementation plan

**HOW the brief gets built.** Written with `kisok-feature-plan` after three
independent research scopes and Lead spot-checks of the material migrations.

Status: `READY`

`DRAFT` → no implementation task may start. Set `READY` only when the checklist
at the bottom of this file and the dedicated Lead Planning Review are fully
satisfied. If a material decision changes later — an acceptance criterion, the
shape, a dependency, or a scaffold — return to `DRAFT`, reconcile this file and
`todo.md`, then restore `READY`.

There is no fourth gate: `TASK`, `ROUND` and `FEATURE` are the gates. This status
is the implementation-readiness signal.

## Research synthesis

- **Data contract:** `get_customer_catalog()` is the sole Customer catalog read.
  It is a zero-argument, active-Customer-only, stable `jsonb` snapshot with
  `schema_version: "kiosk.catalog.lean.v1"`; all collections are normalized
  arrays and settings may be `{}`. Customer has no effective raw catalog rows
  under RLS. Products remain returned when all variants are unavailable;
  availability is boolean only. Catalog is not published to Realtime.
  Evidence: `20260826050006_lean_customer_catalog.sql:1-263`,
  `20260826050003_lean_catalog_schema.sql:5-211`,
  `20260826050013_lean_rls_grants.sql:20-205,295-304`, and
  `20260826050012_lean_realtime.sql:1-5`.
- **Behaviour reference:** preserve the discovery journeys, whole-card
  navigation, useful return context, responsive grids, distinct local search
  states, safe image fallback, and generic variant/option meaning from
  `KISOK_FLUTTER_PRODUCT_REFERENCE.md:195-519,1300-1346`. Reject its old schema,
  Flavor model, pagination machinery, Cart/Checkout/Tracking surfaces, exact
  visual structure, and unproven SKU/barcode customer search.
- **UI/design:** compose from the current `Screen`, UI primitives, feedback
  states, `AppImage`, and responsive helpers. Growing result collections use
  `@shopify/flash-list`; bounded Home sections and short detail media/variant
  lists remain simple scroll compositions. New business UI stays Catalog-owned;
  no shared design-system addition is needed. Evidence: `docs/design-system.md`,
  `components/app/ui-lab.tsx`, `components/media/app-image.tsx`,
  `core/responsive/index.ts`, and `kisok-react-native-rules`.

## Design decisions

1. **One validated snapshot, then local projections.** Fetch and validate
   `get_customer_catalog()` once through TanStack Query and transform it into a
   deterministic Catalog view/index used by every screen. Rejected: one RPC or
   query per Home/Search/Brand/Category/Detail surface, because no such current
   backend contracts exist and the snapshot intentionally supports local
   filtering.
2. **Pure Catalog view model in `model/`.** Build maps and derived entities once:
   product availability, brand/category counts, parent-category aggregation,
   ordered variant labels/media, normalized search text, and ID lookups.
   Rejected: repeating joins and availability rules independently in each screen,
   which would create inconsistent discovery results.
3. **TanStack Query only for server state.** The query hook returns the derived
   view through a stable `select` transform. Search text, category brand filter,
   selected variant, and selected image are screen-local React state. Rejected:
   Zustand caching of the snapshot or transient screen selections.
4. **Flat generated routes with query parameters for details.** The current route
   generator accepts a flat URL-segment name and intentionally sanitizes `/` and
   bracket syntax. Use `/brand-detail?brandId=…`,
   `/category-detail?categoryId=…`, and `/product-detail?productId=…`; generated
   route files read `useLocalSearchParams` and pass IDs to screens. Rejected:
   hand-created nested/dynamic route files that bypass the generator.
5. **Feature-owned Catalog navigation, shared Customer layout untouched.** Home,
   Products, Brands, Categories and Search render a feature-level root navigation
   control. Root changes use replace semantics; cards push detail routes so the
   originating screen normally stays mounted and preserves its list context.
   Rejected: modifying `app/(customer)/_layout.tsx` before Cart and Checkout can
   jointly define a cross-feature shell.
6. **Bounded Home sections.** Home uses backend display order and shows at most
   six brands, six root categories, and eight featured products, each with a
   Browse All action. Optional absent sections are omitted; only `products: []`
   produces a whole-catalog empty state. Rejected: calling unflagged brands or
   categories “curated,” unbounded Home grids, or section-level dead-end empty
   panels.
7. **Two-character local search.** Trim and case/diacritic-normalize input; under
   two characters is a distinct prompt. Match product name/keywords plus
   associated brand, category, variant title/keywords, option type and option
   value labels. Preserve backend product display order and return each product
   once. Rejected: network search, ranking inventions, SKU/barcode matching, and
   legacy Flavor terminology.
8. **Two-level category semantics.** A child category projects only its direct
   memberships. A root category projects products linked directly to the root or
   to one of its direct children, de-duplicated in backend product order. Brand
   filtering is local and defaults to All Brands. Rejected: a primary-category
   assumption or recursive hierarchy unsupported by the migration.
9. **Concrete variant choices, inspection only.** Product Detail lists actual
   returned variants as complete valid combinations, labelled by
   `title_override`, ordered `Option type: value` pairs, or `Standard option` /
   `Option N` in backend order when a variant has neither. Any variant, including
   unavailable ones, remains selectable for inspection; availability is textual.
   Selected variant media falls back to product cover and then `AppImage`'s
   fallback. Rejected: a hardcoded Flavor selector, invalid cross-product option
   combinations, exact stock, quantity controls, or Add-to-Cart UI without an
   approved Cart public API.
10. **Product-level availability is derived, never invented.** A product is
    Available when any returned variant is available; otherwise it remains
    discoverable and says Out of stock. Rejected: hiding all-unavailable products
    or deriving low-stock state from the global threshold.
11. **No Catalog Realtime/pagination.** Refresh and retry refetch the snapshot.
    Rejected: subscriptions to unpublished catalog tables, append loading, or
    incremental synchronization without a contract.
12. **No shared media change in the initial shape.** Product Detail remounts its
    main `AppImage` by selected URI so the existing component's latched failure
    state cannot leak across gallery selections. Rejected: changing shared
    `AppImage` before a Catalog-local use demonstrates that a shared fix is
    necessary.

## Data contract

| RPC / table                                 | Direction            | Role              | Returns / access                                                                                                                                                                                                                                | Migration                                        |
| ------------------------------------------- | -------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `get_customer_catalog()`                    | read                 | active `customer` | One `jsonb` object: `schema_version`, optional/full `settings`, and ordered arrays for brands, categories, products, product-category links, option types/values, variants with boolean `is_available`, variant-option links, and variant media | `20260826050006_lean_customer_catalog.sql:5-263` |
| Raw catalog/media/settings/inventory tables | direct read rejected | `customer`        | `authenticated` has object grants but Customer has no applicable catalog/media/settings/inventory row policy; no usable rows                                                                                                                    | `20260826050013_lean_rls_grants.sql:20-205`      |

Intentional Catalog RPC error: SQLSTATE `42501` when no active Customer profile is
resolved. Other transport/schema failures are normalized by `callRpc` to
`AppError`. No Catalog mutation/business-conflict branch exists.

Realtime: **NO.** Only `public.orders` is published; Catalog is an app-refreshed
snapshot and Customer has no relevant publication/RLS path.

## Feature shape decision

| Capability   | Needed? | Evidence / reason                                                                                                       |
| ------------ | ------: | ----------------------------------------------------------------------------------------------------------------------- |
| model/schema |     YES | The RPC returns wide `Json`; Zod validation and pure normalized projections are required.                               |
| query        |     YES | One TanStack Query pipeline owns `get_customer_catalog()` and the derived view.                                         |
| mutation     |      NO | Catalog writes nothing.                                                                                                 |
| store        |      NO | No durable/shared client-owned state; all local interaction state belongs to screens.                                   |
| component    |     YES | Navigation, responsive grid, availability and entity cards are reused; a few detail/filter components are screen-local. |
| screen       |     YES | Eight observable discovery/detail surfaces are required.                                                                |
| realtime     |      NO | Catalog tables are unpublished and Customer Realtime is unsupported.                                                    |
| route        |     YES | Each screen needs a thin Customer route; the root deliberately replaces the Foundation placeholder.                     |

Routes are explicit and flat because that is the current generator contract:

- `app/(customer)/index.tsx` → customer → `CatalogHomeScreen` → replaces the
  Foundation placeholder (`--force`, one time only).
- `app/(customer)/products.tsx` → customer → `ProductsScreen` → new file.
- `app/(customer)/search.tsx` → customer → `SearchScreen` → new file.
- `app/(customer)/brands.tsx` → customer → `BrandsScreen` → new file.
- `app/(customer)/brand-detail.tsx?brandId=<uuid>` → customer →
  `BrandDetailScreen` → new file; route passes `brandId`.
- `app/(customer)/categories.tsx` → customer → `CategoriesScreen` → new file.
- `app/(customer)/category-detail.tsx?categoryId=<uuid>` → customer →
  `CategoryDetailScreen` → new file; route passes `categoryId`.
- `app/(customer)/product-detail.tsx?productId=<uuid>` → customer →
  `ProductDetailScreen` → new file; route passes `productId`.

`app/(customer)/_layout.tsx` is not changed.

## Generator commands, mapped to tasks

The Lead runs each command immediately before the mapped task, in the listed
order for that task. Nothing beyond the workspace is bulk-generated.

| Generator command                                                                      | Task |
| -------------------------------------------------------------------------------------- | ---- |
| `pnpm generate schema catalog catalog-snapshot`                                        | T01  |
| `pnpm generate query catalog catalog`                                                  | T02  |
| `pnpm generate component catalog catalog-navigation`                                   | T03  |
| `pnpm generate component catalog catalog-grid`                                         | T03  |
| `pnpm generate component catalog availability-badge`                                   | T03  |
| `pnpm generate component catalog product-card`                                         | T03  |
| `pnpm generate component catalog brand-card`                                           | T03  |
| `pnpm generate component catalog category-card`                                        | T03  |
| `pnpm generate screen catalog catalog-home`                                            | T04  |
| `pnpm generate route catalog index --role=customer --screen=catalog-home --force`      | T04  |
| `pnpm generate screen catalog products`                                                | T05  |
| `pnpm generate route catalog products --role=customer --screen=products`               | T05  |
| `pnpm generate screen catalog search`                                                  | T06  |
| `pnpm generate route catalog search --role=customer --screen=search`                   | T06  |
| `pnpm generate screen catalog brands`                                                  | T07  |
| `pnpm generate screen catalog brand-detail`                                            | T07  |
| `pnpm generate route catalog brands --role=customer --screen=brands`                   | T07  |
| `pnpm generate route catalog brand-detail --role=customer --screen=brand-detail`       | T07  |
| `pnpm generate screen catalog categories`                                              | T08  |
| `pnpm generate screen catalog category-detail`                                         | T08  |
| `pnpm generate component catalog category-brand-filter --screen=category-detail`       | T08  |
| `pnpm generate route catalog categories --role=customer --screen=categories`           | T08  |
| `pnpm generate route catalog category-detail --role=customer --screen=category-detail` | T08  |
| `pnpm generate screen catalog product-detail`                                          | T09  |
| `pnpm generate component catalog product-media-gallery --screen=product-detail`        | T09  |
| `pnpm generate component catalog variant-choice-list --screen=product-detail`          | T09  |
| `pnpm generate route catalog product-detail --role=customer --screen=product-detail`   | T09  |

Expected scaffold paths are repeated in each task packet below and in `todo.md`.
Route commands also append the target screen export to
`features/catalog/index.ts` atomically. Detail-route implementation edits the
generated route body to read and pass the named query parameter; the route file
itself remains generator-owned, not manually created.

## Allowed manual files

No generator capability fits these pure/test artifacts:

- `features/catalog/model/catalog-snapshot.fixture.ts` — shared valid/edge-case
  test payload builder.
- `features/catalog/model/catalog-view.ts` — pure normalized projections,
  labels, counts, category aggregation, search and ID resolution.
- `features/catalog/model/catalog-view.test.ts` — projection/label/search rules.
- `features/catalog/api/fetch-catalog.test.ts` — RPC boundary and malformed
  payload behavior.
- `features/catalog/queries/use-catalog.test.tsx` — query key/fetch/select behavior.
- Colocated `*.test.tsx` files beside generated feature components — behavioral
  and accessibility tests; the component capability intentionally produces no
  test template.

Generated screen tests are edited in place, not replaced by separate test
folders. No root/shared component, core file, migration, generated database type,
or customer layout file is planned.

## Files expected to change

- `features/catalog/docs/{brief,plan,todo,worklog,review}.md` — feature control
  documents and evidence.
- `features/catalog/index.ts` — generated public exports for routed screens only.
- `features/catalog/model/**` — validated snapshot and pure Catalog view.
- `features/catalog/api/**` and `features/catalog/queries/**` — the only backend
  read and TanStack Query ownership.
- `features/catalog/components/**` — Catalog-wide discovery UI.
- `features/catalog/screens/**` — eight screen slices and screen-local UI.
- `app/(customer)/index.tsx` — deliberate Foundation placeholder replacement.
- `app/(customer)/{products,search,brands,brand-detail,categories,category-detail,product-detail}.tsx`
  — new thin routes.
- Shared/core files: **none expected**.

## Required skills

Every implementation task loads `test-driven-development` first.

- T01: `supabase`, `supabase-postgres-best-practices` (current vendored skill
  files under `.agents/skills/`) for contract correctness.
- T02: `supabase`, `supabase-postgres-best-practices` for `callRpc` and query
  ownership.
- T03: `kisok-design-system`, `kisok-react-native-rules` for touch/accessibility,
  images and scalable grids.
- T04: `kisok-design-system`, `kisok-react-native-rules`, `expo-router`.
- T05: `kisok-design-system`, `kisok-react-native-rules`, `expo-router`.
- T06: `kisok-design-system`, `kisok-react-native-rules`, `expo-router`.
- T07: `kisok-design-system`, `kisok-react-native-rules`, `expo-router`.
- T08: `kisok-design-system`, `kisok-react-native-rules`, `expo-router`.
- T09: `kisok-design-system`, `kisok-react-native-rules`, `expo-router`.

If the external skills are not exposed through the runtime Skill picker, the
implementer reads their current repository-owned vendored `SKILL.md` directly;
it does not guess an API from memory.

## Test strategy

- **Schema boundary:** accept a complete representative snapshot including empty
  settings and nullable media; reject wrong schema version, malformed UUIDs,
  missing arrays, invalid booleans, and incomplete full settings.
- **Pure view:** prove deterministic backend order, product availability from any
  variant, unbranded/uncategorized tolerance, parent/direct-child category
  aggregation and de-duplication, brand counts, variant labels/media fallback,
  normalized two-character search fields/order, and stale-ID resolution.
- **API/query:** prove exactly one zero-argument `get_customer_catalog` call,
  `callRpc` validation/AppError propagation, the Catalog query key, and delivery
  of the derived view without a Zustand mirror.
- **Shared UI:** behavior/accessibility tests for whole-card names/status,
  navigation callbacks, selected state, image alt/fallback contracts, and
  responsive grid column/virtualization choice. Verify the 48dp control contract
  by component choice, diff review and runtime rather than brittle resolved-style
  assertions. Do not assert NativeWind-resolved styles.
- **Screens:** mock the feature API seam, render through real Query providers, and
  cover only reachable states: cold loading, catalog error/retry, whole-catalog
  empty, local empty/no-match/not-found, and populated interaction. Assert root
  and detail navigation destinations and query parameters.
- **Product Detail:** prove concrete generic labels, selectable unavailable
  inspection, variant-specific media/fallback, missing optional brand/description,
  multiple categories without a fake primary breadcrumb, and absence of price,
  quantity, Cart and Checkout actions.
- **Routes:** `pnpm export:web` plus route-focused imports/params and runtime
  navigation. The root test confirms the Foundation placeholder is gone.
- **Integration/runtime:** real Customer login against hosted TEST Supabase,
  successful live snapshot, actual data on all routes, search/filter/detail
  interaction, no console/runtime errors, no redirect loop, and responsive checks
  at 1280×800 (expanded), 800×1180 (medium portrait), and 480×900 (compact).

## Rounds and tasks

Every task is atomic:
`CLASSIFY → RED / BASELINE → IMPLEMENT → GREEN → AFFECTED CHECKS → DIFF REVIEW → GATE`.
A fresh `feature-implementer` and then a fresh bounded `code-reviewer` are used for
each task. Dependencies must be at `GATE: PASS` before a task starts.

### Round 1 — Validated data foundation

| Task | Mode     | Acceptance                      | Objective                                                                                      | Depends on | Entry evidence                                                                                               |
| ---- | -------- | ------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| T01  | behavior | Supporting: AC-01 through AC-07 | Validate the exact snapshot and build the pure Catalog view/projection rules.                  | —          | Failing schema/view tests for wrong version, parent-child aggregation, variant labels and normalized search. |
| T02  | behavior | Acceptance: AC-01               | Implement the single customer-safe RPC and TanStack Query pipeline returning the derived view. | T01        | Failing API/query tests showing the RPC boundary and derived view are not implemented.                       |

#### T01 task packet

- **Objective:** replace the schema placeholder with the complete Lean V1 payload
  and implement/test pure projection rules used by every discovery surface.
- **Lead scaffold:** `pnpm generate schema catalog catalog-snapshot`.
- **Expected generated files:**
  `model/catalog-snapshot.schema.ts`,
  `model/catalog-snapshot.schema.test.ts`.
- **Allowed manual files:** `model/catalog-snapshot.fixture.ts`,
  `model/catalog-view.ts`, `model/catalog-view.test.ts`.
- **Allowed file scope:** the five paths above plus task evidence in Catalog docs.
- **Focused verification:** the two model test files, then typecheck/lint/format on
  the task scope.

#### T02 task packet

- **Objective:** call only `get_customer_catalog()` through `callRpc`, expose one
  local query key/hook, and select the T01 Catalog view.
- **Lead scaffold:** `pnpm generate query catalog catalog`.
- **Expected generated files:** `api/fetch-catalog.ts`,
  `queries/use-catalog.ts`, `queries/keys.ts`.
- **Allowed manual files:** `api/fetch-catalog.test.ts`,
  `queries/use-catalog.test.tsx`.
- **Allowed file scope:** generated query paths, the two tests, and Catalog docs.
- **Focused verification:** API and hook tests, then affected model tests,
  typecheck/lint/format.

Round 1 gate validates the complete schema → RPC → query → derived-view chain and
confirms no direct table read or client store appeared.

### Round 2 — Shared discovery UI

| Task | Mode     | Acceptance                      | Objective                                                                                      | Depends on | Entry evidence                                                                                                       |
| ---- | -------- | ------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| T03  | behavior | Supporting: AC-02 through AC-08 | Build reusable Catalog navigation, responsive virtualized grid, availability and entity cards. | T01        | Failing component tests for whole-card semantics, derived status, navigation callbacks and responsive grid behavior. |

#### T03 task packet

- **Lead scaffolds:** the six feature-level `component` commands listed above.
- **Expected generated files:**
  `components/catalog-navigation.tsx`, `catalog-grid.tsx`,
  `availability-badge.tsx`, `product-card.tsx`, `brand-card.tsx`, and
  `category-card.tsx`.
- **Allowed manual files:** colocated tests matching those components.
- **Allowed file scope:** `features/catalog/components/**` and Catalog docs.
- **Focused verification:** component tests across compact/medium/expanded mocked
  dimensions, then T01 tests, typecheck/lint/format.

Round 2 gate confirms UI contracts compose from existing primitives, scalable
collections virtualize without pagination, and no shared design-system file was
added.

### Round 3 — Home, all products and search

| Task | Mode     | Acceptance               | Objective                                                        | Depends on | Entry evidence                                                                                                          |
| ---- | -------- | ------------------------ | ---------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| T04  | behavior | Supporting: AC-02, AC-08 | Deliver Catalog Home and replace the Customer placeholder route. | T02, T03   | Generated screen test changed RED for the intended empty/success discovery behavior after the Lead scaffold is present. |
| T05  | behavior | Supporting: AC-03        | Deliver scalable All Products browsing and its route.            | T02, T03   | RED screen tests for count, availability and product navigation.                                                        |
| T06  | behavior | Supporting: AC-06        | Deliver local generic Catalog Search and its route.              | T02, T03   | RED screen tests distinguishing idle, too-short, no-match and results.                                                  |

#### T04 task packet

- **Lead scaffolds:** `screen catalog catalog-home`, then the forced root `route`.
- **Expected generated/replaced files:**
  `screens/catalog-home/catalog-home-screen.tsx`, its test,
  `app/(customer)/index.tsx` replaced, and `index.ts` gains the screen export.
- **Allowed manual files:** none.
- **Allowed file scope:** those paths and Catalog docs only.
- **Focused verification:** Home screen tests, route/export checks,
  `pnpm export:web`, affected data/component tests, typecheck/lint/format.

#### T05 task packet

- **Lead scaffolds:** `screen catalog products`, then `route catalog products`.
- **Expected generated files:** Products screen/test, `app/(customer)/products.tsx`;
  `index.ts` gains the export.
- **Allowed manual files:** none.
- **Allowed file scope:** those paths and Catalog docs only.
- **Focused verification:** Products screen tests, route/export, affected
  grid/card/model tests, typecheck/lint/format.

#### T06 task packet

- **Lead scaffolds:** `screen catalog search`, then `route catalog search`.
- **Expected generated files:** Search screen/test,
  `app/(customer)/search.tsx`; `index.ts` gains the export.
- **Allowed manual files:** none.
- **Allowed file scope:** those paths and Catalog docs only.
- **Focused verification:** Search behavior/accessibility tests, route/export,
  affected selector/card tests, typecheck/lint/format.

Round 3 gate performs an integrated Customer entry/Home → Products/Search →
Product route-target review. Once coherent verified work is committed, the Lead
pushes `feature/catalog` and opens the Draft PR against `develop`.

### Round 4 — Brand and category discovery

| Task | Mode     | Acceptance               | Objective                                                                                                                                   | Depends on    | Entry evidence                                                                         |
| ---- | -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------- |
| T07  | behavior | Acceptance: AC-04        | Deliver All Brands, Brand Detail, and both routes.                                                                                          | T02, T03      | RED tests for brand counts, scoped products, empty collection and stale ID.            |
| T08  | behavior | Acceptance: AC-02, AC-05 | Deliver All Categories, Category Detail, direct-child aggregation, brand filter, both routes, and complete the root discovery destinations. | T02, T03, T07 | RED tests for hierarchy projection, default filter, selected state and no-match reset. |

#### T07 task packet

- **Lead scaffolds:** both Brand screens, then `brands` and `brand-detail` routes.
- **Expected generated files:** both screen/test pairs, both route files, and two
  public screen exports.
- **Allowed manual files:** none; the generated detail route is edited to pass
  `brandId`.
- **Allowed file scope:** Brand screen directories, the two route files,
  `features/catalog/index.ts`, and Catalog docs.
- **Focused verification:** Brand screen/route/param tests, affected model/card
  tests, `pnpm export:web`, typecheck/lint/format.

#### T08 task packet

- **Lead scaffolds:** both Category screens, then the screen-local
  `category-brand-filter`, then `categories` and `category-detail` routes.
- **Expected generated files:** both screen/test pairs,
  `screens/category-detail/components/category-brand-filter.tsx`, both route
  files, and two public screen exports.
- **Allowed manual files:** the brand-filter component test; the generated detail
  route is edited to pass `categoryId`.
- **Allowed file scope:** Category screen directories, the two route files,
  `features/catalog/index.ts`, and Catalog docs.
- **Focused verification:** Category hierarchy/filter/accessibility and route
  tests, affected model/card tests, `pnpm export:web`, typecheck/lint/format.

Round 4 gate validates cross-screen brand/category counts, filtering, navigation,
not-found states and query-parameter identity without direct backend reads.

### Round 5 — Product Detail discovery

| Task | Mode     | Acceptance                                                       | Objective                                                                                | Depends on                        | Entry evidence                                                                                       |
| ---- | -------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| T09  | behavior | Acceptance: AC-03, AC-06, AC-07, AC-08; Supporting: AC-04, AC-05 | Deliver Product Detail, generic variant/media inspection, and its route without Cart UI. | T02, T03, T04, T05, T06, T07, T08 | RED tests for stale ID, generic labels, variant media/availability and absence of forbidden actions. |

#### T09 task packet

- **Lead scaffolds:** Product Detail screen, then screen-local media-gallery and
  variant-choice-list components, then Product Detail route.
- **Expected generated files:** Product Detail screen/test,
  `screens/product-detail/components/product-media-gallery.tsx`,
  `variant-choice-list.tsx`, `app/(customer)/product-detail.tsx`, and the public
  screen export.
- **Allowed manual files:** colocated tests for both screen-local components; the
  generated route is edited to pass `productId`.
- **Allowed file scope:** Product Detail screen directory, its route,
  `features/catalog/index.ts`, and Catalog docs.
- **Focused verification:** detail/variant/media/route/accessibility tests,
  explicit forbidden-copy assertions, affected model/card tests,
  `pnpm export:web`, typecheck/lint/format.

Round 5 gate validates the complete discovery journey and confirms Catalog owns
no cart, quantity, checkout, price, mutation, store or Realtime behavior.

## Risks

| Risk                                                                | Likelihood | Mitigation                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot fields or optional settings are modeled too narrowly.      | Medium     | Strict migration-derived schema tests include full and `{}` settings plus null media/keywords. Live hosted payload is checked before final evidence.                                            |
| Local joins/search diverge between screens.                         | Medium     | One pure Catalog view/index owns all projections and has focused edge-case tests.                                                                                                               |
| Responsive FlashList column changes lose position on rotation.      | Medium     | CatalogGrid remounts only when column count changes; return-from-detail preservation is tested separately from rotation. Record rotation behavior honestly at runtime.                          |
| Product Detail image failure state leaks between selected variants. | Medium     | Key the main `AppImage` by the resolved selected URI; add a focused gallery test before considering a shared component change.                                                                  |
| Shared hosted Catalog data lacks a useful entity/state.             | Medium     | Component tests control empty/error/stale/unavailable cases; runtime uses current live entities without mutating shared data and records what was actually observed.                            |
| Search relevance is broader/narrower than customer expectation.     | Low        | Brief fixes the fields and two-character threshold; tests pin normalization, de-duplication and backend order.                                                                                  |
| Feature branch conflicts with Customer routes added on `develop`.   | Medium     | Re-fetch and normally merge current `origin/develop` before final verification and again before Feature Gate if it advances. Resolve legitimate route collisions without discarding other work. |
| Large screen scope causes worker context drift.                     | Medium     | Each Task packet has narrow directories, explicit scaffolds, fresh implementer/reviewer contexts, and dependency gates.                                                                         |

## Verification

Per-task focused tests plus typecheck/lint/format are required before each Task
Gate. Each Round gets integrated tests and a fresh round reviewer.

Final candidate verification:

- `pnpm verify` after the last code/integration change.
- `pnpm export:web` and real browser interaction.
- Hosted TEST Supabase Customer sign-in and successful live
  `get_customer_catalog()` read; no local Supabase, Docker, seed or mutation.
- Browser sizes: 1280×800 expanded landscape, 800×1180 tablet portrait, and
  480×900 compact/narrow web; verify actual navigation and interactions, not only
  screenshots.
- Accessibility checks include names/roles/states, keyboard web focus, 200% text
  scaling, and no colour-only availability.
- No Maestro flow is planned: current Catalog data is owner-managed and there is
  no deterministic non-mutating fixture/reset contract for a reliable committed
  route-by-route flow. Manual Android Catalog smoke is warranted if an attached
  device/emulator is available; otherwise native verification is explicitly
  recorded as unverified, not silently marked PASS.
- Fast GitHub CI must pass on the exact final HEAD of the Draft PR.
- Fresh full-feature `code-reviewer`, remediation and fresh re-review until no
  unresolved blocking/major findings.
- Fresh `quality-auditor` after review converges.

## `DRAFT` → `READY`

Set the status at the top to `READY` only when every line here is true and the
Lead has re-read all five control documents against the original request.

- [x] Acceptance criteria complete, stable IDs, each mapped to at least one task
- [x] Feature shape matrix complete; every YES justified
- [x] Data contracts verified against `supabase/migrations/*.sql`
- [x] Every generator command mapped to a task
- [x] Manual-only artifacts justified
- [x] Dependencies coherent
- [x] Route mappings known, target screen named
- [x] Changes outside `features/catalog/` listed and justified
- [x] No unnecessary capability or folder planned
- [x] Required skills, focused verification, expected generated files and allowed
      scope are explicit for every Task
- [x] Final develop-integration, runtime, CI, review, audit and Feature Gate
      evidence plans are explicit
