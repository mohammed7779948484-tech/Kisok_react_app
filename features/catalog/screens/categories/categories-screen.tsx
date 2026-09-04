import { useCallback } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Text } from "@/components/ui";

import { CatalogGrid, type CatalogGridRowInfo } from "../../components/catalog-grid";
import { CatalogNavigation, type CatalogDestination } from "../../components/catalog-navigation";
import { CategoryCard } from "../../components/category-card";
import type { CatalogCategoryView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";

/**
 * Stable by construction (module scope): a fresh inline keyExtractor would
 * give the grid a new prop identity on every render.
 */
const categoryKeyExtractor = (category: CatalogCategoryView) => category.id;

/**
 * All Categories (AC-05, and the last root destination AC-02 links to): the
 * two-level category hierarchy as whole-card navigation.
 *
 * Hierarchy presentation: a FLAT ORDERED LIST in the T03 `CatalogGrid` — each
 * root immediately followed by its direct children, in the snapshot's root
 * order. The collection (roots + children) is unbounded in principle — it
 * grows with the store's assortment — so the feature's scalable composition
 * (FlashList, 2/3/4 columns) is the honest RN-list choice, exactly like All
 * Products and All Brands; a sectioned ScrollView would mount every card
 * upfront with no ceiling anyone can state. The hierarchy stays navigable:
 * every card opens its own detail, which makes the card's own context
 * explicit — its direct children (as a navigable strip, roots only) and its
 * scoped products; the parent of a child is not rendered there, and the way
 * back to it is the detail's `Go back` control. Adjacency keeps each root's
 * children contiguous. `CategoryCard` is the whole-card press target and owns
 * the derived count copy (roots aggregate their direct children,
 * de-duplicated — Design decision 8).
 *
 * The screen consumes the feature's own `useCatalog` hook — never Supabase
 * directly — and renders one real state per the brief's capability-aware state
 * requirements: cold loading, error with retry only while no snapshot exists
 * (a failed background refetch keeps the populated grid on screen — TanStack
 * retains `data`, and the shared QueryClient refetches on focus/reconnect for
 * long-lived kiosk sessions), whole-catalog empty (no products means there is
 * nothing to discover from any category — same copy family as Home, Products
 * and Brands), or the populated grid. The error object is passed through so
 * `ErrorState` decides whether retry is worth offering.
 *
 * Root destinations use REPLACE semantics so re-selecting one never stacks
 * duplicate root history (plan Design decision 5); category cards are PUSHED
 * to `/category-detail` (object form) so the originating list stays mounted
 * behind the detail and preserves its scroll position.
 *
 * Empty root category collection: categories can be absent while products
 * exist (every product may be uncategorized), which is a LOCAL projection of
 * a successful snapshot — never an error, never a network state. It directs
 * the customer to Products (mirroring the Brands screen's way onward) via a
 * REPLACE to the Products root: the empty categories surface has nothing to
 * come back to, and a root change uses replace semantics.
 */
export function CategoriesScreen() {
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

  const handleCategoryPress = useCallback(
    (category: CatalogCategoryView) => {
      router.push({ pathname: "/category-detail", params: { categoryId: category.id } });
    },
    [router],
  );

  // CatalogGrid memoizes its row renderer against these props — keep the
  // identities stable (useCallback / module scope) so a re-render of this
  // screen does not defeat the virtualizer's row memoization.
  const renderCategoryCard = useCallback(
    ({ item, onPress }: CatalogGridRowInfo<CatalogCategoryView>) => (
      <CategoryCard category={item} onPress={onPress} />
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

  if (view.rootCategories.length === 0) {
    // Products exist (checked above), so this is a local empty collection —
    // direct the customer to them rather than to a dead end.
    return (
      <Screen>
        <EmptyState
          title="No categories yet"
          description="This store has no categories listed right now. You can still browse all of its products."
          action={{ label: "Browse all products", onPress: () => router.replace("/products") }}
        />
      </Screen>
    );
  }

  // The flat ordered projection of the two-level hierarchy: each root
  // immediately followed by its direct children. Derived per render from the
  // view — same as the other discovery screens' local projections.
  const cards: CatalogCategoryView[] = [];
  for (const root of view.rootCategories) {
    cards.push(root);
    for (const child of root.children) {
      cards.push(child);
    }
  }

  return (
    <Screen>
      <View className="flex-1">
        <View className="gap-3 px-6 pb-2 pt-6">
          <Text variant="h1" accessibilityRole="header">
            All categories
          </Text>
          <Text variant="body" tone="muted">
            {categoryCountLabel(cards.length)}
          </Text>
          <CatalogNavigation current="categories" onNavigate={handleRootNavigate} />
        </View>
        <CatalogGrid
          data={cards}
          renderItem={renderCategoryCard}
          keyExtractor={categoryKeyExtractor}
          onItemPress={handleCategoryPress}
          testID="categories-grid"
          className="px-4"
        />
      </View>
    </Screen>
  );
}

function categoryCountLabel(count: number): string {
  return count === 1 ? "1 category" : `${count} categories`;
}
