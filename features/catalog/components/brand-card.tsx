import { memo, useCallback } from "react";
import { Pressable } from "react-native";

import { AppImage } from "@/components/media/app-image";
import { Card, Text } from "@/components/ui";
import { cn } from "@/core/utils";

import type { CatalogBrandView } from "../model/catalog-view";
import { productCountLabel } from "../model/labels";

/**
 * Whole-card navigation for one brand in the Catalog (AC-04).
 *
 * One Pressable wraps the whole card; the owning screen wires `onPress` to the
 * brand detail route. The product count is the view's derived number, spoken
 * in words ("1 product" / "N products"). No fetching, no store, no router.
 */
export type BrandCardProps = {
  brand: CatalogBrandView;
  /** Stable press handler: CatalogGrid hands every row one shared handler. */
  onPress: (brand: CatalogBrandView) => void;
  className?: string;
};

export const BrandCard = memo(function BrandCard({ brand, onPress, className }: BrandCardProps) {
  const handlePress = useCallback(() => {
    onPress(brand);
  }, [onPress, brand]);
  // The count label is the feature's shared copy helper (model/labels.ts) —
  // the same sentence every Catalog surface speaks for a derived count.
  const countLabel = productCountLabel(brand.productCount);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${brand.name}, ${countLabel}`}
      onPress={handlePress}
      className="active:opacity-90"
    >
      <Card className={cn("gap-2 p-2", className)}>
        <AppImage
          uri={brand.image?.secureUrl ?? null}
          alt={brand.name}
          contentFit="cover"
          className="aspect-square w-full rounded-lg"
        />
        <Text variant="h3" numberOfLines={2}>
          {brand.name}
        </Text>
        <Text variant="caption">{countLabel}</Text>
      </Card>
    </Pressable>
  );
});
