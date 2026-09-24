import { useCallback } from "react";
import { View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { AppImage } from "@/components/media/app-image";
import { Button, Icon, Text } from "@/components/ui";

import { CatalogGrid, type CatalogGridRowInfo } from "../../components/catalog-grid";
import { ProductCard } from "../../components/product-card";
import { productCountLabel } from "../../model/labels";
import type { CatalogBrandView, CatalogProductView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";

const productKeyExtractor = (product: CatalogProductView) => product.id;

export type BrandDetailScreenProps = {
  brandId: string;
};

export function BrandDetailScreen({ brandId }: BrandDetailScreenProps) {
  const router = useRouter();
  const catalog = useCatalog();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/brands");
    }
  }, [router]);

  const handleProductPress = useCallback(
    (product: CatalogProductView) => {
      router.push({ pathname: "/product-detail", params: { productId: product.id } });
    },
    [router],
  );

  const renderProductCard = useCallback(
    ({ item, onPress }: CatalogGridRowInfo<CatalogProductView>) => (
      <ProductCard product={item} onPress={onPress} />
    ),
    [],
  );

  if (catalog.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading the catalog…" />
      </Screen>
    );
  }

  if (catalog.isError && !catalog.data) {
    return (
      <Screen>
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      </Screen>
    );
  }

  const view = catalog.data;

  if (view.products.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="The catalog is empty"
          description="Nothing is available to browse right now. Please try again in a moment or ask a store employee for help."
          action={{ label: "Try again", onPress: () => void catalog.refetch() }}
        />
      </Screen>
    );
  }

  const brand = view.resolveBrand(brandId);

  if (brand === undefined) {
    return (
      <Screen>
        <EmptyState
          title="Brand not found"
          description="This brand isn't in the current catalog. It may have been removed since you started browsing."
          action={{ label: "Back to brands", onPress: () => router.replace("/brands") }}
        />
      </Screen>
    );
  }

  const products = view.productsForBrand(brandId);

  return (
    <Screen>
      <View className="flex-1">
        <View className="gap-4 px-5 pb-4 pt-6 md:px-8">
          <Button
            variant="ghost"
            size="compact"
            onPress={handleBack}
            className="min-h-touch gap-1.5 self-start pl-2"
            accessibilityLabel="Go back"
          >
            <Icon as={ArrowLeft} size={18} />
            <Text className="font-semibold">Back</Text>
          </Button>

          <BrandIdentity brand={brand} productCount={products.length} />
        </View>

        <CatalogGrid
          data={products}
          renderItem={renderProductCard}
          keyExtractor={productKeyExtractor}
          onItemPress={handleProductPress}
          testID="brand-products-grid"
          className="px-3 md:px-6"
        />
      </View>
    </Screen>
  );
}

type BrandIdentityProps = {
  brand: CatalogBrandView;
  productCount: number;
};

function BrandIdentity({ brand, productCount }: BrandIdentityProps) {
  return (
    <View className="flex-row items-center gap-5 rounded-2xl border border-border/80 bg-card p-4 md:p-5">
      <View className="h-20 w-20 items-center justify-center rounded-xl bg-muted/25 p-2 md:h-24 md:w-24">
        <AppImage
          uri={brand.image?.secureUrl ?? null}
          alt={brand.name}
          contentFit="contain"
          className="h-full w-full"
        />
      </View>
      <View className="flex-1 gap-1">
        <Text variant="caption" tone="primary" className="font-semibold uppercase tracking-wider">
          Brand Collection
        </Text>
        <Text variant="h1" accessibilityRole="header" className="text-2xl font-bold md:text-3xl">
          {brand.name}
        </Text>
        <Text variant="caption" tone="muted">
          {productCountLabel(productCount)}
        </Text>
      </View>
    </View>
  );
}
