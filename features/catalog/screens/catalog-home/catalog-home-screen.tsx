import { useCallback } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Button, Text } from "@/components/ui";
import { useResponsiveValue } from "@/core/responsive";

import { BrandCard } from "../../components/brand-card";
import { CatalogNavigation, type CatalogDestination } from "../../components/catalog-navigation";
import { CategoryCard } from "../../components/category-card";
import { ProductCard } from "../../components/product-card";
import type { CatalogFullSettings } from "../../model/catalog-snapshot.schema";
import type {
  CatalogBrandView,
  CatalogCategoryView,
  CatalogProductView,
  CatalogView,
} from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";

/**
 * Catalog Home (AC-02, AC-08): store identity, root navigation and the bounded
 * discovery sections of the current snapshot.
 *
 * The screen consumes the feature's own `useCatalog` hook — never Supabase
 * directly — and renders one real state per the brief's capability-aware state
 * requirements: cold loading, error with retry only while no snapshot exists
 * (a failed background refetch keeps the populated Home on screen — TanStack
 * retains `data`, and the shared QueryClient refetches on focus/reconnect for
 * long-lived kiosk sessions), whole-catalog empty, or the populated Home. The
 * error object is passed through so `ErrorState` decides whether retry is
 * worth offering.
 *
 * Root destinations use REPLACE semantics so re-selecting one never stacks
 * duplicate history (plan Design decision 5); detail routes are PUSHED so the
 * originating surface stays mounted behind them. The bounded Home sections come
 * pre-bounded from the view model and are deliberately NOT virtualized.
 */
export function CatalogHomeScreen() {
  const router = useRouter();
  const catalog = useCatalog();
  // Bounded sections are small and fixed-size; only the column count is
  // responsive, matching the CatalogGrid contract (2/3/4 columns).
  const columns = useResponsiveValue({ compact: 2, medium: 3, expanded: 4 });

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

  const handleCategoryPress = useCallback(
    (category: CatalogCategoryView) => {
      router.push({ pathname: "/category-detail", params: { categoryId: category.id } });
    },
    [router],
  );

  const handleProductPress = useCallback(
    (product: CatalogProductView) => {
      router.push({ pathname: "/product-detail", params: { productId: product.id } });
    },
    [router],
  );

  if (catalog.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading the catalog…" />
      </Screen>
    );
  }

  // Full-screen error only when NO snapshot exists: on a failed background
  // refetch TanStack keeps `data` and the populated Home stays on screen
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

  const { brands, categories, featuredProducts } = view.home;

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-6 p-6">
        <Text variant="h1" accessibilityRole="header">
          {isFullSettings(view.settings) ? view.settings.store_name : "Catalog"}
        </Text>

        <CatalogNavigation current="home" onNavigate={handleRootNavigate} />

        {brands.length > 0 ? (
          <HomeSection
            title="Brands"
            browseAllLabel="Browse all brands"
            onBrowseAll={() => router.replace("/brands")}
          >
            <HomeCards
              items={brands}
              columns={columns}
              renderItem={(brand) => <BrandCard brand={brand} onPress={handleBrandPress} />}
            />
          </HomeSection>
        ) : null}

        {categories.length > 0 ? (
          <HomeSection
            title="Categories"
            browseAllLabel="Browse all categories"
            onBrowseAll={() => router.replace("/categories")}
          >
            <HomeCards
              items={categories}
              columns={columns}
              renderItem={(category) => (
                <CategoryCard category={category} onPress={handleCategoryPress} />
              )}
            />
          </HomeSection>
        ) : null}

        {featuredProducts.length > 0 ? (
          <HomeSection
            title="Featured products"
            browseAllLabel="Browse all products"
            onBrowseAll={() => router.replace("/products")}
          >
            <HomeCards
              items={featuredProducts}
              columns={columns}
              renderItem={(product) => (
                <ProductCard product={product} onPress={handleProductPress} />
              )}
            />
          </HomeSection>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function isFullSettings(settings: CatalogView["settings"]): settings is CatalogFullSettings {
  return "store_name" in settings;
}

type HomeSectionProps = {
  title: string;
  /** Visible label naming the destination, e.g. "Browse all brands". */
  browseAllLabel: string;
  /** REPLACE semantics: a Browse-all action always targets a root destination. */
  onBrowseAll: () => void;
  children: React.ReactNode;
};

/** One bounded Home section: its heading, its Browse-all action and its cards. */
function HomeSection({ title, browseAllLabel, onBrowseAll, children }: HomeSectionProps) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="h2" accessibilityRole="header">
          {title}
        </Text>
        <Button variant="ghost" onPress={onBrowseAll} className="shrink-0">
          <Text>{browseAllLabel}</Text>
        </Button>
      </View>
      {children}
    </View>
  );
}

type HomeCardsProps<ItemT extends { id: string }> = {
  items: ItemT[];
  columns: number;
  renderItem: (item: ItemT) => React.ReactElement;
};

/**
 * Fixed rows of equal-width cards for a bounded Home section. The view model
 * already bounds these collections, so a ScrollView/View composition is correct
 * here — virtualizing six brands or eight featured products would be ceremony.
 * Each card sits in a `flex-1` wrapper View that is the row's direct child (the
 * T03 card roots are Pressables that carry no flex of their own, so the wrapper
 * is what makes them flex items), keyed by the item's id; the final row is
 * padded with empty-slot Views so every card keeps one width.
 */
function HomeCards<ItemT extends { id: string }>({
  items,
  columns,
  renderItem,
}: HomeCardsProps<ItemT>) {
  const rows: ItemT[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }

  return (
    <View className="gap-3">
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-3">
          {row.map((item) => (
            <View key={item.id} className="flex-1">
              {renderItem(item)}
            </View>
          ))}
          {row.length < columns
            ? Array.from({ length: columns - row.length }, (_, emptySlot) => (
                <View key={`empty-${emptySlot}`} className="flex-1" />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}
