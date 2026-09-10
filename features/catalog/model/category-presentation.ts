import type { CatalogCategoryView } from "./catalog-view";

export type CategoryFamily = {
  root: CatalogCategoryView;
  children: CatalogCategoryView[];
  totalProductCount: number;
};

export function deriveCategoryFamilies(
  rootCategories: readonly CatalogCategoryView[],
): CategoryFamily[] {
  return rootCategories.map((root) => {
    const children = root.children;
    return {
      root,
      children,
      totalProductCount: root.productCount,
    };
  });
}
