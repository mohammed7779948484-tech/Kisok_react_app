import { useCallback, useState } from "react";
import { Keyboard, Pressable, ScrollView, View } from "react-native";
import { SearchX } from "lucide-react-native";
import { useRouter } from "expo-router";

import {
  Breadcrumb,
  ContentContainer,
  EmptyState,
  Eyebrow,
  SearchInput,
  SectionLink,
  Text,
  useLayout,
} from "@/design-system";

import { BrowseResults } from "../../components/browse-results";
import { CatalogShell } from "../../components/catalog-shell";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogLoadingState,
} from "../../components/catalog-state-panel";
import type {
  CatalogProductView,
  CatalogSearchResult,
  CatalogView,
} from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";
import { productDetailHref } from "../product-detail/product-detail-href";

export type SearchScreenProps = {
  /** A query to start with, e.g. from a Home discovery shortcut. */
  initialQuery?: string;
};

export function SearchScreen({ initialQuery }: SearchScreenProps = {}) {
  const router = useRouter();
  const catalog = useCatalog();
  const { isExpanded } = useLayout();
  const [query, setQuery] = useState(initialQuery ?? "");

  const handleProductPress = useCallback(
    (product: CatalogProductView) => {
      router.push(productDetailHref(product.id, "Back to search results"));
    },
    [router],
  );

  if (catalog.isPending) return <CatalogLoadingState destination="search" />;

  if (catalog.isError && !catalog.data) {
    return (
      <CatalogErrorState
        destination="search"
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
      />
    );
  }

  const view = catalog.data;
  if (!view || view.products.length === 0) {
    return <CatalogEmptyState destination="search" onRetry={() => void catalog.refetch()} />;
  }

  const searchResult = view.search(query);

  return (
    <CatalogShell currentDestination="search" settings={view.settings}>
      <View className="bg-primary">
        <ContentContainer className="gap-3 py-6">
          <Breadcrumb
            inverse
            items={[{ label: "Explore", onPress: () => router.replace("/") }, { label: "Search" }]}
          />
          <View className={isExpanded ? "flex-row items-center gap-8" : "gap-3"}>
            <View className={isExpanded ? "flex-row items-baseline gap-4" : "gap-1"}>
              <Text className="font-sans-bold text-meta tracking-[1px] text-primary-foreground/75">
                Search the whole store
              </Text>
              <Text
                accessibilityRole="header"
                className="font-display text-display-sm text-primary-foreground"
              >
                Search
              </Text>
            </View>
            <SearchInput
              value={query}
              onChangeText={setQuery}
              appearance="inverse"
              size="large"
              autoFocus={!initialQuery}
              placeholder="Products, brands, categories, or options"
              accessibilityLabel="Search catalog"
              onSubmitEditing={() => Keyboard.dismiss()}
              trailing={isExpanded && searchResult.state !== "results" ? "Enter" : undefined}
              className="min-w-0 flex-1"
            />
          </View>
        </ContentContainer>
      </View>

      <SearchBody
        view={view}
        result={searchResult}
        onClear={() => setQuery("")}
        onProductPress={handleProductPress}
        onBrowse={(path) => router.replace(path)}
        onCategory={(categoryId) =>
          router.push({ pathname: "/category-detail", params: { categoryId } })
        }
        onBrand={(brandId) => router.push({ pathname: "/brand-detail", params: { brandId } })}
        wide={isExpanded}
      />
    </CatalogShell>
  );
}

function SearchBody({
  view,
  result,
  onClear,
  onProductPress,
  onBrowse,
  onCategory,
  onBrand,
  wide,
}: {
  view: CatalogView;
  result: CatalogSearchResult;
  onClear: () => void;
  onProductPress: (product: CatalogProductView) => void;
  onBrowse: (path: "/categories" | "/brands" | "/products") => void;
  onCategory: (categoryId: string) => void;
  onBrand: (brandId: string) => void;
  wide: boolean;
}) {
  if (result.state === "results") {
    const count = result.products.length;
    return (
      <BrowseResults
        view={view}
        products={result.products}
        scopeLabel={`Matches for “${result.query}”`}
        matchQuery={result.normalizedQuery}
        onProductPress={onProductPress}
        testID="search-results-grid"
        emptySecondaryAction={{ label: "Clear search", onPress: onClear }}
        header={
          <View className={wide ? "flex-row items-end justify-between gap-8 pt-8" : "gap-4 pt-8"}>
            <View className="min-w-0 shrink gap-3">
              <Eyebrow>Search results</Eyebrow>
              <Text variant="display" accessibilityRole="header">
                “{result.query}”
              </Text>
              <Text variant="lead" accessibilityLiveRegion="polite">
                {count === 1 ? "1 matching product." : `${count} matching products.`} Each card
                shows why it matched.
              </Text>
            </View>
            <View className="flex-row gap-6">
              <SectionLink label="Categories" onPress={() => onBrowse("/categories")} />
              <SectionLink label="Brands" onPress={() => onBrowse("/brands")} />
            </View>
          </View>
        }
      />
    );
  }

  if (result.state === "no-match") {
    return (
      <EmptyState
        framed
        icon={SearchX}
        title={`No matches for “${result.query}”`}
        description="Try a product name, a brand, a category, or an option such as a flavor."
        action={{ label: "Clear search", onPress: onClear }}
        secondaryAction={{ label: "Browse categories", onPress: () => onBrowse("/categories") }}
      />
    );
  }

  // Idle or too short: offer somewhere to start instead of an empty page.
  const categories = view.rootCategories.filter((category) => category.productCount > 0);
  const brands = view.brands.filter((brand) => brand.productCount > 0).slice(0, 10);

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-12">
      <ContentContainer className="gap-8 pt-8">
        <Text variant="body" tone="muted" accessibilityLiveRegion="polite">
          {result.state === "too-short"
            ? "Enter at least 2 characters to search."
            : "Search by product name, brand, category, or an option such as a flavor."}
        </Text>
        <SuggestionGroup
          title="Start with a category"
          items={categories.map((category) => ({ id: category.id, label: category.name }))}
          onPress={onCategory}
        />
        <SuggestionGroup
          title="Or a brand you know"
          items={brands.map((brand) => ({ id: brand.id, label: brand.name }))}
          onPress={onBrand}
          footer={<SectionLink label="All brands" onPress={() => onBrowse("/brands")} />}
        />
      </ContentContainer>
    </ScrollView>
  );
}

function SuggestionGroup({
  title,
  items,
  onPress,
  footer,
}: {
  title: string;
  items: { id: string; label: string }[];
  onPress: (id: string) => void;
  footer?: React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="font-sans-bold text-body-lg">
        {title}
      </Text>
      <View className="flex-row flex-wrap items-center gap-2">
        {items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => onPress(item.id)}
            className="h-touch justify-center rounded-full border border-border bg-card px-5 active:bg-muted"
          >
            <Text className="font-sans-semibold text-body">{item.label}</Text>
          </Pressable>
        ))}
        {footer}
      </View>
    </View>
  );
}
