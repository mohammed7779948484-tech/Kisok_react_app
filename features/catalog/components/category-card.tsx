import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";

import { ArrowDisc, MediaFrame, Text, tintFor, type MediaTint } from "@/design-system";
import { cn } from "@/core/utils";

import type { CatalogCategoryView } from "../model/catalog-view";
import { productCountLabel } from "../model/labels";

export type CategoryCardProps = {
  category: CatalogCategoryView;
  onPress: (category: CatalogCategoryView) => void;
  /**
   * `directory` — the Categories page: imagery beside an editorial name.
   * `path` — a compact row for choosing a sub-category.
   */
  variant?: "directory" | "path";
  /** Directory cards: stack the media above the copy instead of beside it. */
  stacked?: boolean;
  className?: string;
};

const CATEGORY_TINTS: readonly MediaTint[] = ["sage", "sand", "evergreen", "stone"];

export const CategoryCard = memo(function CategoryCard({
  category,
  onPress,
  variant = "directory",
  stacked = false,
  className,
}: CategoryCardProps) {
  const handlePress = useCallback(() => {
    onPress(category);
  }, [onPress, category]);

  const countLabel = productCountLabel(category.productCount);
  const tint = tintFor(category.id, CATEGORY_TINTS);

  if (variant === "path") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${category.name}, ${countLabel}`}
        onPress={handlePress}
        className={cn(
          "min-h-[124px] flex-row items-center gap-5 rounded-xl border border-border bg-card p-3 pr-5 active:opacity-90",
          className,
        )}
      >
        <MediaFrame
          source={category.image}
          alt=""
          fit="cover"
          tint={tint}
          fallbackLabel={category.name}
          className="h-[100px] w-[110px] rounded-lg"
        />
        <View className="min-w-0 flex-1 gap-1">
          <Text numberOfLines={2} className="font-sans-bold text-title">
            {category.name}
          </Text>
          <Text variant="caption" tone="muted">
            {countLabel}
          </Text>
        </View>
        <ArrowDisc tone="tonal" size={34} />
      </Pressable>
    );
  }

  const childNames = category.children.map((child) => child.name);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, ${countLabel}`}
      onPress={handlePress}
      className={cn(
        "h-full overflow-hidden rounded-3xl border border-border bg-card active:opacity-90",
        stacked ? "flex-col" : "flex-row",
        className,
      )}
    >
      <MediaFrame
        source={category.image}
        alt=""
        fit="cover"
        tint={tint}
        fallbackLabel={category.name}
        className={stacked ? "h-[220px] w-full" : "h-full"}
        style={stacked ? undefined : { flexBasis: "44%" }}
      />
      <View className="min-w-0 flex-1 justify-between gap-6 p-7">
        <ArrowDisc className="self-end" />
        <View className="gap-2">
          <Text className="font-sans-semibold text-caption text-muted-foreground">
            {countLabel}
          </Text>
          <Text numberOfLines={3} className="font-display text-display-sm text-foreground">
            {category.name}
          </Text>
          <Text numberOfLines={2} variant="caption" tone="muted" className="text-meta">
            {childNames.length > 0 ? childNames.join("   ") : "View products"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});
