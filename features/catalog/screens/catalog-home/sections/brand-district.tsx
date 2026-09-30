import { View } from "react-native";

import { GridCell, ResponsiveGrid, SectionHeading, SectionLink } from "@/design-system";

import { BrandCard } from "../../../components/brand-card";
import type { CatalogBrandView } from "../../../model/catalog-view";

/**
 * The store's brands as a gallery of logos. Logos are what customers
 * recognise at a glance, so each one is shown whole and large.
 */
export function BrandDistrict({
  brands,
  onBrandPress,
  onViewAll,
}: {
  brands: CatalogBrandView[];
  onBrandPress: (brand: CatalogBrandView) => void;
  onViewAll: () => void;
}) {
  if (brands.length === 0) return null;
  return (
    <View className="gap-7">
      <SectionHeading
        eyebrow="Brand discovery"
        title="Brand District"
        description="The brands on our shelves — tap one to see everything it makes."
        action={<SectionLink label="View all brands" onPress={onViewAll} />}
      />
      <ResponsiveGrid minItemWidth={200} gap={16} maxColumns={4}>
        {brands.map((brand) => (
          <GridCell key={brand.id}>
            <BrandCard brand={brand} size="district" onPress={onBrandPress} />
          </GridCell>
        ))}
      </ResponsiveGrid>
    </View>
  );
}
