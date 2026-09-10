import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";

import { AppImage } from "@/components/media/app-image";
import { AspectRatio, Card, Text } from "@/components/ui";
import { cn } from "@/core/utils";

import { formatProductOptionCount } from "../model/discovery-presentation";
import type { CatalogProductView } from "../model/catalog-view";
import { AvailabilityBadge } from "./availability-badge";

export type ProductCardProps = {
  product: CatalogProductView;
  onPress: (product: CatalogProductView) => void;
  className?: string;
};

export const ProductCard = memo(function ProductCard({
  product,
  onPress,
  className,
}: ProductCardProps) {
  const handlePress = useCallback(() => {
    onPress(product);
  }, [onPress, product]);

  const optionCount = formatProductOptionCount(product);
  const availabilityText = product.isAvailable ? "Options available" : "Currently unavailable";
  const brandName = product.brand?.name;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}${brandName ? `, by ${brandName}` : ""}, ${availabilityText}`}
      onPress={handlePress}
      className="h-full active:scale-[0.985]"
    >
      <Card
        className={cn(
          "h-full overflow-hidden border-border bg-card shadow-none transition-shadow",
          className,
        )}
      >
        {/* Packaging-friendly portrait presentation */}
        <AspectRatio ratio={3 / 4} className="w-full bg-muted/25 p-3">
          <AppImage
            uri={product.coverMedia?.secureUrl ?? null}
            alt={product.name}
            contentFit="contain"
            className="h-full w-full"
          />
        </AspectRatio>

        {/* Content area */}
        <View className="flex-1 justify-between gap-3 p-4">
          <View className="gap-1">
            {brandName ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {brandName}
              </Text>
            ) : null}
            <Text variant="h3" numberOfLines={2} className="font-semibold leading-tight">
              {product.name}
            </Text>
          </View>

          <View className="flex-row flex-wrap items-center justify-between gap-2 pt-1">
            <AvailabilityBadge type="product" isAvailable={product.isAvailable} />
            {optionCount ? (
              <Text variant="caption" tone="muted" className="font-medium">
                {optionCount}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
});
