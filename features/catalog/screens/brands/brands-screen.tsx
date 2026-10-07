import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, PageHeading, SearchInput, usePageGutter, useLayout } from "@/design-system";

import { BrandCard } from "../../components/brand-card";
import { CatalogGrid, type CatalogGridRowInfo } from "../../components/catalog-grid";
import { CatalogShell } from "../../components/catalog-shell";
import { useHelpMeChoosePillLayout } from "../../components/help-me-choose-pill";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogLoadingState,
} from "../../components/catalog-state-panel";
import { normalizeCatalogSearchText, type CatalogBrandView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";

const brandKeyExtractor = (brand: CatalogBrandView) => brand.id;

export function BrandsScreen() {
  const pillClearance = useHelpMeChoosePillLayout().clearance;
  const router = useRouter();
  const catalog = useCatalog();
  const gutter = usePageGutter();
  const { isExpanded } = useLayout();
  const [query, setQuery] = useState("");

  const handleBrandPress = useCallback(
    (brand: CatalogBrandView) => {
      router.push({ pathname: "/brand-detail", params: { brandId: brand.id } });
    },
    [router],
  );

  const view = catalog.data;
  // Option totals per brand, derived once per snapshot.
  const optionCountByBrand = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of view?.products ?? []) {
      if (product.brand) {
        counts.set(product.brand.id, (counts.get(product.brand.id) ?? 0) + product.variants.length);
      }
    }
    return counts;
  }, [view]);

  const renderBrandCard = useCallback(
    ({ item, onPress }: CatalogGridRowInfo<CatalogBrandView>) => (
      <BrandCard
        brand={item}
        size="directory"
        onPress={onPress}
        optionCount={optionCountByBrand.get(item.id)}
      />
    ),
    [optionCountByBrand],
  );

  if (catalog.isPending) return <CatalogLoadingState destination="brands" />;

  if (catalog.isError && !view) {
    return (
      <CatalogErrorState
        destination="brands"
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
      />
    );
  }

  if (!view || view.products.length === 0) {
    return <CatalogEmptyState destination="brands" onRetry={() => void catalog.refetch()} />;
  }

  // A brand with nothing to browse is not put in front of the customer.
  const stocked = view.brands.filter((brand) => brand.productCount > 0);
  const normalizedQuery = normalizeCatalogSearchText(query);
  const brands = normalizedQuery
    ? stocked.filter((brand) => normalizeCatalogSearchText(brand.name).includes(normalizedQuery))
    : stocked;

  const header = (
    <View className="gap-8 pb-8">
      <PageHeading
        className="pt-8"
        wide={isExpanded}
        layout="split"
        breadcrumb={[{ label: "Explore", onPress: () => router.replace("/") }, { label: "Brands" }]}
        eyebrow="Browse by brand"
        title="Brands"
        description="Find a brand you know, then browse its products and available options."
      />
      {stocked.length > 6 ? (
        <View style={{ maxWidth: 520 }}>
          <SearchInput
            value={query}
            onChangeText={setQuery}
            placeholder="Find a brand…"
            accessibilityLabel="Find a brand"
            className="rounded-lg"
          />
        </View>
      ) : null}
    </View>
  );

  if (stocked.length === 0) {
    return (
      <CatalogShell currentDestination="brands" settings={view.settings}>
        <EmptyState
          title="No brands yet"
          description="This store has no brands listed right now. You can still browse all of its products."
          action={{ label: "Browse all products", onPress: () => router.replace("/products") }}
        />
      </CatalogShell>
    );
  }

  return (
    <CatalogShell currentDestination="brands" settings={view.settings} helpMeChoose={{}}>
      <CatalogGrid
        data={brands}
        renderItem={renderBrandCard}
        keyExtractor={brandKeyExtractor}
        onItemPress={handleBrandPress}
        gap={18}
        minItemWidth={250}
        maxColumns={4}
        horizontalPadding={gutter}
        bottomInset={pillClearance}
        listHeaderComponent={header}
        listEmptyComponent={
          <EmptyState
            className="py-12"
            title={`No brands match “${query.trim()}”`}
            action={{ label: "Show all brands", onPress: () => setQuery("") }}
          />
        }
        testID="brands-grid"
      />
    </CatalogShell>
  );
}
