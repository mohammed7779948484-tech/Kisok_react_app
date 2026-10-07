# Phase 4 — execution evidence

Baseline before any change (develop @ fd77e4f): `pnpm typecheck` clean; `pnpm test` 97 suites / 1241 tests PASS.

## A1 — AddToCartButton controlled quantity

- Mode: behavior. Scaffold: N/A (existing component). Implementer: feature-implementer; Lead verified.
- RED: `pnpm exec jest features/catalog-cart-integration/components/add-to-cart-button.test.tsx` →
  2 new tests failed with `Unable to find an element with role: button, name: Add 3 to cart`
  (the prop was ignored; button showed its internal 1). 8 existing tests green.
- GREEN: `pnpm exec jest features/catalog-cart-integration` → 5 suites / 53 tests passed.
- Checks: eslint clean, prettier clean, typecheck clean.
- Diff review (Lead): optional `quantity`/`onQuantityChange`; one setter routes to the
  callback when controlled; uncontrolled path unchanged; stock clamping untouched.
- GATE: PASS

## A2 — CatalogGrid extraData / bottomInset / accessibility passthrough

- Mode: behavior. Scaffold: N/A (existing component). Implementer: Lead.
- RED: 3 new tests in `catalog-grid.test.tsx` ("selection grids") failed:
  `Expected: > 3 Received: 3` (no re-render on extraData), `Expected: "radiogroup" Received: undefined`,
  contentContainerStyle paddingBottom 40 ≠ 120.
- GREEN: `pnpm exec jest features/catalog/components/catalog-grid.test.tsx` → 17 passed.
- Checks: typecheck clean; eslint clean; prettier clean after `--write` on the test.
- GATE: PASS

## B1 — guided-discovery model

- Mode: behavior. Scaffold: N/A (pure domain model). Implementer: feature-implementer; Lead
  verified and extended in-task.
- RED: against a typed stub, `pnpm exec jest features/catalog/model/guided-discovery.test.ts`
  → 28 failed / 1 passed (assertion failures, not import errors).
- GREEN: 29 passed. Fixture mirrors the real catalog shape (4 roots, single-Flavor vapes with
  shared/drifted spellings, pouches with fixed Strength, title-only variants, sold-out items).
- Lead review found two gaps, fixed in this task test-first:
  - term ignored product/brand names ("focus" → false no-match): RED `Expected - 3 / Received + 1`;
  - suggestions repeated an answered option type: RED `Expected value: not "Cool mint"`
    (first version of that test was vacuous — it never reached the text step; rewritten).
- GREEN after fixes: `pnpm exec jest features/catalog/model` → 99 passed. eslint/prettier clean.
- Decisions accepted: the 8-value tap cap applies to brand too; malformed `match` entries ignored.
- GATE: PASS

## A3 — Option Browser, lifted quantity, Back handling

- Mode: behavior-change. Scaffold (Lead): `pnpm generate component catalog option-browser
--screen=product-detail` → `components/option-browser.tsx` (placeholder replaced).
- Implementer: feature-implementer; Lead verified and fixed one defect in-task.
- RED: `pnpm exec jest features/catalog/screens/product-detail` → 9 failed / 29 passed
  (new copy, `browseOrder is not a function`, `Unable to find … Browse all 30 flavors`).
- GREEN: 38/38; mutation checks (drop `browseOrder`, drop controlled quantity, drop the Back
  handler) each fail their tests.
- Lead review defect: the landscape context column used a full-width square image above the
  Order Bar in a non-scrolling column — at 1280×800 a selected option with its stepper would
  push the Order Bar off-screen (violates GD-02). Fixed: the image takes only leftover height
  (`flex-1`, `maxHeight` 400). Jest runs portrait, so this is verified at runtime, not here.
- Affected: `pnpm exec jest features/catalog` → 30 suites / 341 passed; typecheck 0 errors;
  eslint/prettier clean.
- Not covered by jest: split layout (≥900) and column counts — runtime check pending;
  Back handling with real navigator focus — device check pending.
- GATE: PASS

## B2 — Help Me Choose screen + route

