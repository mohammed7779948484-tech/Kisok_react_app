import { useCallback } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Text } from "@/components/ui";

import { BrandCard } from "../../components/brand-card";
import { CatalogGrid, type CatalogGridRowInfo } from "../../components/catalog-grid";
import { CatalogNavigation, type CatalogDestination } from "../../components/catalog-navigation";
import type { CatalogBrandView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";

/**
 * Stable by construction (module scope): a fresh inline keyExtractor would
 * give the grid a new prop identity on every render.
 */
const brandKeyExtractor = (brand: CatalogBrandView) => brand.id;

/**
 * All Brands (AC-04): every `view.brands` card with its derived product count.
 *
 * The brands collection is unbounded in principle — it grows with the store's
 * assortment — so it renders through the T03 `CatalogGrid` (FlashList,
 * 2/3/4 columns), the feature's scalable composition, exactly like All
 * Products; a bounded composition would need a size ceiling nobody can state.
 * `BrandCard` is the whole-card press target and owns the derived count copy.
 *
 * The screen consumes the feature's own `useCatalog` hook — never Supabase
 * directly — and renders one real state per the brief's capability-aware state
 * requirements: cold loading, error with retry only while no snapshot exists
 * (a failed background refetch keeps the populated grid on screen — TanStack
 * retains `data`, and the shared QueryClient refetches on focus/reconnect for
 * long-lived kiosk sessions), whole-catalog empty (no products means there is
 * nothing to discover from any brand — same copy family as Home and Products),
 * or the populated grid. The error object is passed through so `ErrorState`
 * decides whether retry is worth offering.
 *
 * Root destinations use REPLACE semantics so re-selecting one never stacks
 * duplicate root history (plan Design decision 5); brand cards are PUSHED to
 * `/brand-detail` (object form) so the originating list stays mounted behind
 * the detail and preserves its scroll position.
 *
 * Empty brand collection: brands can be absent while products exist (products
 * may all be unbranded), which is a LOCAL projection of a successful snapshot
 * — never an error, never a network state. It directs the customer to
 * Products (the brief's pinned way forward) via a REPLACE to the Products
 * root: the empty brands surface has nothing to come back to, and a root
 * change uses replace semantics.
 */
export function BrandsScreen() {
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

  const handleBrandPress = useCallback(
    (brand: CatalogBrandView) => {
      router.push({ pathname: "/brand-detail", params: { brandId: brand.id } });
    },
    [router],
  );

  // CatalogGrid memoizes its row renderer against these props — keep the
  // identities stable (useCallback / module scope) so a re-render of this
  // screen does not defeat the virtualizer's row memoization.
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

  if (view.brands.length === 0) {
    // Products exist (checked above), so this is a local empty collection —
    // direct the customer to them rather than to a dead end.
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
    <Screen>
      <View className="flex-1">
        <View className="gap-3 px-6 pb-2 pt-6">
          <Text variant="h1" accessibilityRole="header">
            All brands
          </Text>
          <Text variant="body" tone="muted">
            {brandCountLabel(brands.length)}
          </Text>
          <CatalogNavigation current="brands" onNavigate={handleRootNavigate} />
        </View>
        <CatalogGrid
          data={brands}
          renderItem={renderBrandCard}
          keyExtractor={brandKeyExtractor}
          onItemPress={handleBrandPress}
          testID="brands-grid"
          className="px-4"
        />
      </View>
    </Screen>
  );
}

function brandCountLabel(count: number): string {
  return count === 1 ? "1 brand" : `${count} brands`;
}
