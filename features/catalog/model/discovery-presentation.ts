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
 * Returns a concise option count badge string if product has multiple variants
 * e.g. "43 flavors" if primary dimension is Flavor, or "12 options" otherwise.
 */
export function formatProductOptionCount(product: CatalogProductView): string | null {
  const count = product.variants.length;
  if (count <= 1) return null;

  // Check if variants are primarily differentiated by an option type like "Flavor"
  const firstVariant = product.variants[0];
  const firstOption = firstVariant?.options[0];
  if (firstVariant && firstOption && firstVariant.options.length === 1) {
    const dimName = firstOption.type.name.toLowerCase();
    if (dimName === "flavor") {
      return `${count} flavors`;
    }
  }

  return `${count} options`;
}
