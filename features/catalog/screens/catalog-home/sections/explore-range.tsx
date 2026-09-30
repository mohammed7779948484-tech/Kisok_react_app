import { View } from "react-native";

import { GridCell, ResponsiveGrid, SectionHeading, SectionLink } from "@/design-system";

import { ProductPreview } from "../../../components/product-preview";
import type { CatalogProductView } from "../../../model/catalog-view";

/** A small sample across the range, in store order, leading into Products. */
export function ExploreRange({
  products,
  split,
  onProductPress,
  onViewAll,
}: {
  products: CatalogProductView[];
  split: boolean;
  onProductPress: (product: CatalogProductView) => void;
  onViewAll: () => void;
}) {
  const [lead, ...rest] = products;
  if (!lead) return null;

  return (
    <View className="gap-7">
      <SectionHeading
        eyebrow="Catalog preview"
        title="Explore the Range"
        description="A preview of products across the catalog."
        action={<SectionLink label="View all products" onPress={onViewAll} />}
      />
      {split ? (
        <View className="h-[480px] flex-row gap-3.5">
          <ProductPreview
            product={lead}
            variant="lead"
            onPress={onProductPress}
            className="flex-[1.35]"
          />
          {rest.length > 0 ? (
            <View className="flex-1 gap-3.5">
              {[rest.slice(0, 2), rest.slice(2, 4)].map((pair, index) =>
                pair.length > 0 ? (
                  <View key={index} className="flex-1 flex-row gap-3.5">
                    {pair.map((product) => (
                      <ProductPreview
                        key={product.id}
                        product={product}
                        onPress={onProductPress}
                        className="flex-1"
                      />
                    ))}
                  </View>
                ) : null,
              )}
            </View>
          ) : null}
        </View>
      ) : (
        <ResponsiveGrid minItemWidth={220} gap={14} maxColumns={3}>
          {products.map((product) => (
            <GridCell key={product.id}>
              <ProductPreview product={product} onPress={onProductPress} mediaHeight={150} />
            </GridCell>
          ))}
        </ResponsiveGrid>
      )}
    </View>
  );
}
