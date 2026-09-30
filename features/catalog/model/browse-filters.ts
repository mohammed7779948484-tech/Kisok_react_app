import type { CatalogCategoryView, CatalogProductView, CatalogView } from "./catalog-view";

/**
 * Client-side refinement of a product set already in hand. Every facet and
 * count is derived from the products in scope, so a filter can never offer a
 * choice that leads to nothing.
 */
export type BrowseFilters = {
  availableOnly: boolean;
  /** Root category ids. A product matches through itself or a child category. */
  categoryIds: string[];
  brandIds: string[];
};

export type BrowseSort = "store" | "name";

export const EMPTY_FILTERS: BrowseFilters = { availableOnly: false, categoryIds: [], brandIds: [] };

export type FacetOption = { id: string; label: string; count: number };

export type BrowseFacets = {
  availableCount: number;
  categories: FacetOption[];
  brands: FacetOption[];
};

function rootIdOf(category: Pick<CatalogCategoryView, "id" | "parent_id">): string {
  return category.parent_id ?? category.id;
}

function rootCategoryIds(product: CatalogProductView): Set<string> {
  return new Set(product.categories.map(rootIdOf));
}

export function deriveFacets(
  products: readonly CatalogProductView[],
  view: CatalogView,
): BrowseFacets {
  const categoryCounts = new Map<string, number>();
  const brandCounts = new Map<string, number>();
  let availableCount = 0;

  for (const product of products) {
    if (product.isAvailable) availableCount += 1;
    for (const rootId of rootCategoryIds(product)) {
      categoryCounts.set(rootId, (categoryCounts.get(rootId) ?? 0) + 1);
    }
    if (product.brand) {
      brandCounts.set(product.brand.id, (brandCounts.get(product.brand.id) ?? 0) + 1);
    }
  }

  return {
    availableCount,
    // Store order, not count order: the catalog's own arrangement is the
    // familiar one on a store's floor.
    categories: view.rootCategories.flatMap((category) => {
      const count = categoryCounts.get(category.id);
      return count ? [{ id: category.id, label: category.name, count }] : [];
    }),
    brands: view.brands.flatMap((brand) => {
      const count = brandCounts.get(brand.id);
      return count ? [{ id: brand.id, label: brand.name, count }] : [];
    }),
  };
}

/** Drops selections that no longer exist in the facets (after a catalog refresh). */
export function reconcileFilters(filters: BrowseFilters, facets: BrowseFacets): BrowseFilters {
  const categoryIds = filters.categoryIds.filter((id) =>
    facets.categories.some((option) => option.id === id),
  );
  const brandIds = filters.brandIds.filter((id) =>
    facets.brands.some((option) => option.id === id),
  );
  if (
    categoryIds.length === filters.categoryIds.length &&
    brandIds.length === filters.brandIds.length
  ) {
    return filters;
  }
  return { ...filters, categoryIds, brandIds };
}

export function applyFilters(
  products: readonly CatalogProductView[],
  filters: BrowseFilters,
): CatalogProductView[] {
  return products.filter((product) => {
    if (filters.availableOnly && !product.isAvailable) return false;
    if (filters.brandIds.length > 0 && !filters.brandIds.includes(product.brand?.id ?? "")) {
      return false;
    }
    if (filters.categoryIds.length > 0) {
      const roots = rootCategoryIds(product);
      if (!filters.categoryIds.some((id) => roots.has(id))) return false;
    }
    return true;
  });
}

export function sortProducts(
  products: CatalogProductView[],
  sort: BrowseSort,
): CatalogProductView[] {
  if (sort === "store") return products;
  return [...products].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

export function activeFilterCount(filters: BrowseFilters): number {
  return (filters.availableOnly ? 1 : 0) + filters.categoryIds.length + filters.brandIds.length;
}

export type AppliedFilter = {
  key: string;
  label: string;
  remove: (filters: BrowseFilters) => BrowseFilters;
};

/** The applied selections as removable chips, in facet order. */
export function appliedFilters(filters: BrowseFilters, facets: BrowseFacets): AppliedFilter[] {
  const applied: AppliedFilter[] = [];
  if (filters.availableOnly) {
    applied.push({
      key: "available",
      label: "Available options",
      remove: (current) => ({ ...current, availableOnly: false }),
    });
  }
  for (const option of facets.categories) {
    if (filters.categoryIds.includes(option.id)) {
      applied.push({
        key: `category:${option.id}`,
        label: option.label,
        remove: (current) => ({
          ...current,
          categoryIds: current.categoryIds.filter((id) => id !== option.id),
        }),
      });
    }
  }
  for (const option of facets.brands) {
    if (filters.brandIds.includes(option.id)) {
      applied.push({
        key: `brand:${option.id}`,
        label: option.label,
        remove: (current) => ({
          ...current,
          brandIds: current.brandIds.filter((id) => id !== option.id),
        }),
      });
    }
  }
  return applied;
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((candidate) => candidate !== id) : [...ids, id];
}
