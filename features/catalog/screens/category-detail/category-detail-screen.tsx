import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { AppImage } from "@/components/media/app-image";
import { Button, Icon, Text } from "@/components/ui";
import { useLayout } from "@/core/responsive";

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

const productKeyExtractor = (product: CatalogProductView) => product.id;

export type CategoryDetailScreenProps = {
  categoryId: string;
};

export function CategoryDetailScreen({ categoryId }: CategoryDetailScreenProps) {
  const router = useRouter();
  const catalog = useCatalog();
  const { isLandscape, isExpanded } = useLayout();
  const useWideHeader = isLandscape && isExpanded;

  const [selectedBrand, setSelectedBrand] = useState<CategoryBrandFilterOption | null>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/categories");
    }
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
    return (
      <Screen>
        <EmptyState
          title="Category not found"
          description="This category is no longer in the catalog. It may have been removed since you started browsing."
          action={{ label: "Back to categories", onPress: () => router.replace("/categories") }}
        />
      </Screen>
    );
  }

  const products = view.productsForCategory(categoryId, selectedBrand?.brandId ?? null);
  const childCategories = category.children;

  const currentOptions: CategoryBrandFilterOption[] = view
    .brandsForCategory(categoryId)
    .map((brand) => ({ brandId: brand.id, name: brand.name }));
  const filterOptions =
    selectedBrand !== null &&
    !currentOptions.some((option) => option.brandId === selectedBrand.brandId)
      ? [...currentOptions, selectedBrand]
      : currentOptions;

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

  const categoryDiscoveryHeader = (
    <View className="gap-5 px-2 pb-5 pt-3">
      {/* Category header and filters responsive layout */}
      <View
        className={
          useWideHeader
            ? "flex-row items-start justify-between gap-8 border-b border-border/50 pb-5"
            : "gap-4 border-b border-border/50 pb-4"
        }
      >
        <View className={useWideHeader ? "max-w-md flex-1" : "w-full"}>
          <CategoryIdentity category={category} />
        </View>

        {filterOptions.length > 0 ? (
          <View className={useWideHeader ? "flex-1 pt-1" : "w-full pt-1"}>
            <CategoryBrandFilter
              options={filterOptions}
              selectedBrandId={selectedBrand?.brandId ?? null}
              onSelectBrand={handleSelectBrand}
            />
          </View>
        ) : null}
      </View>

      {/* Subcategories Horizontal Scroll Row (Roots only) */}
      {childCategories.length > 0 ? (
        <View className="gap-2.5">
          <Text variant="caption" tone="muted" className="font-semibold">
            Subcategories:
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
                className="w-48"
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <View className="flex-1">
        {/* Back navigation header */}
        <View className="px-5 pt-4 md:px-8">
          <Button
            variant="ghost"
            size="compact"
            onPress={handleBack}
            className="min-h-touch gap-1.5 self-start pl-2"
            accessibilityLabel="Go back"
          >
            <Icon as={ArrowLeft} size={18} />
            <Text className="font-semibold">Back</Text>
          </Button>
        </View>

        {products.length > 0 ? (
          <CatalogGrid
            data={products}
            renderItem={renderProductCard}
            keyExtractor={productKeyExtractor}
            onItemPress={handleProductPress}
            listHeaderComponent={categoryDiscoveryHeader}
            testID="category-products-grid"
            className="px-3 md:px-6"
          />
        ) : (
          <ScrollView contentContainerClassName="flex-grow px-3 md:px-6">
            {categoryDiscoveryHeader}
            <EmptyState
              title="No products from this brand"
              description={`This brand currently has no products in this category. Clear the brand filter to browse the full ${category.parent !== null ? "category" : "department"}.`}
              action={{ label: "Show all brands", onPress: handleResetBrand }}
              className="min-h-80"
            />
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

type CategoryIdentityProps = {
  category: CatalogCategoryView;
};

function CategoryIdentity({ category }: CategoryIdentityProps) {
  const isSubcategory = category.parent !== null;

  return (
    <View className="flex-row items-center gap-4">
      <View className="h-16 w-16 overflow-hidden rounded-xl bg-muted/20 md:h-20 md:w-20">
        <AppImage
          uri={category.image?.secureUrl ?? null}
          alt={category.name}
          contentFit="cover"
          className="h-full w-full"
        />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="caption" tone="primary" className="font-semibold uppercase tracking-wider">
          {isSubcategory ? `Subcategory of ${category.parent!.name}` : "Department"}
        </Text>
        <Text variant="h1" accessibilityRole="header" className="text-2xl font-bold md:text-3xl">
          {category.name}
        </Text>
        <Text variant="caption" tone="muted">
          {productCountLabel(category.productCount)}
        </Text>
      </View>
    </View>
  );
}
