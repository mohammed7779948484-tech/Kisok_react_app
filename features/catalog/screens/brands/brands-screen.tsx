import { useCallback } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";

import { BrandCard } from "../../components/brand-card";
import { CatalogGrid, type CatalogGridRowInfo } from "../../components/catalog-grid";
import { CatalogShell } from "../../components/catalog-shell";
import type { CatalogBrandView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";

const brandKeyExtractor = (brand: CatalogBrandView) => brand.id;

function brandCountLabel(count: number): string {
  return count === 1 ? "1 brand" : `${count} brands`;
}

export function BrandsScreen() {
  const router = useRouter();
  const catalog = useCatalog();

  const handleBrandPress = useCallback(
    (brand: CatalogBrandView) => {
      router.push({ pathname: "/brand-detail", params: { brandId: brand.id } });
    },
    [router],
  );

  const renderBrandCard = useCallback(
    ({ item, onPress }: CatalogGridRowInfo<CatalogBrandView>) => (
      <BrandCard brand={item} onPress={onPress} />
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

  if (view.brands.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="No brands yet"
          description="This store has no brands listed right now. You can still browse all of its products."
          action={{ label: "Browse all products", onPress: () => router.replace("/products") }}
        />
      </Screen>
    );
  }

  const brands = view.brands;

  return (
    <CatalogShell
      currentDestination="brands"
      settings={view.settings}
      title="All brands"
      subtitle="Discover brand collections"
      countLabel={brandCountLabel(brands.length)}
    >
      <View className="flex-1 pt-2">
        <CatalogGrid
          data={brands}
          renderItem={renderBrandCard}
          keyExtractor={brandKeyExtractor}
          onItemPress={handleBrandPress}
          testID="brands-grid"
          className="px-3 md:px-6"
        />
      </View>
    </CatalogShell>
  );
}
