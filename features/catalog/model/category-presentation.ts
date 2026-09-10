import type { CatalogCategoryView } from "./catalog-view";

export type CategoryFamily = {
  root: CatalogCategoryView;
  children: CatalogCategoryView[];
};

export function deriveCategoryFamilies(
  rootCategories: readonly CatalogCategoryView[],
): CategoryFamily[] {
  return rootCategories.map((root) => ({
    root,
    children: root.children,
  }));
}
