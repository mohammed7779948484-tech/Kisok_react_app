import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
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

  // Local filtering (preserves source backend order)
  const filteredProducts = useMemo(() => {
    const products = catalog.data?.products ?? [];
    return products.filter((product) => {
      if (availabilityFilter === "available" && !product.isAvailable) {
        return false;
      }
      if (selectedBrandId !== "all" && product.brand?.id !== selectedBrandId) {
        return false;
      }
      return true;
    });
  }, [catalog.data?.products, availabilityFilter, selectedBrandId]);

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

  const hasActiveFilters = availabilityFilter !== "all" || selectedBrandId !== "all";

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
            <ToggleGroupItem value="all" className="h-touch px-3 py-1">
              <Text variant="caption">All items</Text>
            </ToggleGroupItem>
            <ToggleGroupItem value="available" className="h-touch px-3 py-1">
              <Text variant="caption">Available only</Text>
            </ToggleGroupItem>
          </ToggleGroup>
        </View>

        {hasActiveFilters ? (
          <Button variant="ghost" size="compact" onPress={handleResetFilters}>
            <Text className="text-xs text-primary">Reset filters</Text>
          </Button>
        ) : null}
      </View>
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
        {filteredProducts.length === 0 ? (
          <View className="flex-1 justify-center p-8">
            <EmptyState
              title="No matching products"
              description="No products match your current filters. Clear the filters to see the full collection."
              action={{ label: "Show all products", onPress: handleResetFilters }}
            />
          </View>
        ) : (
          <CatalogGrid
            data={filteredProducts}
            renderItem={renderProductCard}
            keyExtractor={productKeyExtractor}
            onItemPress={handleProductPress}
            listHeaderComponent={filterHeader}
            testID="products-grid"
            className="px-3 md:px-6"
          />
        )}
      </View>
    </CatalogShell>
  );
}
