import { useCallback } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Text } from "@/components/ui";

import { CatalogGrid, type CatalogGridRowInfo } from "../../components/catalog-grid";
import { CatalogNavigation, type CatalogDestination } from "../../components/catalog-navigation";
import { ProductCard } from "../../components/product-card";
import type { CatalogProductView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";

/**
 * Stable by construction (module scope): a fresh inline keyExtractor would
 * give the grid a new prop identity on every render.
 */
const productKeyExtractor = (product: CatalogProductView) => product.id;

/**
 * All Products (AC-03): the complete `view.products` collection in the T03
 * virtualized responsive grid.
 *
 * This is the scalable Catalog surface — `CatalogView.products` is deliberately
 * unbounded, unlike the Home sections, so the products themselves render
 * through `CatalogGrid` (FlashList) and never a ScrollView. The heading,
 * count and root navigation sit above the grid and stay mounted while it
 * scrolls, so root destinations remain reachable without scrolling back.
 *
 * The screen consumes the feature's own `useCatalog` hook — never Supabase
 * directly — and renders one real state per the brief's capability-aware state
 * requirements: cold loading, error with retry only while no snapshot exists
 * (a failed background refetch keeps the populated grid on screen — TanStack
 * retains `data`, and the shared QueryClient refetches on focus/reconnect for
 * long-lived kiosk sessions), whole-catalog empty (an empty products array
 * means the whole catalog is empty — the same semantic as Home), or the
 * populated grid. The error object is passed through so `ErrorState` decides
 * whether retry is worth offering.
 *
 * Root destinations use REPLACE semantics so re-selecting one never stacks
 * duplicate history (plan Design decision 5); product cards are PUSHED to
 * `/product-detail` so this list stays mounted behind the detail and preserves
 * its scroll position. Unavailable products are never filtered out — they stay
 * discoverable with their textual availability (plan Design decision 10).
 */
export function ProductsScreen() {
  const router = useRouter();
  const catalog = useCatalog();

  const handleRootNavigate = useCallback(
    (destination: CatalogDestination) => {
      switch (destination) {
        case "home":
          router.replace("/");
          break;
        case "products":
          router.replace("/products");
          break;
        case "brands":
          router.replace("/brands");
          break;
        case "categories":
          router.replace("/categories");
          break;
        case "search":
          router.replace("/search");
          break;
        default: {
          // Compile-time exhaustiveness: if CatalogDestination gains a member,
          // this assignment fails the build instead of silently no-oping here.
          const exhaustive: never = destination;
          return exhaustive;
        }
      }
    },
    [router],
  );

  const handleProductPress = useCallback(
    (product: CatalogProductView) => {
      router.push({ pathname: "/product-detail", params: { productId: product.id } });
    },
    [router],
  );

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
  // refetch TanStack keeps `data` and the populated grid stays on screen
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

  const products = view.products;

  return (
    <Screen>
      <View className="flex-1">
        <View className="gap-3 px-6 pb-2 pt-6">
          <Text variant="h1" accessibilityRole="header">
            All products
          </Text>
          <Text variant="body" tone="muted">
            {productCountLabel(products.length)}
          </Text>
          <CatalogNavigation current="products" onNavigate={handleRootNavigate} />
        </View>
        <CatalogGrid
          data={products}
          renderItem={renderProductCard}
          keyExtractor={productKeyExtractor}
          onItemPress={handleProductPress}
          testID="products-grid"
          className="px-4"
        />
      </View>
    </Screen>
  );
}

function productCountLabel(count: number): string {
  return count === 1 ? "1 product" : `${count} products`;
}
