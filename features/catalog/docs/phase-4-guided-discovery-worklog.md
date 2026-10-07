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
