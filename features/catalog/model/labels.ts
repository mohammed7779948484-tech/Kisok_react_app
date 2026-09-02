/**
 * Catalog copy helpers — tiny, pure, and feature-internal.
 *
 * Consolidation history (T03-R02 → F-R01): the "1 product / N products"
 * count-label helper was accepted as duplicated across the T03 entity cards
 * until a FIFTH consumer appeared, which is the revisit threshold the T03
 * review documented. The final feature review's F-R01 triggered that revisit:
 * the five copies (brand card, category card, Products screen, Brand Detail,
 * Category Detail) are now this one helper. It stays inside `features/catalog`
 * — deliberately NOT promoted to the shared design system under root
 * `components/` — because the phrasing is Catalog-specific product-count copy
 * pinned by this feature's tests, not a reusable primitive. A second feature
 * needing the same sentence is the promotion signal, and it would be a
 * breaking-copy decision, not a mechanical one.
 *
 * Pure module: no IO, no state, no imports — safe for every layer of the
 * feature to import (model, components, screens).
 */

/**
 * A derived product count, spoken in words. Singular for exactly 1, plural
 * otherwise; the count itself is always a number the view DERIVED — never
 * invented here.
 */
export function productCountLabel(count: number): string {
  return count === 1 ? "1 product" : `${count} products`;
}
