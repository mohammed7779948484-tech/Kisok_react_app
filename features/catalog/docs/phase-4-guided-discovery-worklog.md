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
