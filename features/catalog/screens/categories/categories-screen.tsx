import { useCallback } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ArrowRight } from "lucide-react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { AppImage } from "@/components/media/app-image";
import { Icon, Text } from "@/components/ui";

import { CatalogShell } from "../../components/catalog-shell";
import { deriveCategoryFamilies, type CategoryFamily } from "../../model/category-presentation";
import type { CatalogCategoryView } from "../../model/catalog-view";
import { productCountLabel } from "../../model/labels";
import { useCatalog } from "../../queries/use-catalog";

export function CategoriesScreen() {
  const router = useRouter();
  const catalog = useCatalog();

  const handleCategoryPress = useCallback(
    (category: CatalogCategoryView) => {
      router.push({ pathname: "/category-detail", params: { categoryId: category.id } });
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

  const families = deriveCategoryFamilies(view.rootCategories);

  return (
    <CatalogShell
      currentDestination="categories"
      settings={view.settings}
      title="All categories"
      subtitle="Shop by department and category"
      countLabel={`${view.rootCategories.length} departments`}
    >
      <ScrollView contentContainerClassName="gap-10 px-5 pb-36 pt-6 md:px-8">
        {families.map((family, index) => (
          <CategoryFamilySection
            key={family.root.id}
            family={family}
            onCategoryPress={handleCategoryPress}
            isLast={index === families.length - 1}
          />
        ))}
      </ScrollView>
    </CatalogShell>
  );
}

type CategoryFamilySectionProps = {
  family: CategoryFamily;
  onCategoryPress: (category: CatalogCategoryView) => void;
  isLast: boolean;
};

function CategoryFamilySection({ family, onCategoryPress, isLast }: CategoryFamilySectionProps) {
  const { root, children } = family;

  return (
    <View className={isLast ? "gap-4" : "gap-4 border-b border-border/50 pb-10"}>
      {/* Root Department Header */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${root.name}, main department, ${productCountLabel(root.productCount)}`}
        onPress={() => onCategoryPress(root)}
        className="min-h-touch flex-row items-center justify-between gap-4 active:opacity-80"
      >
        <View className="flex-1 flex-row items-center gap-4">
          <View className="h-16 w-16 overflow-hidden rounded-xl bg-muted/20 md:h-20 md:w-20">
            <AppImage
              uri={root.image?.secureUrl ?? null}
              alt={root.name}
              contentFit="cover"
              className="h-full w-full"
            />
          </View>
          <View className="flex-1 gap-0.5">
            <Text
              variant="caption"
              tone="primary"
              className="font-semibold uppercase tracking-wider"
            >
              Department
            </Text>
            <Text variant="h2" accessibilityRole="header" className="text-xl font-bold md:text-2xl">
              {root.name}
            </Text>
            <Text variant="caption" tone="muted">
              {productCountLabel(root.productCount)}
            </Text>
          </View>
        </View>

        <View className="min-h-touch flex-row items-center gap-1.5 rounded-lg bg-secondary px-3.5 py-2">
          <Text variant="caption" className="font-semibold text-secondary-foreground">
            Explore department
          </Text>
          <Icon as={ArrowRight} size={14} className="text-secondary-foreground" />
        </View>
      </Pressable>

      {/* Direct Subcategories grouping */}
      {children.length > 0 ? (
        <View className="gap-2.5 pt-1">
          <Text variant="caption" tone="muted" className="font-semibold">
            Subcategories:
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {children.map((child) => (
              <Pressable
                key={child.id}
                accessibilityRole="button"
                accessibilityLabel={`${child.name}, subcategory of ${root.name}, ${productCountLabel(child.productCount)}`}
                onPress={() => onCategoryPress(child)}
                className="min-h-touch flex-row items-center gap-3 rounded-xl border border-border/80 bg-card p-2.5 pr-4 shadow-sm active:scale-[0.99] active:bg-muted/50"
              >
                <View className="h-10 w-10 overflow-hidden rounded-lg bg-muted/40">
                  <AppImage
                    uri={child.image?.secureUrl ?? null}
                    alt={child.name}
                    contentFit="cover"
                    className="h-full w-full"
                  />
                </View>
                <View>
                  <Text variant="body" className="text-sm font-semibold">
                    {child.name}
                  </Text>
                  <Text variant="caption" tone="muted" className="text-xs">
                    {productCountLabel(child.productCount)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
