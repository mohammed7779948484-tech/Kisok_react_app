import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";

import { ArrowDisc, MediaFrame, Text, type MediaTint } from "@/design-system";
import { cn } from "@/core/utils";

import type { CatalogCategoryView } from "../model/catalog-view";

export type CategoryPortalProps = {
  category: CatalogCategoryView;
  onPress: (category: CatalogCategoryView) => void;
  tint: MediaTint;
  /** `feature` sets a larger title for the dominant tile of the store map. */
  emphasis?: "feature" | "regular" | "compact";
  className?: string;
};

/**
 * A door into a category on the Home store map: imagery fills the tile, a
 * scrim keeps the serif name legible, and the sub-categories are listed when
 * the tile is large enough to hold them.
 */
export const CategoryPortal = memo(function CategoryPortal({
  category,
  onPress,
  tint,
  emphasis = "regular",
  className,
}: CategoryPortalProps) {
  const handlePress = useCallback(() => onPress(category), [onPress, category]);
  const hasImage = Boolean(category.image?.secureUrl);
  const onDark = hasImage || tint === "evergreen";
  const children = category.children.slice(0, 2);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, ${category.productCount} products`}
      onPress={handlePress}
      className={cn("overflow-hidden rounded-xl active:opacity-90", className)}
    >
      <MediaFrame
        source={category.image}
        alt=""
        fit="cover"
        tint={tint}
        className="absolute inset-0"
      />
      {/* Two stacked washes stand in for a gradient: the image stays visible
          at the top and the name gets contrast at the bottom. */}
      {onDark ? (
        <>
          <View aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-black/20" />
          <View aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-black/25" />
        </>
      ) : (
        <View aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-foreground/[0.06]" />
      )}
      <View
        className={cn(
          "flex-1 flex-row items-end justify-between gap-3",
          emphasis === "compact" ? "p-4" : "p-6",
        )}
      >
        <View className="min-w-0 flex-1 gap-2">
          <Text
            numberOfLines={3}
            className={cn(
              "font-display",
              emphasis === "feature"
                ? "text-display-xs leading-[28px]"
                : emphasis === "compact"
                  ? "text-title leading-[22px]"
                  : "text-display-xs leading-[28px]",
              onDark ? "text-primary-foreground" : "text-foreground",
            )}
          >
            {category.name}
          </Text>
          {emphasis !== "compact" && children.length > 0 ? (
            <View className="gap-0.5">
              {children.map((child) => (
                <Text
                  key={child.id}
                  numberOfLines={1}
                  className={cn(
                    "font-sans-bold text-caption",
                    onDark ? "text-primary-foreground/90" : "text-foreground/80",
                  )}
                >
                  {child.name}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
        <ArrowDisc tone={onDark ? "inverse" : "outline"} size={emphasis === "compact" ? 36 : 44} />
      </View>
    </Pressable>
  );
});
