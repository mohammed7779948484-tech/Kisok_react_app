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
