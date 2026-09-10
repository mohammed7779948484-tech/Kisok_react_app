import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Search, X } from "lucide-react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Icon, InputControl, Text } from "@/components/ui";

import { CatalogGrid, type CatalogGridRowInfo } from "../../components/catalog-grid";
import { CatalogShell } from "../../components/catalog-shell";
import { ProductCard } from "../../components/product-card";
import type { CatalogProductView, CatalogSearchResult } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";

const productKeyExtractor = (product: CatalogProductView) => product.id;

export function SearchScreen() {
  const router = useRouter();
  const catalog = useCatalog();
  const [query, setQuery] = useState("");

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

  const handleClear = useCallback(() => {
    setQuery("");
  }, []);

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

  const searchResult = view.search(query);

  const searchHeader = (
    <View className="gap-3 pb-4 pt-2">
      {/* Feature-owned search input field */}
      <View className="flex-row items-center rounded-2xl border border-input bg-card px-4 shadow-sm focus-within:border-ring">
        <Icon as={Search} size={20} className="mr-3 text-muted-foreground" />
        <InputControl
          placeholder="Search products, brands, categories, or options..."
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          className="h-control flex-1 border-0 bg-transparent px-0 text-base"
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={handleClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="h-12 w-12 items-center justify-center rounded-full active:bg-muted"
          >
            <Icon as={X} size={18} className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </View>

      {/* Accessible status feedback line */}
      <Text
        variant="caption"
        tone={searchResult.state === "no-match" ? "destructive" : "muted"}
        accessibilityLiveRegion="polite"
        className="px-1 font-medium"
      >
        {searchStatusMessage(searchResult)}
      </Text>
    </View>
  );

  return (
    <CatalogShell
      currentDestination="search"
      settings={view.settings}
      title="Search catalog"
      subtitle="Instant local discovery"
    >
      <View className="flex-1">
        {searchResult.state === "results" ? (
          <CatalogGrid
            data={searchResult.products}
            renderItem={renderProductCard}
            keyExtractor={productKeyExtractor}
            onItemPress={handleProductPress}
            listHeaderComponent={searchHeader}
            testID="search-results-grid"
            className="px-3 md:px-6"
          />
        ) : searchResult.state === "no-match" ? (
          <View className="flex-1 px-5 md:px-8">
            {searchHeader}
            <View className="flex-1 justify-center py-12">
              <EmptyState
                title="No products found"
                description={`No matches for "${searchResult.query}". Try another product, brand, category, or option.`}
                action={{ label: "Clear search", onPress: handleClear }}
              />
            </View>
          </View>
        ) : (
          <View className="flex-1 px-5 md:px-8">{searchHeader}</View>
        )}
      </View>
    </CatalogShell>
  );
}

function searchStatusMessage(searchResult: CatalogSearchResult): string {
  switch (searchResult.state) {
    case "idle":
      return "Search products, brands, categories, or options.";
    case "too-short":
      return "Enter at least 2 characters to search.";
    case "no-match":
      return `No matches for "${searchResult.query}".`;
    case "results":
      return searchResult.products.length === 1
        ? "1 product found"
        : `${searchResult.products.length} products found`;
  }
}
