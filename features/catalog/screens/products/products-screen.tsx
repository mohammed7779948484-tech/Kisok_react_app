import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Button, Text, ToggleGroup, ToggleGroupItem } from "@/components/ui";

import { CatalogGrid, type CatalogGridRowInfo } from "../../components/catalog-grid";
import { CatalogShell } from "../../components/catalog-shell";
import { ProductCard } from "../../components/product-card";
import type { CatalogProductView } from "../../model/catalog-view";
import { productCountLabel } from "../../model/labels";
import { useCatalog } from "../../queries/use-catalog";

const productKeyExtractor = (product: CatalogProductView) => product.id;

export function ProductsScreen() {
  const router = useRouter();
  const catalog = useCatalog();

  // Local-only discovery filter: "all" | "available"
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  // Local-only brand filter: brandId or "all"
  const [selectedBrandId, setSelectedBrandId] = useState<string>("all");

  // Gate F: Reconcile selectedBrandId if selected brand is removed from catalog
  useEffect(() => {
    if (selectedBrandId !== "all" && catalog.data?.brands) {
      const exists = catalog.data.brands.some((b) => b.id === selectedBrandId);
      if (!exists) {
        setSelectedBrandId("all");
      }
    }
  }, [catalog.data?.brands, selectedBrandId]);

  const handleProductPress = useCallback(
    (product: CatalogProductView) => {
      router.push({ pathname: "/product-detail", params: { productId: product.id } });
    },
    [router],
  );

  const renderProductCard = useCallback(
    ({ item, onPress }: CatalogGridRowInfo<CatalogProductView>) => (
      <ProductCard product={item} onPress={onPress} />
    ),
    [],
  );

  // Stale brand recovery: if selectedBrandId !== "all" and not in current brands, fall back to "all"
  const brands = catalog.data?.brands ?? [];
  const isBrandValid = selectedBrandId === "all" || brands.some((b) => b.id === selectedBrandId);
  const effectiveBrandId = isBrandValid ? selectedBrandId : "all";

  // Local filtering (preserves source backend order)
  const filteredProducts = useMemo(() => {
    const products = catalog.data?.products ?? [];
    return products.filter((product) => {
      if (availabilityFilter === "available" && !product.isAvailable) {
        return false;
      }
      if (effectiveBrandId !== "all" && product.brand?.id !== effectiveBrandId) {
        return false;
      }
      return true;
    });
  }, [catalog.data?.products, availabilityFilter, effectiveBrandId]);

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

  const hasActiveFilters = availabilityFilter !== "all" || effectiveBrandId !== "all";

  const handleResetFilters = () => {
    setAvailabilityFilter("all");
    setSelectedBrandId("all");
  };

  const filterHeader = (
    <View className="gap-3 pb-4 pt-2">
      {/* Quick local discovery filters */}
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="caption" tone="muted" className="font-semibold">
            Status:
          </Text>
          <ToggleGroup
            type="single"
            layout="content"
            value={availabilityFilter}
            onValueChange={(val) => val && setAvailabilityFilter(val)}
            accessibilityLabel="Filter by availability status"
          >
            <ToggleGroupItem value="all" className="h-touch min-h-touch px-3.5 py-1">
              <Text variant="caption">All items</Text>
            </ToggleGroupItem>
            <ToggleGroupItem value="available" className="h-touch min-h-touch px-3.5 py-1">
              <Text variant="caption">Available only</Text>
            </ToggleGroupItem>
          </ToggleGroup>
        </View>

        {hasActiveFilters ? (
          <Button
            variant="ghost"
            size="compact"
            onPress={handleResetFilters}
            className="min-h-touch"
          >
            <Text className="text-xs font-semibold text-primary">Clear filters</Text>
          </Button>
        ) : null}
      </View>

      {/* Brand filter row */}
      {brands.length > 0 ? (
        <View className="flex-row items-center gap-2 pt-1">
          <Text variant="caption" tone="muted" className="font-semibold">
            Brand:
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            <ToggleGroup
              type="single"
              layout="content"
              value={effectiveBrandId}
              onValueChange={(val) => val && setSelectedBrandId(val)}
              accessibilityLabel="Filter by brand"
            >
              <ToggleGroupItem value="all" className="h-touch min-h-touch px-3.5 py-1">
                <Text variant="caption">All brands</Text>
              </ToggleGroupItem>
              {brands.map((brand) => (
                <ToggleGroupItem
                  key={brand.id}
                  value={brand.id}
                  className="h-touch min-h-touch px-3.5 py-1"
                >
                  <Text variant="caption">{brand.name}</Text>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  return (
    <CatalogShell
      currentDestination="products"
      settings={view.settings}
      title="All products"
      subtitle="Complete store collection"
      countLabel={productCountLabel(filteredProducts.length)}
    >
      <View className="flex-1">
        <CatalogGrid
          data={filteredProducts}
          renderItem={renderProductCard}
          keyExtractor={productKeyExtractor}
          onItemPress={handleProductPress}
          listHeaderComponent={filterHeader}
          listEmptyComponent={
            <View className="items-center justify-center p-8">
              <EmptyState
                title="No products match these filters"
                description="No products match your current filters. Clear filters to see the full collection."
                action={{ label: "Clear filters", onPress: handleResetFilters }}
              />
            </View>
          }
          testID="products-grid"
          className="px-3 md:px-6"
        />
      </View>
    </CatalogShell>
  );
}
