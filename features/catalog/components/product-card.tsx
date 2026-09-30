import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";

import { ArrowDisc, MediaFrame, Text, tintFor } from "@/design-system";
import { cn } from "@/core/utils";

import type { CatalogProductView } from "../model/catalog-view";
import {
  optionCountLabel,
  optionTypeSummary,
  productAvailabilityLabel,
} from "../model/product-summary";
import type { SearchMatchReason } from "../model/search-match";
import { AvailabilityBadge } from "./availability-badge";

const MEDIA_RATIO = { aspectRatio: 3 / 2 };

export type ProductCardProps = {
  product: CatalogProductView;
  onPress: (product: CatalogProductView) => void;
  /** Search results say why a product matched when it was not by name. */
  matchReason?: SearchMatchReason | null;
  className?: string;
};

/**
 * One card per product — never one per variant. Packaging is `contain`ed on a
 * stable tint; the footer carries the brand, availability, name and the
 * choices the product offers.
 */
export const ProductCard = memo(function ProductCard({
  product,
  onPress,
  matchReason,
  className,
}: ProductCardProps) {
  const handlePress = useCallback(() => {
    onPress(product);
  }, [onPress, product]);

  const brandName = product.brand?.name;
  const availabilityText = productAvailabilityLabel(product);
  const typeSummary = optionTypeSummary(product);
  const hasChoices = product.variants.length > 1;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}${brandName ? `, by ${brandName}` : ""}, ${availabilityText}`}
      onPress={handlePress}
      className={cn(
        "h-full overflow-hidden rounded-xl border border-border bg-card active:opacity-90",
        className,
      )}
    >
      <MediaFrame
        source={product.coverMedia}
        alt=""
        fit="contain"
        backdrop
        tint={tintFor(product.id)}
        fallbackLabel={product.name}
        recyclingKey={product.id}
        className="w-full"
        style={MEDIA_RATIO}
      />

      <View className="flex-1 gap-1.5 px-4 pb-4 pt-3.5">
        <View className="h-5 flex-row items-center justify-between gap-2">
          <Text
            numberOfLines={1}
            className="min-w-0 shrink font-sans-extrabold text-eyebrow uppercase tracking-[1.4px] text-muted-foreground"
          >
            {brandName ?? ""}
          </Text>
          <AvailabilityBadge
            type="product"
            isAvailable={product.isAvailable}
            variantCount={product.variants.length}
            aria-hidden
          />
        </View>

        <View className="flex-1 flex-row items-end justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text
              numberOfLines={2}
              className="font-sans-bold text-title-lg leading-[26px] tracking-[-0.3px]"
            >
              {product.name}
            </Text>
            {matchReason ? (
              <View className="flex-row items-baseline gap-2">
                <Text className="font-sans-extrabold text-eyebrow uppercase tracking-[1.2px] text-muted-foreground">
                  Matched
                </Text>
                <Text numberOfLines={1} className="shrink font-sans-bold text-caption text-primary">
                  {matchReason.field} · {matchReason.value}
                </Text>
              </View>
            ) : null}
            <View className="flex-row items-baseline gap-2">
              <Text className="shrink-0 font-sans-bold text-caption text-foreground/80">
                {hasChoices ? optionCountLabel(product) : "Single option"}
              </Text>
              {typeSummary ? (
                <Text numberOfLines={1} className="shrink text-caption text-muted-foreground">
                  {typeSummary}
                </Text>
              ) : null}
            </View>
          </View>
          <ArrowDisc tone="tonal" size={34} />
        </View>
      </View>
    </Pressable>
  );
});
