import { Pressable } from "react-native";

import { AppImage } from "@/components/media/app-image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/core/utils";

import type { CatalogProductView } from "../model/catalog-view";

import { AvailabilityBadge } from "./availability-badge";

export type ProductCardProps = {
  product: CatalogProductView;
  onPress: (product: CatalogProductView) => void;
  className?: string;
};

export function ProductCard({ product, onPress, className }: ProductCardProps) {
  const availabilityLabel = product.isAvailable ? "Available" : "Out of stock";
  const accessibilityLabel = [product.name, product.brand?.name, availabilityLabel]
    .filter((value): value is string => value !== undefined && value !== null)
    .join(", ");

  return (
    <Pressable
      accessible
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      onPress={() => onPress(product)}
      className={cn(
        "min-h-touch rounded-xl active:opacity-90 web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring",
        className,
      )}
    >
      <Card className="h-full overflow-hidden">
        <AppImage
          uri={product.coverMedia?.secureUrl}
          alt=""
          contentFit="cover"
          className="aspect-square w-full"
        />
        <CardHeader>
          <CardTitle>{product.name}</CardTitle>
          {product.brand !== null ? <CardDescription>{product.brand.name}</CardDescription> : null}
        </CardHeader>
        <CardContent className="gap-3">
          {product.short_description !== null ? (
            <CardDescription>{product.short_description}</CardDescription>
          ) : null}
          <AvailabilityBadge isAvailable={product.isAvailable} />
        </CardContent>
      </Card>
    </Pressable>
  );
}
