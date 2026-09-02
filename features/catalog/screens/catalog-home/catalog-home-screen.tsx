import { useRouter, type Href } from "expo-router";
import { ScrollView, View } from "react-native";

import { EmptyState, ErrorState, SkeletonGrid } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { AppImage } from "@/components/media/app-image";
import { Button, Text } from "@/components/ui";
import { useResponsiveValue } from "@/core/responsive";

import { BrandCard } from "../../components/brand-card";
import { CatalogNavigation, type CatalogDestination } from "../../components/catalog-navigation";
import { CategoryCard } from "../../components/category-card";
import { ProductCard } from "../../components/product-card";
import { useCatalog } from "../../queries/use-catalog";

const ROOT_PATHS: Record<CatalogDestination, Href> = {
  home: "/",
  products: "/products",
  brands: "/brands",
  categories: "/categories",
  search: "/search",
};

export function CatalogHomeScreen() {
  const router = useRouter();
  const catalog = useCatalog();
  const columns = useResponsiveValue({ compact: 1, medium: 2, expanded: 3 });
  const cardWidth = `${100 / columns - 2}%` as const;

  if (catalog.isPending) {
    return (
      <Screen>
        <ScrollView contentContainerClassName="gap-8 p-6">
          <SkeletonGrid count={2} columns={columns} />
          <SkeletonGrid count={3} columns={columns} />
          <SkeletonGrid count={4} columns={columns} />
        </ScrollView>
      </Screen>
    );
  }

  if (catalog.isError) {
    return (
      <Screen>
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      </Screen>
    );
  }

  const view = catalog.data;
  const hasFullSettings = "store_name" in view.settings;
  const storeName = hasFullSettings ? view.settings.store_name : "Catalog";

  const selectRoot = (destination: CatalogDestination) => {
    router.replace(ROOT_PATHS[destination]);
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-8 p-6">
        <View className="gap-4 rounded-xl border border-border bg-card p-6">
          <View className="flex-row flex-wrap items-center gap-4">
            {hasFullSettings && view.settings.logo_secure_url !== null ? (
              <AppImage
                uri={view.settings.logo_secure_url}
                alt={`${storeName} logo`}
                contentFit="contain"
                className="h-20 w-20 rounded-lg"
              />
            ) : null}
            <View className="min-w-0 flex-1 gap-1">
              <Text accessibilityRole="header" variant="h1">
                {storeName}
              </Text>
              <Text tone="muted">{hasFullSettings ? "Browse our catalog" : "KISOK"}</Text>
            </View>
          </View>
          <CatalogNavigation currentDestination="home" onSelect={selectRoot} />
        </View>

        {view.products.length === 0 ? (
          <EmptyState
            title="No products available"
            description="Refresh to check the latest catalog."
            action={{ label: "Refresh", onPress: () => void catalog.refetch() }}
          />
        ) : (
          <>
            {view.home.brands.length > 0 ? (
              <View className="gap-4">
                <View className="flex-row flex-wrap items-center justify-between gap-3">
                  <Text accessibilityRole="header" variant="h2">
                    Brands
                  </Text>
                  <Button variant="ghost" onPress={() => selectRoot("brands")}>
                    <Text>Browse all brands</Text>
                  </Button>
                </View>
                <View className="flex-row flex-wrap gap-4">
                  {view.home.brands.map((brand) => (
                    <View key={brand.id} style={{ width: cardWidth }}>
                      <BrandCard
                        brand={brand}
                        onPress={(selectedBrand) =>
                          router.push({
                            pathname: "/brand-detail",
                            params: { brandId: selectedBrand.id },
                          } as Href)
                        }
                      />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {view.home.categories.length > 0 ? (
              <View className="gap-4">
                <View className="flex-row flex-wrap items-center justify-between gap-3">
                  <Text accessibilityRole="header" variant="h2">
                    Categories
                  </Text>
                  <Button variant="ghost" onPress={() => selectRoot("categories")}>
                    <Text>Browse all categories</Text>
                  </Button>
                </View>
                <View className="flex-row flex-wrap gap-4">
                  {view.home.categories.map((category) => (
                    <View key={category.id} style={{ width: cardWidth }}>
                      <CategoryCard
                        category={category}
                        onPress={(selectedCategory) =>
                          router.push({
                            pathname: "/category-detail",
                            params: { categoryId: selectedCategory.id },
                          } as Href)
                        }
                      />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {view.home.featuredProducts.length > 0 ? (
              <View className="gap-4">
                <View className="flex-row flex-wrap items-center justify-between gap-3">
                  <Text accessibilityRole="header" variant="h2">
                    Featured products
                  </Text>
                  <Button variant="ghost" onPress={() => selectRoot("products")}>
                    <Text>Browse all products</Text>
                  </Button>
                </View>
                <View className="flex-row flex-wrap gap-4">
                  {view.home.featuredProducts.map((product) => (
                    <View key={product.id} style={{ width: cardWidth }}>
                      <ProductCard
                        product={product}
                        onPress={(selectedProduct) =>
                          router.push({
                            pathname: "/product-detail",
                            params: { productId: selectedProduct.id },
                          } as Href)
                        }
                      />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