- Mode: behavior. Scaffold (Lead): `pnpm generate screen catalog help-me-choose`;
  `pnpm generate route catalog help-me-choose --role=customer --screen=help-me-choose`
  (export added to `features/catalog/index.ts`). Implementer: feature-implementer; Lead verified.
- RED: placeholder → 18 failed (`Unable to find an element with role: link, name: KISOK Test
Store, explore the store`). GREEN: 18 passed, zero console output; mutation checks on
  reconcile and Clear each fail their tests.
- Scope trim (Lead): Home chips will start Help Me Choose scoped by root category instead of a
  `start` dimension — in the real catalog a Flavor tap question would list ~200 values.
- Runtime (web, real-shaped catalog — see "Runtime harness" below) found and fixed:
  - split layout inverted at 1280 (web ScrollView grew in the row) → pinned column width;
  - suggestions were noise with real data (unique flavours) → only values shared by ≥2
    products (model rule + tests updated, behavior-change);
  - card copy "Matched Matching · 1 option" → "Matched Your choices · 1 option".
- After fixes: `pnpm exec jest features/catalog` → 30 suites / 362 passed; typecheck 0; lint clean.
- GATE: PASS

## B3 — `match` hand-off into Product Detail

- Mode: behavior. Scaffold: N/A (existing files). Implementer: Lead.
- RED: PD "opened from Help Me Choose" — order and "N flavors match your choices." absent
  (2 failed; the ignore-non-matching test passed as expected); HMC hand-off — params lacked
  `match`.
- Implementation: `productDetailHref(id, backLabel, match)`; route reads `match`; Product
  Detail orders matching available variants first (preview and browser) and states the count;
  never selects; a non-matching term is never serialised.
- GREEN: catalog suite 362 passed; runtime: Help Me Choose → "mint" → Geekbar 25k opened with
  `match=t.mint`, "1 variation matches your choices." and the match first.
- GATE: PASS

## Runtime harness (evidence method)

No Customer credentials exist in this environment. The real app ran under `pnpm web`
(Metro dev, CI mode) driven by Playwright with network mocks: a stored session, the
`current_active_profile` RPC returning a customer, and `get_customer_catalog_v2` returning a
v2 snapshot generated from REAL Test_kisok labels (read-only query): UT 50K (46), Geekbar 25k
(40, many unavailable), 7-Hydroxy (30 titled), Zyn 9mg (16, Flavor+Strength), Zyn 15mg,
Perks, Pebble. Sizes: 1280×800, 768×1024, 600×900. All scenarios: zero page errors.

- Product Detail: preview 6 + "Browse all 46 variations"; browser 3 columns at 1280 after
  tuning (`TILE_MIN_WIDTH` 280→230); Order Bar visible with selection + quantity; search
  "mint" → 3 of 46 with unavailable marked; closing the browser keeps "Add 3 to cart" at all
  three sizes.

## B4 — entry points (GD-09)

- Mode: behavior-change. Scaffold (Lead): `pnpm generate component catalog help-me-choose-pill`
  → `components/help-me-choose-pill.tsx`. Implementer: feature-implementer; Lead verified.
- RED: 23 failed / 126 passed (`Unable to find … button, name: Help me choose`, clearance
  constant undefined, cart button absent on `/help-me-choose`).
- GREEN: `pnpm exec jest features/catalog features/catalog-cart-integration` → 31 suites /
  375 passed; typecheck 0; eslint/prettier clean.
- Delivered: extended pill (Compass + "Help me choose", `bg-card`, secondary to the filled
  cart), opt-in `CatalogShell` prop, scoped on Category/Brand detail, bottom clearance on the
  5 screens; Home panel → Help Me Choose CTA + root-category quick starts (option-type text
  search chips removed); `/help-me-choose` added to `CATALOG_BROWSING_ROUTES`.
- Lead check: `Screen` default edges exclude bottom, so `insets.bottom + 16` is not doubled.
- Runtime (1280×800, 768×1024): Home panel renders; pill bottom-right on Products, readable,
  not competing with Cart; pill → `/help-me-choose`; cart access present there; zero errors.
- GATE: PASS
