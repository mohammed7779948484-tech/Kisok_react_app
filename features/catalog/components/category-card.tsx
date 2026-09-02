import { Pressable } from "react-native";

import { AppImage } from "@/components/media/app-image";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/core/utils";

import type { CatalogCategoryView } from "../model/catalog-view";

export type CategoryCardProps = {
  category: CatalogCategoryView;
  onPress: (category: CatalogCategoryView) => void;
  className?: string;
};

export function CategoryCard({ category, onPress, className }: CategoryCardProps) {
  const countLabel = `${category.productCount} ${category.productCount === 1 ? "product" : "products"}`;

  return (
    <Pressable
      accessible
      accessibilityRole="link"
      accessibilityLabel={`${category.name}, ${countLabel}`}
      onPress={() => onPress(category)}
      className={cn(
        "min-h-touch rounded-xl active:opacity-90 web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring",
        className,
      )}
    >
      <Card className="h-full overflow-hidden">
        <AppImage
          uri={category.image?.secureUrl}
          alt=""
          contentFit="cover"
          className="aspect-video w-full"
        />
        <CardHeader>
          <CardTitle>{category.name}</CardTitle>
          <CardDescription>{countLabel}</CardDescription>
        </CardHeader>
      </Card>
    </Pressable>
  );
}
