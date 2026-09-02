import { Pressable } from "react-native";

import { AppImage } from "@/components/media/app-image";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/core/utils";

import type { CatalogBrandView } from "../model/catalog-view";

export type BrandCardProps = {
  brand: CatalogBrandView;
  onPress: (brand: CatalogBrandView) => void;
  className?: string;
};

export function BrandCard({ brand, onPress, className }: BrandCardProps) {
  const countLabel = `${brand.productCount} ${brand.productCount === 1 ? "product" : "products"}`;

  return (
    <Pressable
      accessible
      accessibilityRole="link"
      accessibilityLabel={`${brand.name}, ${countLabel}`}
      onPress={() => onPress(brand)}
      className={cn(
        "min-h-touch rounded-xl active:opacity-90 web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring",
        className,
      )}
    >
      <Card className="h-full overflow-hidden">
        <AppImage
          uri={brand.image?.secureUrl}
          alt=""
          contentFit="contain"
          className="aspect-video w-full"
        />
        <CardHeader>
          <CardTitle>{brand.name}</CardTitle>
          <CardDescription>{countLabel}</CardDescription>
        </CardHeader>
      </Card>
    </Pressable>
  );
}
