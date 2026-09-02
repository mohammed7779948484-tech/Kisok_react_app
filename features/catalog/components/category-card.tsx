import { memo, useCallback } from "react";
import { Pressable } from "react-native";

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
      accessibilityLabel={`${category.name}, ${countLabel}`}
      onPress={handlePress}
      className="active:opacity-90"
    >
      <Card className={cn("gap-2 p-2", className)}>
        <AppImage
          uri={category.image?.secureUrl ?? null}
          alt={category.name}
          contentFit="cover"
          className="aspect-square w-full rounded-lg"
        />
        <Text variant="h3" numberOfLines={2}>
          {category.name}
        </Text>
        <Text variant="caption">{countLabel}</Text>
      </Card>
    </Pressable>
  );
});
