import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";

import { ArrowDisc, GlassCaption, MediaFrame, Text } from "@/design-system";
import { cn } from "@/core/utils";

import type { CatalogBrandView } from "../model/catalog-view";
import { productCountLabel } from "../model/labels";

/** The logo sits above the glass caption; the blurred backdrop runs beneath it. */
const DIRECTORY_INSET = { top: 30, right: 30, bottom: 96, left: 30 };
const DISTRICT_INSET = { top: 20, right: 20, bottom: 80, left: 20 };

export type BrandCardProps = {
  brand: CatalogBrandView;
  onPress: (brand: CatalogBrandView) => void;
  /** Total options across the brand's products, when the caller has it. */
  optionCount?: number;
  /** `district` for the Home row, `directory` for the Brands page. */
  size?: "district" | "directory";
  className?: string;
};

/**
 * A brand as its logo: the image is shown whole (`contain`) and large, over a
 * blurred copy of itself so the card is full edge to edge, with the name on a
 * frosted caption. A brand with no image gets its name set in the serif
 * instead — never an empty frame.
 */
export const BrandCard = memo(function BrandCard({
  brand,
  onPress,
  optionCount,
  size = "directory",
  className,
}: BrandCardProps) {
  const handlePress = useCallback(() => {
    onPress(brand);
  }, [onPress, brand]);

  const countLabel = productCountLabel(brand.productCount);
  const directory = size === "directory";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${brand.name}, ${countLabel}`}
      onPress={handlePress}
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card active:opacity-90",
        directory ? "h-[300px]" : "h-[220px]",
        className,
      )}
    >
      <MediaFrame
        source={brand.image}
        alt=""
        fit="contain"
        backdrop
        inset={directory ? DIRECTORY_INSET : DISTRICT_INSET}
        tint="paper"
        recyclingKey={brand.id}
        className="absolute inset-0"
      >
        {!brand.image ? (
          <View className="absolute inset-0 items-center justify-center px-6 pb-16">
            <Text
              numberOfLines={2}
              className="text-center font-display text-display-sm text-foreground/80"
            >
              {brand.name}
            </Text>
          </View>
        ) : null}
      </MediaFrame>

      {directory ? <ArrowDisc className="absolute right-4 top-4" size={36} /> : null}

      <GlassCaption className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            numberOfLines={1}
            className={cn(
              "text-foreground",
              directory ? "font-display-semibold text-title-lg" : "font-sans-bold text-body-lg",
            )}
          >
            {brand.name}
          </Text>
          <View className="flex-row gap-3">
            <Text variant="caption" tone="muted">
              {countLabel}
            </Text>
            {optionCount !== undefined ? (
              <Text variant="caption" tone="muted">
                {optionCount === 1 ? "1 option" : `${optionCount} options`}
              </Text>
            ) : null}
          </View>
        </View>
        {!directory ? <ArrowDisc tone="tonal" size={32} /> : null}
      </GlassCaption>
    </Pressable>
  );
});
