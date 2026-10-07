import { useCallback } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import { ContentContainer, EmptyState, PageHeading, useLayout } from "@/design-system";

import { CatalogShell } from "../../components/catalog-shell";
import { CategoryCard } from "../../components/category-card";
import { HELP_ME_CHOOSE_PILL_CLEARANCE } from "../../components/help-me-choose-pill";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogLoadingState,
} from "../../components/catalog-state-panel";
import type { CatalogCategoryView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";

/** Alternating row proportions give the directory its editorial rhythm. */
const ROW_SHAPES = [
  { lead: 1.3, height: 280 },
  { lead: 1.65, height: 360 },
] as const;
/** The page's own foot room, plus the room the floating Help Me Choose pill needs. */
const CONTENT_BOTTOM_PADDING = 64 + HELP_ME_CHOOSE_PILL_CLEARANCE;

export function CategoriesScreen() {
  const router = useRouter();
  const catalog = useCatalog();
  const { isExpanded, isCompact } = useLayout();

  const handleCategoryPress = useCallback(
    (category: CatalogCategoryView) => {
      router.push({ pathname: "/category-detail", params: { categoryId: category.id } });
    },
    [router],
  );

  if (catalog.isPending) return <CatalogLoadingState destination="categories" />;

  if (catalog.isError && !catalog.data) {
    return (
      <CatalogErrorState
        destination="categories"
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
      />
    );
  }

  const view = catalog.data;
  if (!view || view.products.length === 0) {
    return <CatalogEmptyState destination="categories" onRetry={() => void catalog.refetch()} />;
  }

  const categories = view.rootCategories.filter((category) => category.productCount > 0);

  const heading = (
    <PageHeading
      className="pt-8"
      wide={isExpanded}
      layout="split"
      breadcrumb={[
        { label: "Explore", onPress: () => router.replace("/") },
        { label: "Categories" },
      ]}
      eyebrow="Browse by category"
      title="Categories"
      description="Choose a product family, then narrow into a more specific category when it helps."
    />
  );

  if (categories.length === 0) {
    return (
      <CatalogShell currentDestination="categories" settings={view.settings}>
        <ContentContainer>{heading}</ContentContainer>
        <EmptyState
          title="No categories yet"
          description="This store has no categories listed right now. You can still browse all of its products."
          action={{ label: "Browse all products", onPress: () => router.replace("/products") }}
        />
      </CatalogShell>
    );
  }

  const rows: CatalogCategoryView[][] = [];
  const perRow = isExpanded ? 2 : 1;
  for (let index = 0; index < categories.length; index += perRow) {
    rows.push(categories.slice(index, index + perRow));
  }

  return (
    <CatalogShell currentDestination="categories" settings={view.settings} helpMeChoose={{}}>
      <ScrollView
        testID="categories-list"
        contentContainerStyle={{ paddingBottom: CONTENT_BOTTOM_PADDING }}
      >
        <ContentContainer className="gap-8">
          {heading}
          <View className="gap-5">
            {rows.map((row, rowIndex) => {
              const shape = ROW_SHAPES[rowIndex % ROW_SHAPES.length] ?? ROW_SHAPES[0];
              return (
                <View
                  key={row.map((category) => category.id).join("|")}
                  className="flex-row gap-5"
                  style={{ height: isCompact ? undefined : shape.height }}
                >
                  {row.map((category, index) => (
                    <View
                      key={category.id}
                      style={{ flex: row.length > 1 && index === 0 ? shape.lead : 1 }}
                    >
                      <CategoryCard
                        category={category}
                        onPress={handleCategoryPress}
                        stacked={isCompact}
                      />
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        </ContentContainer>
      </ScrollView>
    </CatalogShell>
  );
}
