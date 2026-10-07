import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import { chromeHeight, ContentContainer, Text, useLayout } from "@/design-system";

import { CatalogShell } from "../../components/catalog-shell";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogLoadingState,
} from "../../components/catalog-state-panel";
import type {
  CatalogBrandView,
  CatalogCategoryView,
  CatalogProductView,
} from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";
import { productDetailHref } from "../product-detail/product-detail-href";
import { BrandDistrict } from "./sections/brand-district";
import { ExploreRange } from "./sections/explore-range";
import { OptionFinder } from "./sections/option-finder";
import { StoreUniverse } from "./sections/store-universe";

const BRAND_DISTRICT_LIMIT = 8;
const EXPLORE_LIMIT = 5;
const FEATURED_LIMIT = 8;
/** The opening zone never shrinks below this, however short the window. */
const OPENING_MIN_HEIGHT = 540;

/**
 * Home: a bounded editorial composition. Each section is derived from the
 * real catalog, sized to what exists (0, 1 or many), and built from plain
 * views — nothing here grows with the catalog, so nothing is virtualised.
 */
export function CatalogHomeScreen() {
  const router = useRouter();
  const catalog = useCatalog();
  const { isExpanded, isLandscape, height } = useLayout();
  const split = isExpanded;

  const handleCategoryPress = useCallback(
    (category: CatalogCategoryView) => {
      router.push({ pathname: "/category-detail", params: { categoryId: category.id } });
    },
    [router],
  );
  const handleBrandPress = useCallback(
    (brand: CatalogBrandView) => {
      router.push({ pathname: "/brand-detail", params: { brandId: brand.id } });
    },
    [router],
  );
  const handleProductPress = useCallback(
    (product: CatalogProductView) => {
      router.push(productDetailHref(product.id, "Back to Explore"));
    },
    [router],
  );

  const view = catalog.data;
  const composition = useMemo(() => {
    if (!view) return null;
    const featured = view.home.featuredProducts.slice(0, FEATURED_LIMIT);
    const featuredIds = new Set(featured.map((product) => product.id));
    const range = [
      ...view.products.filter((product) => product.isAvailable && !featuredIds.has(product.id)),
      ...view.products.filter((product) => !product.isAvailable && !featuredIds.has(product.id)),
    ].slice(0, EXPLORE_LIMIT);
    return {
      categories: view.rootCategories.filter((category) => category.productCount > 0),
      featured,
      brands: view.brands.filter((brand) => brand.productCount > 0).slice(0, BRAND_DISTRICT_LIMIT),
      range: range.length > 0 ? range : view.products.slice(0, EXPLORE_LIMIT),
    };
  }, [view]);

  if (catalog.isPending) return <CatalogLoadingState destination="home" />;

  if (catalog.isError && !view) {
    return (
      <CatalogErrorState
        destination="home"
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
      />
    );
  }

  if (!view || !composition || view.products.length === 0) {
    return <CatalogEmptyState destination="home" onRetry={() => void catalog.refetch()} />;
  }

  const storeName =
    "store_name" in view.settings && view.settings.store_name ? view.settings.store_name : "Store";
  // On a landscape tablet the opening fills the first view below the chrome.
  const openingHeight =
    split && isLandscape ? Math.max(OPENING_MIN_HEIGHT, height - chromeHeight - 80) : undefined;

  return (
    <CatalogShell currentDestination="home" settings={view.settings}>
      <ScrollView contentContainerClassName="pb-4">
        <View className="sr-only">
          <Text variant="h1" accessibilityRole="header">
            {`${storeName} catalog`}
          </Text>
        </View>
        <ContentContainer className="gap-20 pt-9">
          <StoreUniverse
            categories={composition.categories}
            featured={composition.featured}
            height={openingHeight}
            split={split}
            onCategoryPress={handleCategoryPress}
            onViewCategories={() => router.replace("/categories")}
            onProductPress={handleProductPress}
          />
          <OptionFinder
            categories={composition.categories}
            split={split}
            onSearch={() => router.replace("/search")}
            onHelpMeChoose={() => router.push("/help-me-choose")}
            onHelpMeChooseIn={(category) =>
              router.push({ pathname: "/help-me-choose", params: { categoryId: category.id } })
            }
          />
          <BrandDistrict
            brands={composition.brands}
            onBrandPress={handleBrandPress}
            onViewAll={() => router.replace("/brands")}
          />
          <ExploreRange
            products={composition.range}
            split={split}
            onProductPress={handleProductPress}
            onViewAll={() => router.replace("/products")}
          />
        </ContentContainer>
        <HomeFooter storeName={storeName} onNavigate={(path) => router.replace(path)} />
      </ScrollView>
    </CatalogShell>
  );
}

function HomeFooter({
  storeName,
  onNavigate,
}: {
  storeName: string;
  onNavigate: (path: "/products" | "/categories" | "/brands") => void;
}) {
  const links: { label: string; path: "/products" | "/categories" | "/brands" }[] = [
    { label: "Products", path: "/products" },
    { label: "Categories", path: "/categories" },
    { label: "Brands", path: "/brands" },
  ];
  return (
    <View className="mt-20 border-t border-border">
      <ContentContainer className="flex-row flex-wrap items-center justify-between gap-6 py-9">
        <View className="gap-1">
          <Text className="font-sans-extrabold text-body-lg uppercase tracking-[2px]">
            {storeName}
          </Text>
          <Text variant="caption" tone="muted">
            In-store catalog
          </Text>
        </View>
        <View className="flex-row gap-2">
          {links.map((link) => (
            <Pressable
              key={link.path}
              accessibilityRole="link"
              onPress={() => onNavigate(link.path)}
              className="min-h-touch justify-center px-3 active:opacity-70"
            >
              <Text className="font-sans-bold text-meta text-muted-foreground">{link.label}</Text>
            </Pressable>
          ))}
        </View>
      </ContentContainer>
    </View>
  );
}
