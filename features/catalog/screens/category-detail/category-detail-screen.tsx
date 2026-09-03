import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { AppImage } from "@/components/media/app-image";
import { Button, Text } from "@/components/ui";

import { CatalogGrid, type CatalogGridRowInfo } from "../../components/catalog-grid";
import { CategoryCard } from "../../components/category-card";
import { ProductCard } from "../../components/product-card";
import { productCountLabel } from "../../model/labels";
import type { CatalogCategoryView, CatalogProductView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";
import {
  CategoryBrandFilter,
  type CategoryBrandFilterOption,
} from "./components/category-brand-filter";

/**
 * Stable by construction (module scope): a fresh inline keyExtractor would
 * give the grid a new prop identity on every render.
 */
const productKeyExtractor = (product: CatalogProductView) => product.id;

/**
 * Category Detail (AC-05): one resolved category — its direct children where
 * applicable — and its category-scoped products with the local brand filter.
 *
 * `categoryId` arrives as a prop from the route (view state, not server
 * state). The screen consumes the feature's own `useCatalog` hook — never
 * Supabase directly — with the same snapshot layer as the other discovery
 * screens: cold loading, error with retry only while no snapshot exists (a
 * failed background refetch keeps the populated detail on screen — TanStack
 * retains `data`, and the shared QueryClient refetches on focus/reconnect for
 * long-lived kiosk sessions), or whole-catalog empty (no products means there
 * is nothing to scope to any category). The error object is passed through so
 * `ErrorState` decides whether retry is worth offering.
 *
 * Local projections of a SUCCESSFUL snapshot are handled here, never as
 * network states: a stale/invalid `categoryId` (`view.resolveCategory`
 * returns undefined) renders a local not-found state — honest "category not
 * found" copy plus the way back, no `ErrorState`, no retry pretending a fetch
 * failed. Under the real `used_categories` contract
 * (20260826050006_lean_customer_catalog.sql:65-81) a returned category always
 * carries ≥1 valid product directly or via a direct child, so a resolved
 * category has no UNFILTERED zero-products state; the reachable zero state is
 * the brand-filter no-match below.
 *
 * The category's products come from `view.productsForCategory(categoryId,
 * brandId)` — a root aggregates itself plus its direct children, de-duplicated
 * in backend product order; a child projects only its direct memberships —
 * and render through the T03 `CatalogGrid` (FlashList, 2/3/4 columns): a
 * category's assortment is unbounded in principle, so this is the feature's
 * scalable composition exactly like All Products. Product cards are PUSHED to
 * `/product-detail` (object form) so this list stays mounted behind the
 * detail.
 *
 * Direct children of a ROOT render as a horizontally scrolling strip of
 * `CategoryCard`s under a "Subcategories" label (a bounded-height strip is the
 * standard composition for a small, owner-managed sibling set — no
 * virtualization ceremony; the unbounded collection on this screen is the
 * products grid). Pressing a child PUSHES that child's own detail (object
 * form), so this screen stays mounted behind it. Children of a child cannot
 * exist (at most one category level), so the section simply does not render.
 *
 * The brand filter (screen-local `components/category-brand-filter.tsx`) is
 * presentational; the selection is screen-local React state (Design decision 3
 * — never server state, never a store) defaulting to All Brands. The selected
 * brand is captured as a full option (id + name) at selection time so it stays
 * clearly represented even when a background refetch refreshes the category's
 * brand options — which is also the only genuinely reachable route into the
 * no-match state: options derive from the category's own products, so a fresh
 * selection always has ≥1 product, but a snapshot refresh can remove them
 * under the persisted selection. That no-match state (distinct copy + a reset
 * action back to All Brands — AC-05) renders inline in place of the products
 * grid so the identity, the filter and the child discovery all stay on screen
 * as the way onward. The reset exists twice by design: inline at the no-match
 * state and as the filter's own All Brands option.
 *
 * Back affordance: the brief pins "detail screens retain an obvious way back
 * to the discovery surface that opened them", so a header `Go back` control
 * calls `router.back()` — it returns to whatever pushed this detail (the
 * Categories list, Home's category section, or a parent category's detail)
 * and can never stack duplicate root history. Root `CatalogNavigation` is
 * deliberately NOT rendered on this detail screen: its replace semantics,
 * used from a pushed detail, would duplicate the root entry sitting directly
 * below (e.g. [/categories, /category-detail] → [/categories, /categories]),
 * which is the duplicate-root stacking AC-08 forbids. The local not-found
 * state carries its own way out instead.
 */
export type CategoryDetailScreenProps = {
  /** The category to resolve and scope products to; passed by the route. */
  categoryId: string;
};

export function CategoryDetailScreen({ categoryId }: CategoryDetailScreenProps) {
  const router = useRouter();
  const catalog = useCatalog();
  // Design decision 3: the brand filter is screen-local React state. `null`
  // means All Brands (the default); the option is captured whole (id + name)
  // at selection time so the selection stays clearly represented (AC-05) if a
  // later snapshot refresh drops the brand from this category's options.
  const [selectedBrand, setSelectedBrand] = useState<CategoryBrandFilterOption | null>(null);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleProductPress = useCallback(
    (product: CatalogProductView) => {
      router.push({ pathname: "/product-detail", params: { productId: product.id } });
    },
    [router],
  );

  const handleChildPress = useCallback(
    (category: CatalogCategoryView) => {
      router.push({ pathname: "/category-detail", params: { categoryId: category.id } });
    },
    [router],
  );

  const handleResetBrand = useCallback(() => {
    setSelectedBrand(null);
  }, []);

  // CatalogGrid memoizes its row renderer against these props — keep the
  // identities stable (useCallback / module scope) so a re-render of this
  // screen does not defeat the virtualizer's row memoization.
  const renderProductCard = useCallback(
    ({ item, onPress }: CatalogGridRowInfo<CatalogProductView>) => (
      <ProductCard product={item} onPress={onPress} />
    ),
    [],
  );

  if (catalog.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading the catalog…" />
      </Screen>
    );
  }

  // Full-screen error only when NO snapshot exists: on a failed background
  // refetch TanStack keeps `data` and the populated detail stays on screen
  // through the blip (see the state rules in the component doc comment).
  if (catalog.isError && !catalog.data) {
    return (
      <Screen>
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      </Screen>
    );
  }

  const view = catalog.data;

  if (view.products.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="The catalog is empty"
          description="Nothing is available to browse right now. Please try again in a moment or ask a store employee for help."
          action={{ label: "Try again", onPress: () => void catalog.refetch() }}
        />
      </Screen>
    );
  }

  const category = view.resolveCategory(categoryId);

  if (category === undefined) {
    // Stale/invalid id: a LOCAL projection of a successful snapshot. There is
    // no identity to render, so the honest way back is the whole state.
    return (
      <Screen>
        <EmptyState
          title="Category not found"
          description="This category isn't in the current catalog. It may have been removed since you started browsing. Go back to see the categories this store has now."
          action={{ label: "Go back", onPress: handleBack }}
        />
      </Screen>
    );
  }

  const products = view.productsForCategory(categoryId, selectedBrand?.brandId ?? null);
  const childCategories = category.children;

  // Options from the CURRENT snapshot, plus the remembered selection if a
  // refresh dropped it — keeps "clearly represents the selected brand" true
  // across a background refetch (see the doc comment).
  const currentOptions: CategoryBrandFilterOption[] = view
    .brandsForCategory(categoryId)
    .map((brand) => ({ brandId: brand.id, name: brand.name }));
  const filterOptions =
    selectedBrand !== null &&
    !currentOptions.some((option) => option.brandId === selectedBrand.brandId)
      ? [...currentOptions, selectedBrand]
      : currentOptions;

  // Not memoized on purpose: this feeds a non-virtualized chip row, and the
  // lookup needs the freshly derived `filterOptions` of this render.
  const handleSelectBrand = (brandId: string | null): void => {
    if (brandId === null) {
      setSelectedBrand(null);
      return;
    }

    const option = filterOptions.find((candidate) => candidate.brandId === brandId);
    if (option !== undefined) {
      setSelectedBrand(option);
    }
  };

  return (
    <Screen>
      <View className="flex-1">
        <View className="gap-3 px-6 pb-2 pt-6">
          <Button variant="ghost" onPress={handleBack} className="self-start">
            <Text>Go back</Text>
          </Button>
          <CategoryIdentity category={category} />
          <CategoryBrandFilter
            options={filterOptions}
            selectedBrandId={selectedBrand?.brandId ?? null}
            onSelectBrand={handleSelectBrand}
          />
          {childCategories.length > 0 ? (
            <View className="gap-2">
              <Text variant="body" tone="muted">
                Subcategories
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3 pb-1"
              >
                {childCategories.map((child) => (
                  <CategoryCard
                    key={child.id}
                    category={child}
                    onPress={handleChildPress}
                    className="w-44"
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
        {products.length > 0 ? (
          <CatalogGrid
            data={products}
            renderItem={renderProductCard}
            keyExtractor={productKeyExtractor}
            onItemPress={handleProductPress}
            testID="category-products-grid"
            className="px-4"
          />
        ) : (
          // The reachable zero state: a selected brand with no products left
          // in this category. Inline — the identity, the filter and the child
          // discovery stay on screen as the way onward (AC-05).
          <EmptyState
            title="No products from this brand"
            description="This brand currently has no products in this category. Browse the full selection instead."
            action={{ label: "Show all brands", onPress: handleResetBrand }}
          />
        )}
      </View>
    </Screen>
  );
}

type CategoryIdentityProps = {
  category: CatalogCategoryView;
};

/**
 * The resolved category's identity: image through the same `AppImage` media
 * contract the `CategoryCard` uses (its fallback slot keeps the header layout
 * stable when the category has no image), name as the screen header, and the
 * view's DERIVED product count — the same aggregated number the card on the
 * Categories screen shows, so the two surfaces never disagree.
 */
function CategoryIdentity({ category }: CategoryIdentityProps) {
  return (
    <View className="flex-row items-center gap-4">
      <AppImage
        uri={category.image?.secureUrl ?? null}
        alt={category.name}
        contentFit="cover"
        className="h-16 w-16 rounded-lg"
      />
      <View className="flex-1 gap-1">
        <Text variant="h1" accessibilityRole="header">
          {category.name}
        </Text>
        <Text variant="body" tone="muted">
          {productCountLabel(category.productCount)}
        </Text>
      </View>
    </View>
  );
}
