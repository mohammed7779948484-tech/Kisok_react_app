import type { CatalogProductView } from "./catalog-view";

/**
 * The option types that actually distinguish a product's variants, in the
 * order the catalog defines them. A type with one value across every variant
 * ("Strength: 6mg" on all of them) is a fact about the product, not a choice.
 */
export function varyingOptionTypes(product: CatalogProductView): string[] {
  const valuesByType = new Map<string, { name: string; order: number; values: Set<string> }>();
  for (const variant of product.variants) {
    for (const option of variant.options) {
      const entry = valuesByType.get(option.type.id) ?? {
        name: option.type.name,
        order: option.type.display_order,
        values: new Set<string>(),
      };
      entry.values.add(option.value.id);
      valuesByType.set(option.type.id, entry);
    }
  }
  return [...valuesByType.values()]
    .filter((entry) => entry.values.size > 1)
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.name);
}

/** "Flavor" / "Count · Flavor · +2 more" — at most two names, then a count. */
export function optionTypeSummary(product: CatalogProductView, visible = 2): string | null {
  const names = varyingOptionTypes(product);
  if (names.length === 0) return null;
  const shown = names.slice(0, visible).join(" · ");
  return names.length > visible ? `${shown} · +${names.length - visible} more` : shown;
}

/** "4 options" / "1 option". The count is the product's real variant count. */
export function optionCountLabel(product: CatalogProductView): string {
  const count = product.variants.length;
  return count === 1 ? "1 option" : `${count} options`;
}

export function availableVariantCount(product: CatalogProductView): number {
  return product.variants.filter((variant) => variant.is_available).length;
}

/** The product-level availability line, truthful for one variant or many. */
export function productAvailabilityLabel(product: CatalogProductView): string {
  if (!product.isAvailable) return "Currently unavailable";
  return product.variants.length <= 1 ? "Available" : "Options available";
}

/** The product's primary category (the first listed), for eyebrows and crumbs. */
export function primaryCategory(product: CatalogProductView) {
  return product.categories[0] ?? null;
}
