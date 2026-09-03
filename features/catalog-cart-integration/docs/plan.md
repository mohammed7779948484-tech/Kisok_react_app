# CatalogCartIntegration — implementation plan

**HOW the brief gets built.** Written with the `kisok-feature-plan` skill
after research, and before generating anything beyond this workspace.

Status: `READY`

The Lead Planning Review was performed (2026-09-03) across the assignment's
review axes — requirements coverage (every requested behavior has an AC; no
Checkout/server-cart/multi-device scope leaked), dependencies (Catalog + Cart
both proven merged in develop 62f3634; public APIs only; no PR #7 code),
architecture (one cart model, no mirrored state, TanStack-owned catalog
reads, thin layout), mapping (no option-value duplication, unavailable
cannot be added, no forbidden fields), routing (`/cart` untouched and reused
via public push; catalog history semantics unchanged), UI (existing
primitives; QuickCartSheet reused; no new shared primitive), and tests
(RED-first everywhere; deterministic + live coverage). One correction made
during the review: the public API surface was narrowed (design decision 2
note) — the mapping function stays feature-internal; only
`CatalogCartProvider`, `AddToCartButton`, and the `CatalogCartSource` type
are public.

`DRAFT` → no implementation task may start. Set `READY` only when the checklist
at the bottom of this file is fully satisfied. If a material decision changes
later — an acceptance criterion, the shape, a dependency, a scaffold — return to
`DRAFT`, reconcile this file and `todo.md`, then restore `READY`.

There is no fourth gate: `TASK`, `ROUND` and `FEATURE` are the gates. This
status is the implementation-readiness signal.

## Feature shape (named early)

**Integration / composition feature** — the seam between two merged features.
It owns a pure mapping model, an experience-level provider (React context,
NOT a store), two action components, and two sanctioned edits in the merged
features. No `api/`, no `queries/`, no `mutation/`, no `state/` store, no
screen, no route of its own: the catalog read stays Catalog's
(`useCatalog`), the cart model stays Cart's (single Zustand store + public
hook/actions), and the only route involved (`/cart`) already exists.

## Research synthesis

- **Data contract (negative, verified)**: this feature needs NO backend
  change. All 16 tables / 22 functions in `supabase/migrations/*.sql` are
  untouched; the customer cart is local-only by the merged Cart contract
  (no server cart, no cart RPC, no Realtime — `docs/product-boundaries.md`,
  cart brief "Out of scope"). The hosted TEST database is read through the
  merged Catalog pipeline only, and never mutated by this feature.
