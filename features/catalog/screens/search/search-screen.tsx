import { useCallback, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Input, Text } from "@/components/ui";

import { CatalogGrid, type CatalogGridRowInfo } from "../../components/catalog-grid";
import { CatalogNavigation, type CatalogDestination } from "../../components/catalog-navigation";
import { ProductCard } from "../../components/product-card";
import type { CatalogProductView, CatalogSearchResult } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";

/**
 * Stable by construction (module scope): a fresh inline keyExtractor would
 * give the grid a new prop identity on every render.
 */
const productKeyExtractor = (product: CatalogProductView) => product.id;

/**
 * Local Catalog Search (AC-06): a customer-typed query matched purely against
 * the loaded snapshot — `CatalogView.search`, the pure model function that
 * already implements trim + case/diacritic normalization and matching across
 * product names/keywords, brand, category, variant title/keywords and option
 * type/value labels. There is no network request, no SKU/barcode matching and
 * no re-implemented normalization here.
 *
 * Two state layers:
 *
 * - Snapshot layer (one `useCatalog` read, shared semantics with Home and
 *   Products): cold loading, error with retry only while NO snapshot exists (a
 *   failed background refetch keeps the populated search surface on screen —
 *   the T04-R03 stated rule), or whole-catalog empty. The search surface never
 *   renders in those states: search states are local projections of a
 *   successful snapshot and never pretend to have network states of their own.
 * - Search layer (pure local projection): the query lives only in this
 *   component's state (it is view state, not server state). The model runs per
 *   keystroke — it is local and cheap (the model precomputes each product's
 *   normalized `searchText` once), so there is no debounce and no duplicated
 *   query state. One persistent status line renders the idle prompt, the
 *   too-short hint, the no-match message or the result count; it carries the
 *   polite live region so screen readers hear result changes. The input is
 *   never unmounted or blurred between states, so the customer can keep
 *   editing a no-match query.
 *
 * Results render through the T03 `CatalogGrid` (FlashList): a two-character
 * query can match the whole catalog, so the result set is unbounded by nature
 * and virtualizes per the RN list rules, exactly like All Products. Root
 * destinations use REPLACE semantics so re-selecting one never stacks
 * duplicate history (plan Design decision 5); result cards are PUSHED to
 * `/product-detail` so the search results stay mounted behind the detail.
 */
export function SearchScreen() {
  const router = useRouter();
  const catalog = useCatalog();
  // View state, not server state: the query string lives here and nowhere else.
  const [query, setQuery] = useState("");

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
  // refetch TanStack keeps `data` and the populated search surface stays on
  // screen through the blip (see the state rules in the component doc comment).
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

  return (
    <Screen>
      <View className="flex-1">
        <View className="gap-3 px-6 pb-2 pt-6">
          <Text variant="h1" accessibilityRole="header">
            Search
          </Text>
          <Input
            label="Search products"
            placeholder="Search by product, brand or category"
            value={query}
            onChangeText={setQuery}
            // Landing on a dedicated search screen is itself the intent to
            // type, so the field takes focus (and the keyboard) immediately.
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          <Text variant="body" tone="muted" accessibilityLiveRegion="polite">
            {searchStatusMessage(searchResult)}
          </Text>
          <CatalogNavigation current="search" onNavigate={handleRootNavigate} />
        </View>
        {searchResult.state === "results" ? (
          <CatalogGrid
            data={searchResult.products}
            renderItem={renderProductCard}
            keyExtractor={productKeyExtractor}
            onItemPress={handleProductPress}
            testID="search-results-grid"
            className="px-4"
          />
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * The four distinct search-state messages, keyed off the model's state. The
 * switch is exhaustive over `CatalogSearchResult["state"]`: adding a state
 * fails the build here instead of silently falling through.
 */
function searchStatusMessage(searchResult: CatalogSearchResult): string {
  switch (searchResult.state) {
    case "idle":
      return "Type to search the products in this store. Matching products appear as you type.";
    case "too-short":
      return "Keep typing — search starts with at least 2 characters.";
    case "no-match":
      return `No products match "${searchResult.query}". Try a different word — search covers only the products currently in this catalog.`;
    case "results":
      return searchResultCountLabel(searchResult.products.length);
  }
}

function searchResultCountLabel(count: number): string {
  return count === 1 ? "1 matching product" : `${count} matching products`;
}
