import { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";

import { KeyFigure, PageHeading, useLayout } from "@/design-system";

import { BrowseResults } from "../../components/browse-results";
import { CatalogShell } from "../../components/catalog-shell";
import { HELP_ME_CHOOSE_PILL_CLEARANCE } from "../../components/help-me-choose-pill";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogLoadingState,
} from "../../components/catalog-state-panel";
import { EMPTY_FILTERS, type BrowseFilters } from "../../model/browse-filters";
import type { CatalogProductView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";
import { productDetailHref } from "../product-detail/product-detail-href";

export type ProductsScreenProps = {
  /** Open already scoped to a category (from a category page's "View all"). */
  initialCategoryId?: string;
};

export function ProductsScreen({ initialCategoryId }: ProductsScreenProps = {}) {
  const router = useRouter();
  const catalog = useCatalog();
  const { isExpanded } = useLayout();

  const handleProductPress = useCallback(
    (product: CatalogProductView) => {
      router.push(productDetailHref(product.id, "Back to products"));
    },
    [router],
  );

  const view = catalog.data;
  const initialFilters = useMemo<BrowseFilters>(() => {
    const category = initialCategoryId ? view?.resolveCategory(initialCategoryId) : undefined;
    if (!category) return EMPTY_FILTERS;
    return { ...EMPTY_FILTERS, categoryIds: [category.parent_id ?? category.id] };
  }, [initialCategoryId, view]);

  if (catalog.isPending) return <CatalogLoadingState destination="products" />;

  if (catalog.isError && !view) {
    return (
      <CatalogErrorState
        destination="products"
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
      />
    );
  }

  if (!view || view.products.length === 0) {
    return <CatalogEmptyState destination="products" onRetry={() => void catalog.refetch()} />;
  }

  return (
    <CatalogShell currentDestination="products" settings={view.settings} helpMeChoose={{}}>
      <BrowseResults
        view={view}
        products={view.products}
        scopeLabel="All catalog products"
        onProductPress={handleProductPress}
        showShortcuts
        initialFilters={initialFilters}
        bottomInset={HELP_ME_CHOOSE_PILL_CLEARANCE}
        testID="products-grid"
        header={
          <PageHeading
            className="pt-8"
            wide={isExpanded}
            breadcrumb={[
              { label: "Explore", onPress: () => router.replace("/") },
              { label: "Products" },
            ]}
            eyebrow="Complete catalog"
            title="Products"
            description="Browse the store, then narrow by category, brand, or availability."
            aside={<KeyFigure value={view.products.length} label="products in the store" />}
          />
        }
      />
    </CatalogShell>
  );
}