- **Cart public seam** (`features/cart/index.ts`, read directly):
  `useCart()` (THE hydration owner — mounts `useActiveProfile()`, hydrates
  the single store on profile-id change), plain actions
  (`addItem`/`hydrateCart`/…), `QuickCartSheet` (controlled
  `open`/`onOpenChange` + optional `onViewFullCart` routing intent —
  "the caller (the future customer shell, post 'Add to cart') owns when the
  sheet appears"), `AddToCartInput` type, and the deliberate
  cleanup-registration module side-effect of importing the index.
- **Cart line contract** (`features/cart/model/cart-line.schema.ts`):
  `variantId`, `productId`, `productDisplayName`, `variantLabel`,
  `optionSelections[{optionTypeId, optionValueId, optionValueLabel}]`,
  `imageUri|null`, `quantity` 1–99 — `addToCartInputSchema` validates at
  `addItem()`; invalid input is a logged no-op, never a crash.
- **Caption composition hazard** (`features/cart/components/cart-item-row.tsx:66-69`):
  the row renders `[variantLabel, ...optionSelections.map(s =>
s.optionValueLabel)].join(" · ")`. Catalog's own variant label for
  option-backed variants IS the joined option pairs
  (`features/catalog/model/catalog-view.ts:238-245`:
  `title_override || options.map(o => o.label).join(", ") || "Standard
option" || "Option N"`), so naively mapping `variant.label` produces the
  duplicated caption the brief forbids ("Flavor: Watermelon · Watermelon").
- **Line identity + merge** (`features/cart/model/cart-rules.ts`):
  `deriveLineId` = `variantId|sorted optionValueIds`; same lineId sums
  quantities (display snapshot of the ORIGINAL line is kept). The
  integration must derive inputs that let these rules work unchanged.
- **R-FR-05 carry-forward** (cart review.md): the sign-out cleanup
  registration is a module-load side-effect; "the future Catalog customer
  shell… imports @/features/cart for QuickCartSheet/addItem — module loaded
  at shell level, cleanup always registered". This integration IS that
  shell-level load point.
- **Adaptive sheet** (`components/ui/adaptive-sheet.tsx`): expanded
  (landscape) → right side panel; compact/medium → bottom sheet; needs
  `PortalHost` (present at `app/_layout.tsx` root). The reused
  `QuickCartSheet` inherits both modes and the dialog a11y role.
- **Affordance primitives**: `Button` (`size="icon"` = 48dp touch),
  `Badge` ("Colour is never the only signal — a Badge always carries text",
  `docs/design-system.md:152`), `Text`; no FAB primitive exists and none is
  added — the integration composes an absolutely-positioned affordance from
  the existing primitives inside its own provider.
- **Layout mount point** (`app/(customer)/_layout.tsx`): a 13-line thin
  Stack with no logic — the sanctioned provider mount. `usePathname`/
  `useRouter` from expo-router work at layout level.
- **ESLint boundaries** (`eslint.config.mjs:26-30`): `@/features/<name>`
  public-only imports; `@/features/*/*` deep imports are errors. Planned
  directions — integration → `@/features/cart`; Product Detail →
  `@/features/catalog-cart-integration`; layout →
  `@/features/catalog-cart-integration` — are all public-surface imports.
- **Test harness**: `core/testing` renders with providers
  (Query/Auth/Storage fakes); the cart suites demonstrate the pattern for
  store-backed components and both AdaptiveSheet frames via
  `Dimensions.set`.

## Design decisions

1. **The integration owns ONE experience-level provider, not per-screen
   wiring.** `CatalogCartProvider` mounts once in the customer layout:
   it renders `useCart()` (session-wide hydration — the hook IS the
   sanctioned hydration owner), owns the ephemeral Quick Cart open state,
   renders the `QuickCartSheet` (via the public component) and the
   persistent cart affordance. _Rejected_: wiring hydration/Add/open state
   into every Catalog screen — duplicates state ownership across six
   surfaces and re-creates the exact drift the cart plan forbids; also
   rejected: a second Zustand store for quick-cart open state (ephemeral UI
   state; plain React context is the minimal correct tool).
2. **Add-to-cart is an integration-owned action component, rendered by the
   Catalog-owned Product Detail.** Product Detail computes a structural
   `CatalogCartSource` from its OWN resolved view (Catalog owns its
   shapes), and renders `<AddToCartButton source={…} />` from the
   integration's public API; the button maps the source to
   `AddToCartInput` (integration-owned pure mapper), calls the cart's
   public `addItem`, and opens the Quick Cart through the integration
   context. _Rejected_: Product Detail importing `@/features/cart` and the
   mapping directly — that spreads cart semantics into Catalog and leaves
   the mapping untested as a unit; also rejected: the integration importing
   Catalog view types (not exported publicly; deep import forbidden) —
   the structural source type is the boundary-legal contract between them.
3. **Caption mapping rule** (brief AC-04): `variantLabel` =
   trimmed `title_override` (verbatim, when present) | option-backed
   without override → the option TYPE names joined ", " (the values reach
   the caption only through `optionSelections`, which the cart row already
   renders) | no-option single variant → `"Standard option"` | no-option
   variant among several → `` `Option ${index+1}` ``. This mirrors
   catalog-view's own fallback semantics for the no-option families while
   eliminating the mechanical duplication for option-backed ones.
   _Rejected_: mapping Catalog's `variant.label` verbatim (produces
   "Flavor: Watermelon · Watermelon"); omitting `optionSelections` in
   favour of a composed label (breaks the cart's line-identity and merge
   contract — the assignment requires the selections).
4. **`imageUri` = the variant's `primaryMedia?.secureUrl ?? null`** — the
   same image Product Detail shows as active (variant primary, product
   cover fallback, none). _Rejected_: always the product cover (ignores
   variant-specific media the customer just inspected).
