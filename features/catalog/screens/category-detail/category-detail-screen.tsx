import { useCallback } from "react";
import { ScrollView, View } from "react-native";
import { ArrowRight } from "lucide-react-native";
import { useRouter } from "expo-router";

import {
  Button,
  ContentContainer,
  GridCell,
  Icon,
  ResponsiveGrid,
  SectionHeading,
  Text,
  useLayout,
} from "@/design-system";

import { BrowseResults } from "../../components/browse-results";
import { CatalogHero } from "../../components/catalog-hero";
import { CatalogShell } from "../../components/catalog-shell";
import { CategoryCard } from "../../components/category-card";
import { useHelpMeChoosePillLayout } from "../../components/help-me-choose-pill";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogLoadingState,
  CatalogMissingState,
} from "../../components/catalog-state-panel";
import type { CatalogCategoryView, CatalogProductView } from "../../model/catalog-view";
import { productCountLabel } from "../../model/labels";
import { useCatalog } from "../../queries/use-catalog";
import { productDetailHref } from "../product-detail/product-detail-href";

/** A path page's own foot room, plus the room the floating Help Me Choose pill needs. */

export type CategoryDetailScreenProps = {
  categoryId: string;
};

/**
 * A category page never dead-ends in an empty in-between step: a root with
 * sub-categories offers those paths (and every product at once); any other
 * category shows its products directly.
 */
export function CategoryDetailScreen({ categoryId }: CategoryDetailScreenProps) {
  const pillClearance = useHelpMeChoosePillLayout().clearance;
  const router = useRouter();
  const catalog = useCatalog();
  const { isExpanded } = useLayout();

  const handleProductPress = useCallback(
    (product: CatalogProductView) => {
      const name = catalog.data?.resolveCategory(categoryId)?.name;
      router.push(productDetailHref(product.id, name ? `Back to ${name}` : undefined));
    },
    [router, catalog.data, categoryId],
  );

  const handleChildPress = useCallback(
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

  const category = view.resolveCategory(categoryId);
  if (category === undefined) {
    return (
      <CatalogMissingState
        destination="categories"
        settings={view.settings}
        title="This category is no longer available"
        description="It may have been removed since you started browsing."
        action={{ label: "Back to categories", onPress: () => router.replace("/categories") }}
        secondaryAction={{
          label: "Browse all products",
          onPress: () => router.replace("/products"),
        }}
      />
    );
  }

  const products = view.productsForCategory(categoryId);
  const children = category.children.filter((child) => child.productCount > 0);
  const breadcrumb = [
    { label: "Categories", onPress: () => router.replace("/categories") },
    ...(category.parent
      ? [
          {
            label: category.parent.name,
            onPress: () =>
              router.push({
                pathname: "/category-detail",
                params: { categoryId: category.parent?.id ?? "" },
              }),
          },
        ]
      : []),
    { label: category.name },
  ];

  if (children.length > 0) {
    return (
      <CatalogShell
        currentDestination="categories"
        settings={view.settings}
        helpMeChoose={{ categoryId: category.id }}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 64 + pillClearance }}>
          <ContentContainer className="gap-10">
            <CatalogHero
              wide={isExpanded}
              breadcrumb={breadcrumb}
              eyebrow="Category"
              title={category.name}
              description="Choose a more specific path, or view every product in this category."
              media={category.image}
              mediaTint="evergreen"
            >
              <Button
                variant="tonal"
                onPress={() =>
                  router.push({ pathname: "/products", params: { categoryId: category.id } })
                }
              >
                <Text>View all {productCountLabel(products.length)}</Text>
                <Icon as={ArrowRight} size={18} />
              </Button>
            </CatalogHero>

            <View className="gap-6">
              <SectionHeading
                eyebrow="Choose a path"
                title={`Explore ${category.name}`}
                action={
                  <Text variant="meta" tone="muted">
                    {children.length === 1 ? "1 subcategory" : `${children.length} subcategories`}
                  </Text>
                }
              />
              <ResponsiveGrid minItemWidth={340} gap={18} maxColumns={3}>
                {children.map((child) => (
                  <GridCell key={child.id}>
                    <CategoryCard category={child} variant="path" onPress={handleChildPress} />
                  </GridCell>
                ))}
              </ResponsiveGrid>
            </View>
          </ContentContainer>
        </ScrollView>
      </CatalogShell>
    );
  }

  return (
    <CatalogShell
      currentDestination="categories"
      settings={view.settings}
      helpMeChoose={{ categoryId: category.id }}
    >
      <BrowseResults
        view={view}
        products={products}
        refine="inline"
        showCategoryFacet={false}
        scopeLabel={`${category.name} products`}
        onProductPress={handleProductPress}
        bottomInset={pillClearance}
        testID="category-products-grid"
        header={
          <CatalogHero
            wide={isExpanded}
            breadcrumb={breadcrumb}
            eyebrow="Category"
            title={category.name}
            description={
              products.length > 0
                ? `${productCountLabel(products.length)} in this category.`
                : "Nothing is listed in this category right now."
            }
            media={category.image}
            mediaTint="evergreen"
          />
        }
        emptyTitle={
          products.length === 0 ? "Nothing here right now" : "No products match these filters"
        }
        emptySecondaryAction={{
          label: "Browse all products",
          onPress: () => router.replace("/products"),
        }}
      />
    </CatalogShell>
  );
}
