import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";

import { AppImage } from "@/components/media/app-image";
import { Card, Text } from "@/components/ui";
import { cn } from "@/core/utils";

import type { CatalogCategoryView } from "../model/catalog-view";
import { productCountLabel } from "../model/labels";

/**
 * Whole-card navigation for one category in the Catalog (AC-05).
 *
 * One Pressable wraps the whole card; the owning screen wires `onPress` to the
 * category detail route. The product count is the view's derived number
 * (parent categories aggregate direct children, de-duplicated), spoken in
 * words. No fetching, no store, no router.
 */
export type CategoryCardProps = {
  category: CatalogCategoryView;
  /** Stable press handler: CatalogGrid hands every row one shared handler. */
  onPress: (category: CatalogCategoryView) => void;
  className?: string;
};

export const CategoryCard = memo(function CategoryCard({
  category,
  onPress,
  className,
}: CategoryCardProps) {
  const handlePress = useCallback(() => {
    onPress(category);
  }, [onPress, category]);
  // The count label is the feature's shared copy helper (model/labels.ts) —
  // the same sentence every Catalog surface speaks for a derived count.
  const countLabel = productCountLabel(category.productCount);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${category.name}${category.parent ? `, subcategory of ${category.parent.name}` : ""}, ${countLabel}`}
      onPress={handlePress}
      className="h-full active:scale-[0.98] active:opacity-90"
    >
      <Card className={cn("h-full overflow-hidden", className)}>
        <AppImage
          uri={category.image?.secureUrl ?? null}
          alt={category.name}
          contentFit="cover"
          className="aspect-square w-full"
        />
        <View className="min-h-28 flex-1 justify-between gap-2 border-t border-border bg-card p-4">
          <Text variant="caption" tone="primary">
            {category.parent ? `In ${category.parent.name}` : "Main category"}
          </Text>
          <Text variant="h3">{category.name}</Text>
          <Text variant="label" tone="muted">
            {countLabel}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
});
