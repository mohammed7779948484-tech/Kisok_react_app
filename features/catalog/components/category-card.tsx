import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";
import { ArrowRight } from "lucide-react-native";

import { AppImage } from "@/components/media/app-image";
import { AspectRatio, Card, Icon, Text } from "@/components/ui";
import { cn } from "@/core/utils";

import type { CatalogCategoryView } from "../model/catalog-view";
import { productCountLabel } from "../model/labels";

export type CategoryCardProps = {
  category: CatalogCategoryView;
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

  const countLabel = productCountLabel(category.productCount);
  const isSubcategory = category.parent !== null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${category.name}${isSubcategory ? `, subcategory of ${category.parent!.name}` : ""}, ${countLabel}`}
      onPress={handlePress}
      className="h-full active:scale-[0.985]"
    >
      <Card
        className={cn(
          "h-full overflow-hidden border-border bg-card shadow-none transition-shadow",
          className,
        )}
      >
        <AspectRatio ratio={16 / 10} className="w-full bg-muted/20">
          <AppImage
            uri={category.image?.secureUrl ?? null}
            alt={category.name}
            contentFit="cover"
            className="h-full w-full"
          />
        </AspectRatio>

        <View className="flex-1 justify-between gap-3 p-4">
          <View className="gap-1">
            <Text
              variant="caption"
              tone="primary"
              className="font-semibold uppercase tracking-wider"
            >
              {isSubcategory ? `In ${category.parent!.name}` : "Category"}
            </Text>
            <Text variant="h3" numberOfLines={1} className="font-semibold">
              {category.name}
            </Text>
          </View>

          <View className="flex-row items-center justify-between border-t border-border/60 pt-3">
            <Text variant="caption" tone="muted">
              {countLabel}
            </Text>
            <Icon as={ArrowRight} size={16} className="text-muted-foreground" />
          </View>
        </View>
      </Card>
    </Pressable>
  );
});