5. **The persistent affordance is an absolutely-positioned cart button with
   a text-carrying `Badge`, rendered by the provider, hidden on `/cart`**
   (via `usePathname`) — available on every customer browsing surface
   including Product Detail, where the Catalog's root navigation does not
   render. Badge shows the count only when > 0 (the button alone signals
   the empty case; opening it shows the honest empty state). _Rejected_:
   editing `CatalogNavigation` to add a cart destination (root-screens
   only — misses detail screens); a global header/footer bar (restructures
   every merged Catalog screen's visual hierarchy); hiding nothing on
   `/cart` (a cart button on the full cart screen is a redundant no-op).
6. **Add always sends quantity 1** (quantity control stays in the cart —
   the merged UX guard caps at 99). _Rejected_: a quantity stepper on
   Product Detail (brief: "Cart controls remain local").
7. **The Add action is disabled when the selected variant is unavailable,
   the cart is locked, OR the cart is not yet hydrated** (honest disabled
   state, exposed as accessibility state; the store no-ops anyway — this
   is defense in depth). Unavailable variants stay fully selectable for
   inspection. The `hydrated === false` window is REAL (the durable read
   is async; a press in that window would be a logged no-op — the F-R1-1
   round-review finding), and disabling is safe because `hydrate()`
   terminates with `hydrated: true` on every path, so there is no
   permanent-disable risk. _Rejected_: hiding the Add button when
   unavailable (the affordance's existence must be stable; brief AC-02);
   also rejected: leaving the pre-hydration window unguarded (the
   silent-no-op class AC-01 forbids; the cart renders controls disabled
   rather than ignoring taps for exactly this class).
8. **`onViewFullCart` = `router.push("/cart")` owned by the provider** —
   the QuickCartSheet contract explicitly leaves routing to the caller.
   _Rejected_: the sheet navigating itself (its own doc comment forbids a
   router import).
9. **The sign-out cleanup question is solved by import structure, not new
   code**: mounting the provider imports `@/features/cart` (public index)
   at customer-experience level, which loads the cart module and its
   cleanup registration for the whole session — closing Cart's R-FR-05
   carry-forward. _Rejected_: re-registering cleanup from the integration
   (duplicate registration path; the cart owns it).

## Data contract

No new RPCs, tables, grants, or Realtime publications. The complete
server-surface of this feature is the already-merged customer catalog read:

| Surface                           | Direction | Role     | Defined by                                                     | Used by this feature                                            |
| --------------------------------- | --------- | -------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| `get_customer_catalog()` (RPC)    | read      | customer | `supabase/migrations/20260826050006_lean_customer_catalog.sql` | indirectly, through the merged `useCatalog` — never called here |
| hosted TEST Supabase auth/profile | read      | customer | `docs/environment.md`                                          | indirectly, through merged `core/auth`                          |

The cart side is purely local: `@/core/storage` keys owned by the merged
cart store. No network call for cart state exists or is added (pinned by
tests + live network log).

## Feature shape decision

| Capability   | Needed? | Evidence / reason                                                                                                                     |
| ------------ | ------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| model/schema |      NO | no new data crosses a runtime boundary into this feature; the cart's `addToCartInputSchema` validates the mapped input at `addItem()` |
| query        |      NO | the catalog read is the merged Catalog feature's `useCatalog`                                                                         |
| mutation     |      NO | nothing is written to any server                                                                                                      |
| store        |      NO | the cart Zustand store stays THE single model; quick-cart open state is ephemeral UI state (React context, plan decision 1)           |
| component    |     YES | provider + two action components — real UI the layout and Product Detail render                                                       |
| screen       |      NO | no new screen; `/cart` already exists (Cart's)                                                                                        |
| realtime     |      NO | customer role; Realtime is Preparation-only                                                                                           |
| route        |      NO | no new route file; the only route edit is the sanctioned thin provider mount in the EXISTING `app/(customer)/_layout.tsx`             |

## Capabilities to generate

| Generator command                                                        | Task |
| ------------------------------------------------------------------------ | ---- |
| `pnpm generate component catalog-cart-integration catalog-cart-provider` | T02  |
| `pnpm generate component catalog-cart-integration add-to-cart-button`    | T03  |
| `pnpm generate component catalog-cart-integration cart-access-button`    | T04  |

## Allowed manual files

- `features/catalog-cart-integration/model/add-to-cart-mapping.ts` (+ test)
  — a pure mapper (the sanctioned manual category); no generator
  capability produces feature mappers.
- `features/catalog-cart-integration/components/quick-cart-context.tsx` —
  the React context + hook for the ephemeral open state; no generator
  capability produces contexts (kept separate from the provider file to
  keep the import graph acyclic: provider → affordance → context, provider
  → sheet, button → context).

## Files expected to change outside `features/catalog-cart-integration/`

Exactly two, both plan-justified (brief AC-11):

| File                                                                                                     | Change                                                                                                                                        | Justification                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/(customer)/_layout.tsx`                                                                             | wrap the customer `Stack` in `<CatalogCartProvider>` (import + JSX wrapper; stays thin — no logic moves in)                                   | the provider must be experience-level for session-wide cart readiness + persistent affordance; the layout is the composition point expo-router gives                                                             |
| `features/catalog/screens/product-detail/product-detail-screen.tsx` (+ `product-detail-screen.test.tsx`) | build the structural `CatalogCartSource` from the resolved product/variant and render `<AddToCartButton source={…} />` below the variant list | the Add action lives on Product Detail (the owning Catalog screen); the edit consumes ONLY the integration's public API — this is the plan-sanctioned owning-feature edit, not a deep import in either direction |

Nothing else outside the feature directory. `features/catalog/**` (beyond
the one screen + its test), `features/cart/**`, `core/**`,
`components/**`, `supabase/**`, `tools/**` are untouched. The generator
appends nothing to any shared registry (components are feature-local).

## Routes

No route is created or replaced. `/cart` remains Cart's route
(`app/(customer)/cart.tsx`); the provider's `View Full Cart` intent
navigates to it via the public router (`router.push("/cart")`).

## Required skills per task

| Task | Skills                                                                              |
| ---- | ----------------------------------------------------------------------------------- |
| T01  | test-driven-development                                                             |
| T02  | test-driven-development, kisok-design-system, expo-router                           |
| T03  | test-driven-development, kisok-design-system, kisok-react-native-rules              |
| T04  | test-driven-development, kisok-design-system, kisok-react-native-rules, expo-router |
| T05  | test-driven-development, kisok-code-review (self-check), expo-router                |

## Test strategy

- **Mapping unit tests (T01)** — the four variant families pinned
  (override verbatim; option-backed → type names as label + values ONLY in
  `optionSelections`; "Standard option"; "Option N"); the anti-duplication
  invariant: composing the caption exactly as `CartItemRow` does
  (`[variantLabel, ...optionValueLabels].join(" · ")`) contains each
  option value EXACTLY once; `imageUri` fallback chain; `quantity === 1`;
  output key-set exactly equals the `AddToCartInput` contract (forbidden
  field pins: no price/brand/category/sku/barcode/stock).
- **Provider tests (T02)** — hydration effect fires for the active
  profile (the mounted `useCart()`); sheet open state flips; sheet
  rendered through the public `QuickCartSheet` with `onViewFullCart`
  wired to `router.push("/cart")`; a real add through the public action
  produces a visible line and updated total (behavior, not mock-call
  counts); cart-module import observed (cleanup registration — R-FR-05
  closure, asserted through the public import path).
- **Product Detail integration tests (T03)** — RED: Add action absent
  today; then: available variant → enabled, press → `addItem` with the
  mapped input + quick cart opens; unavailable variant → disabled, press
  does nothing to the cart; locked cart → disabled; the rest of the screen
  unchanged (existing suite keeps passing; the merged Catalog tests are
  the regression net for scope discipline).
- **Affordance tests (T04)** — rendered on browsing routes, absent on
  `/cart` (pathname), press opens the sheet WITHOUT any cart mutation,
  badge equals the cart's `totalQuantity` from the single model (no
  mirrored state — asserted by subscribing one source), badge text carries
  the count, both layout frames.
- **Convergence tests (T05)** — add same selection twice → merged line
  (quantity 2); different variant / different options → distinct lines
  (identity by the cart's own `deriveLineId` semantics, observed through
  the public store); reload-style re-hydration keeps lines; boundary
  scans: zero `@/features/cart/*` or `@/features/catalog/*` deep imports
  anywhere, zero Supabase imports in the integration; the public index
  surface pinned by key equality.
- **Live hosted journey** (feature-level evidence, Lead-executed): real
  sign-in → real catalog → real variant add → QuickCart → persistence →
  reload → sign-out/re-sign-in, at the three sizes, with console/network
  inspection (no cart server calls).

## Rounds and tasks

| Task | Mode     | Acceptance                                       | Objective                                                                      | Depends on | Entry evidence                                                                                                                              |
| ---- | -------- | ------------------------------------------------ | ------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | behavior | Supporting AC-03, AC-04                          | Pure `buildAddToCartInput` mapping model                                       | —          | RED: mapping tests fail (module/behavior absent) — e.g. "option-backed variant label contains no option value" and "override used verbatim" |
| T02  | behavior | Acceptance AC-01, AC-05; Supporting AC-08, AC-09 | Quick-cart context + experience provider (hydration, sheet, navigation intent) | —          | RED: provider test fails (no provider/hydration effect/open state)                                                                          |
| T03  | behavior | Acceptance AC-02, AC-03, AC-04, AC-05            | Add-to-cart action component + Product Detail wiring (owning-feature edit)     | T01, T02   | RED: Product Detail test fails — no Add action renders; and AddToCartButton test fails (component absent)                                   |
| T04  | behavior | Acceptance AC-06                                 | Persistent cart affordance + customer layout mount (thin)                      | T02        | RED: affordance test fails (component absent); layout test/grep fails (no provider mount)                                                   |
| T05  | behavior | Acceptance AC-07, AC-08, AC-11                   | Integration convergence: public API, cross-surface flow, boundaries            | T03, T04   | RED: convergence tests fail (public API empty; flows absent)                                                                                |

**Round 1** — T01 + T02 (mapping + shell: the seam exists, hydrated, and
sheet-capable, but nothing user-visible changes yet).
**Round 2** — T03 + T04 + T05 (the visible seam: Add on Product Detail,
persistent affordance, layout mount, public API, cross-surface truth).

The Lead runs each scaffold immediately before delegating its task; the
T03 Product Detail edit and T04 layout edit use no generator.

## Risks

| Risk                                                                          | Likelihood | Mitigation                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The provider wrapper breaks the customer Stack layout sizing on web export    | low        | the wrapper is a plain `flex-1` View; verified live in the export at all three sizes in Round 2; jest render via the route harness                                                                                                |
| `usePathname` returns unexpected values in the static export for group routes | medium     | affordance-hiding test covers the known route shapes; live verification walks every browsing route + `/cart`; fallback: the affordance hiding is cosmetic-only (a `/cart` → `/cart` push is a harmless no-op, but still verified) |
| Mapping drift if Catalog's label derivation changes later                     | low        | the mapping consumes STRUCTURAL fields (`title_override`, options, index), not Catalog's composed label; drift surface is the source adapter in Product Detail, covered by its tests                                              |
| Cart module-load side-effect lost via tree-shaking in the export              | low        | the provider calls `useCart()` (a real runtime dependency on the public module) — tree-shaking cannot drop it; pinned by the T02 registration test                                                                                |
| Quick Cart focus/dialog semantics regress under composition                   | low        | the sheet is the merged, tested public component; provider tests drive open/close through the same props CI already covers                                                                                                        |
| Merge-time conflicts with future parallel features on Product Detail          | medium     | the edit is additive (one import + one section + source adapter); declared here so any parallel feature can see it                                                                                                                |

## Verification

- Per task: focused jest suites, `pnpm typecheck`, scoped eslint/prettier.
- Per round: full `pnpm exec jest --ci --silent`, `pnpm verify`.
- Feature end: `pnpm export:web` + the REAL hosted TEST browser journey
  (Customer@gmail.com) at 1280×800, 800×1180, 480×900 — the journey list
  in the brief, including the caption-duplication check against real
  option-backed products, reload persistence, sign-out/re-sign-in, and a
  network log proving zero cart server calls. Native device tier: recorded
  UNVERIFIED if no device exists (current environment has none) — browser
  zoom is not claimed as OS font scaling.

## DRAFT → READY checklist

- [x] Acceptance criteria complete, stable IDs, each maps to ≥1 task
      (AC-01→T02/T04; AC-02→T03; AC-03→T01/T03/T05; AC-04→T01/T03/T05;
      AC-05→T02/T03; AC-06→T04; AC-07→T05; AC-08→T02/T05; AC-09→T02/T05;
      AC-10→T02/T03/T04 + live; AC-11→T04/T05)
- [x] Every task declares mode, acceptance link, entry evidence (RED)
- [x] Feature shape matrix complete; every YES justified; every NO reasoned
- [x] No task depends on an un-found contract (negative contract verified)
- [x] Every generator command mapped to a task (3 component commands)
- [x] Manual-only artifacts justified (mapper + context module)
- [x] Dependencies coherent (T03←T01,T02; T04←T02; T05←T03,T04)
- [x] Route mappings known (none created; `/cart` reused via public push)
- [x] Files changing outside the feature listed and justified (exactly two)
- [x] No unnecessary capability or folder planned
