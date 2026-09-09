import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";

import { AppImage } from "@/components/media/app-image";
import { Card, Text } from "@/components/ui";
import { cn } from "@/core/utils";

import type { CatalogProductView } from "../model/catalog-view";
import { AvailabilityBadge } from "./availability-badge";

/**
 * Whole-card navigation for one product in a Catalog discovery surface.
 *
 * A single Pressable wraps the whole card (never a nested link inside a link);
 * the owning screen wires `onPress` to `router.push`. This component never
 * imports expo-router, never fetches, and never reads a store — it renders the
 * derived view it is given.
 *
 * Card-level availability is the view's derived boolean, shown in words.
 * All-unavailable products stay discoverable and pressable (AC-03).
 */
export type ProductCardProps = {
  product: CatalogProductView;
  /**
   * Stable press handler: CatalogGrid hands every row one shared handler, so
   * pass the same function down rather than closing over the product here.
   */
  onPress: (product: CatalogProductView) => void;
  className?: string;
};

/** Shared copy for the card's accessible name and its visible badge. */
function productAvailabilityLabel(isAvailable: boolean): string {
  return isAvailable ? "Available" : "Out of stock";
}

export const ProductCard = memo(function ProductCard({
  product,
  onPress,
  className,
}: ProductCardProps) {
  const handlePress = useCallback(() => {
    onPress(product);
  }, [onPress, product]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${productAvailabilityLabel(product.isAvailable)}`}
      onPress={handlePress}
      className="h-full active:scale-[0.98] active:opacity-90"
    >
      <Card className={cn("h-full overflow-hidden", className)}>
        <AppImage
          uri={product.coverMedia?.secureUrl ?? null}
          alt={product.name}
          contentFit="cover"
          className="aspect-square w-full"
        />
        <View className="min-h-32 flex-1 justify-between gap-3 border-t border-border bg-card p-4">
          <Text variant="h3">{product.name}</Text>
          <AvailabilityBadge isAvailable={product.isAvailable} />
        </View>
      </Card>
    </Pressable>
  );
});
