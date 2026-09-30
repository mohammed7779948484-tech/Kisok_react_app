import { View } from "react-native";

import { Eyebrow, SectionLink, Text, type MediaTint } from "@/design-system";

import { CategoryPortal } from "../../../components/category-portal";
import type { CatalogCategoryView, CatalogProductView } from "../../../model/catalog-view";
import { FeaturedShowcase } from "./featured-showcase";

const PORTAL_TINTS: readonly MediaTint[] = ["evergreen", "stone", "sage", "sand"];

/**
 * The opening of Home: a map of the store's categories and, when the store
 * features products, a showcase that moves through them. The mosaic adapts to
 * how many categories exist — one, two, three, or four and more.
 */
export function StoreUniverse({
  categories,
  featured,
  height,
  split,
  onCategoryPress,
  onViewCategories,
  onProductPress,
}: {
  categories: CatalogCategoryView[];
  featured: CatalogProductView[];
  /** The zone height on a landscape tablet, so the opening fills the first view. */
  height: number | undefined;
  split: boolean;
  onCategoryPress: (category: CatalogCategoryView) => void;
  onViewCategories: () => void;
  onProductPress: (product: CatalogProductView) => void;
}) {
  const showMap = categories.length > 0;
  return (
    <View className={split ? "flex-row gap-7" : "gap-6"} style={split ? { height } : undefined}>
      {showMap ? (
        <View
          className="gap-7 rounded-3xl border border-border bg-card p-9"
          style={split ? { flex: 1.66 } : { minHeight: 560 }}
        >
          <View className="flex-row flex-wrap items-end justify-between gap-4">
            <View className="gap-2.5">
              <Eyebrow rule>Discover the store</Eyebrow>
              <Text variant="h1" accessibilityRole="header" aria-level={2}>
                Store Map
              </Text>
              <Text variant="body" tone="muted">
                Explore the store by category.
              </Text>
            </View>
            <SectionLink label="View all categories" onPress={onViewCategories} />
          </View>
          <StoreMapMosaic categories={categories} onPress={onCategoryPress} />
        </View>
      ) : null}
      {featured.length > 0 ? (
        <FeaturedShowcase
          products={featured}
          onPress={onProductPress}
          className={split ? "flex-1" : "h-[560px]"}
        />
      ) : null}
    </View>
  );
}

function StoreMapMosaic({
  categories,
  onPress,
}: {
  categories: CatalogCategoryView[];
  onPress: (category: CatalogCategoryView) => void;
}) {
  const [first, second, third, fourth] = categories;
  const tile = (
    category: CatalogCategoryView | undefined,
    index: number,
    emphasis: "feature" | "regular" | "compact",
    className?: string,
  ) =>
    category ? (
      <CategoryPortal
        key={category.id}
        category={category}
        onPress={onPress}
        tint={PORTAL_TINTS[index % PORTAL_TINTS.length] ?? "stone"}
        emphasis={emphasis}
        className={className}
      />
    ) : null;

  if (categories.length === 1) {
    return <View className="flex-1">{tile(first, 0, "feature", "flex-1")}</View>;
  }
  if (categories.length === 2) {
    return (
      <View className="min-h-[300px] flex-1 flex-row gap-4">
        {tile(first, 0, "feature", "flex-1")}
        {tile(second, 1, "feature", "flex-1")}
      </View>
    );
  }
  return (
    <View className="min-h-[300px] flex-1 flex-row gap-4">
      {tile(first, 0, "feature", "w-[38%]")}
      <View className="flex-1 gap-4">
        {tile(second, 1, "regular", "flex-1")}
        {fourth ? (
          <View className="flex-1 flex-row gap-4">
            {tile(third, 2, "compact", "flex-[1.2]")}
            {tile(fourth, 3, "compact", "flex-1")}
          </View>
        ) : (
          tile(third, 2, "regular", "flex-1")
        )}
      </View>
    </View>
  );
}
