import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";
import { ArrowRight } from "lucide-react-native";

import { AppImage } from "@/components/media/app-image";
import { AspectRatio, Card, Icon, Text } from "@/components/ui";
import { cn } from "@/core/utils";

import type { CatalogBrandView } from "../model/catalog-view";
import { productCountLabel } from "../model/labels";

export type BrandCardProps = {
  brand: CatalogBrandView;
  onPress: (brand: CatalogBrandView) => void;
  className?: string;
};

export const BrandCard = memo(function BrandCard({ brand, onPress, className }: BrandCardProps) {
  const handlePress = useCallback(() => {
    onPress(brand);
  }, [onPress, brand]);

  const countLabel = productCountLabel(brand.productCount);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${brand.name}, ${countLabel}`}
      onPress={handlePress}
      className="h-full active:scale-[0.985]"
    >
      <Card
        className={cn(
          "h-full overflow-hidden border-border bg-card shadow-none transition-shadow",
          className,
        )}
      >
        {/* Brand logo/emblem display area */}
        <AspectRatio ratio={16 / 10} className="w-full items-center justify-center bg-muted/20 p-4">
          <AppImage
            uri={brand.image?.secureUrl ?? null}
            alt={brand.name}
            contentFit="contain"
            className="h-full w-full max-w-[80%]"
          />
        </AspectRatio>

        {/* Brand collection metadata */}
        <View className="flex-1 justify-between gap-3 p-4">
          <View className="gap-1">
            <Text
              variant="caption"
              tone="primary"
              className="font-semibold uppercase tracking-wider"
            >
              Brand
            </Text>
            <Text variant="h3" numberOfLines={1} className="font-semibold">
              {brand.name}
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
