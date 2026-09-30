import type { CatalogProductView } from "./catalog-view";

export type FeaturedLayoutMode = "none" | "spotlight" | "showcase" | "grid";

export function deriveFeaturedLayout(featuredProducts: readonly CatalogProductView[]): {
  mode: FeaturedLayoutMode;
  items: CatalogProductView[];
  spotlightProduct?: CatalogProductView;
} {
  const count = featuredProducts.length;

  if (count === 0) {
    return { mode: "none", items: [] };
  }

  const firstProduct = featuredProducts[0];
  if (count === 1 && firstProduct) {
    return {
      mode: "spotlight",
      items: [firstProduct],
      spotlightProduct: firstProduct,
    };
  }

  if (count <= 4) {
    return {
      mode: "showcase",
      items: [...featuredProducts],
    };
  }

  return {
    mode: "grid",
    items: [...featuredProducts],
  };
}

/**
 * Returns a truthful concise option count badge string if product has multiple variants.
 * Only returns "X flavors" when every variant has a single clean Flavor option and all
 * flavor values are distinct. Otherwise uses generic truthful count "X options".
 */
export function formatProductOptionCount(product: CatalogProductView): string | null {
  const count = product.variants.length;
  if (count <= 1) return null;

  // Check if every variant cleanly has exactly one option of type "flavor"
  const allSingleFlavor = product.variants.every(
    (variant) =>
      variant.options.length === 1 &&
      variant.options[0]?.type.name.trim().toLowerCase() === "flavor",
  );

  if (allSingleFlavor) {
    const distinctFlavorIds = new Set(
      product.variants.map((variant) => variant.options[0]?.value.id),
    );

    // Only claim "X flavors" if each variant represents a unique flavor value
    if (distinctFlavorIds.size === count) {
      return `${count} flavors`;
    }
  }

  return `${count} options`;
}

export type DiscoveryOptionType = { id: string; name: string; productCount: number };

/**
 * Option types that customers genuinely choose between somewhere in the
 * catalog, most widespread first. A type offered with a single value on every
 * product is a spec, not a way to discover, so it is left out.
 */
export function deriveDiscoveryOptionTypes(
  products: readonly CatalogProductView[],
): DiscoveryOptionType[] {
  const byType = new Map<string, { name: string; order: number; products: Set<string> }>();
  for (const product of products) {
    const valuesByType = new Map<string, Set<string>>();
    for (const variant of product.variants) {
      for (const option of variant.options) {
        const values = valuesByType.get(option.type.id) ?? new Set<string>();
        values.add(option.value.id);
        valuesByType.set(option.type.id, values);
        if (!byType.has(option.type.id)) {
          byType.set(option.type.id, {
            name: option.type.name,
            order: option.type.display_order,
            products: new Set(),
          });
        }
      }
    }
    for (const [typeId, values] of valuesByType) {
      if (values.size > 1) byType.get(typeId)?.products.add(product.id);
    }
  }
  return [...byType.entries()]
    .filter(([, entry]) => entry.products.size > 0)
    .sort(
      ([, left], [, right]) => right.products.size - left.products.size || left.order - right.order,
    )
    .map(([id, entry]) => ({ id, name: entry.name, productCount: entry.products.size }));
}
