# Phase 4 — Help Me Choose and large variant sets

Status: READY

The Catalog feature gate (rounds 1–5) is closed; this phase is a new delivery on
top of it, kept in its own control document like `features/cart/docs/phase-3.md`.
Evidence goes to `phase-4-guided-discovery-worklog.md`. The staff sign-out half
of the same customer-experience change lives in `features/maintenance/docs/`.

## Brief

Customers stand at a store tablet without knowing exact product or variant
names, and most products carry many variants. Two outcomes:

1. **Help Me Choose** — a deterministic, catalog-derived guided finder that
   narrows the real catalog to products with an available variant that truly
   matches every answer.
2. **Large variant sets** — Product Detail must use the tablet's space instead
   of a height-capped inner scroller.

### Acceptance criteria

| ID    | Criterion                                                                                                                                                                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GD-01 | A product with ≤6 choices behaves exactly as before. With 7+ choices the Choice Canvas shows a 6-choice preview and a "Browse all N …" action (`catalog-option-show-all`) that opens the Option Browser; the in-place expand and in-place rack search are gone.                                |
| GD-02 | The Option Browser fills the content area: a single-scroll grid of the same option tiles (2–3 columns landscape, 2 portrait, 1 compact), search when >10 choices with a live count, available choices first, and the Order Bar (selection, quantity, Add) always on screen.                    |
| GD-03 | Leaving the browser ("Back to product" or Android Back) returns to the split view. The selected variant **and the chosen quantity** survive opening/closing the browser; quantity resets only when the selected variant changes or after a successful add.                                     |
| GD-04 | Help Me Choose (`/help-me-choose`) asks catalog-derived questions — root category first, then brand or a low-cardinality option type chosen by a deterministic score, then a free-text "Anything specific?" step — and shows live results that are tappable at any moment.                     |
| GD-05 | A product is a result only when one **available** variant satisfies every option answer and the text term together; category and brand are product-level. Every tap value shown leads to at least one product, with a product count.                                                           |
| GD-06 | Answers can be skipped, changed and removed; removing only widens. A free-text term with no match is a recoverable state: it is announced, other answers are preserved, the term stays editable/clearable, clearing restores the previous set, and it is never passed on.                      |
| GD-07 | A catalog refresh reconciles answers (unknown values dropped, trailing answers dropped until non-empty) and announces the change.                                                                                                                                                              |
| GD-08 | Opening a result passes the committed answers to Product Detail, which lists matching choices first (preview and browser) and says how many match. Nothing is auto-selected.                                                                                                                   |
| GD-09 | Entry points: the Home "Guided discovery" panel becomes a Help Me Choose entry (its chips start at that question); a floating "Help me choose" pill appears on Products, Categories, Category detail, Brands and Brand detail (scoped to the category/brand on detail pages) and nowhere else. |

Out of scope: dimension chips in the browser, a Search inline entry, synonym or
flavour taxonomies, backend/schema/RPC changes, a header tab, persisted or global
Help Me Choose state.

## Real-catalog evidence that shaped the plan

Read-only inspection of the linked `Test_kisok` project (snapshot visibility
rules mirrored): 15 visible products, 299 variants, median 16 variants per
product (max 46); 13 of 15 products exceed the 6-choice preview. The dominant
shape is one Flavor dimension with 8–46 values; the multi-dimension products are
sparse and fully titled. Flavor has 206 values with only 23 shared across
products and inconsistent spellings, so a flavour tap question is replaced by a
free-text step over variant text. Brand is the best second split for vapes.
22% of variants are out of stock.

## Design decisions

- D1 **One model file**: `model/guided-discovery.ts` (answers, candidates,
  question scoring, text matching, reconcile, `match` parse/serialise,
  `matchingVariantIds`). No generic facet abstraction.
- D2 **Variant text** for free text: normalised option values + `title_override`
  - variant `search_keywords` (variants without option links still match).
- D3 **Scoring**: candidates = products with ≥1 available variant satisfying the
  committed answers. Tap dimension eligible if ≥2 values, coverage ≥ ½|C| and
  largest bucket < coverage; option types are tap-able only with ≤8 values among
  candidates; choose the smallest largest bucket; ties: option types before brand,
  then `display_order`, then id. Category first when ≥2 roots have candidates.
- D4 **Option Browser is screen-local state** of Product Detail, built on
  `CatalogGrid` (additive `extraData`/`accessibilityRole`), never a route or sheet.
- D5 **Quantity is lifted** into `ProductDetailScreen` through an optional
  controlled `quantity`/`onQuantityChange` pair on `AddToCartButton`
  (catalog-cart-integration; uncontrolled callers unchanged).
- D6 **Pill** is an opt-in `CatalogShell` prop; screens reserve bottom clearance.

## Tasks

| Task | Mode            | Acceptance  | Scope                                                                                                              | Scaffold                                                                 |
| ---- | --------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| A1   | behavior        | GD-03       | `AddToCartButton` optional controlled quantity + tests                                                             | N/A — existing component                                                 |
| A2   | behavior        | Supp. GD-02 | `CatalogGrid` additive `extraData` / `accessibilityRole` + test                                                    | N/A — existing component                                                 |
| A3   | behavior-change | GD-01–03    | Option Browser component, Product Detail browsing state, lifted quantity, Back handling, rack/canvas/decision copy | `pnpm generate component catalog option-browser --screen=product-detail` |
| B1   | behavior        | GD-04–07    | `model/guided-discovery.ts` + tests (fixtures shaped like the real catalog)                                        | N/A — pure domain model                                                  |
| B2   | behavior        | GD-04–07    | Help Me Choose screen + route                                                                                      | `pnpm generate screen …` then `pnpm generate route …`                    |
| B3   | behavior        | GD-08       | `match` param on `productDetailHref`/route; matching-first ordering and count in Product Detail                    | N/A — existing files                                                     |
| B4   | behavior-change | GD-09       | Home panel rework; pill + `CatalogShell` opt-in; 5 screens opt in; `CATALOG_BROWSING_ROUTES`                       | `pnpm generate component catalog help-me-choose-pill`                    |

Dependencies: A3 after A1+A2; B2 after B1; B3 after A3+B1; B4 after B2.

Files outside `features/catalog`: `features/catalog-cart-integration`
(`add-to-cart-button.tsx`, `catalog-cart-provider.tsx`), `app/(customer)/`
(`help-me-choose.tsx`, `product-detail.tsx`).

## Risks

- The Maestro release flow taps `catalog-option-show-all` then
  `catalog-option-available-*`; both testIDs are kept.
- Substring matching does not understand synonyms ("fruity"); documented limit.
- FlashList remounts on column change; selection and quantity live in screen
  state, so they survive.

## Verification

Per task: focused tests, `pnpm typecheck`, `pnpm lint`. Phase: `pnpm verify`,
web at 1280×800 / 1024×768 / 768×1024 / narrow, CI on the PR head, independent
review and quality audit. Android device behaviour is recorded as verified or
explicitly unverified.

## Todo

| Task | Gate    |
| ---- | ------- |
| A1   | PASS    |
| A2   | PASS    |
| A3   | PENDING |
| B1   | PASS    |
| B2   | PENDING |
| B3   | PENDING |
| B4   | PENDING |
