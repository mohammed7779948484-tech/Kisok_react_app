import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ArrowLeft, ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Button, Icon, Text } from "@/components/ui";
import { useLayout, useResponsiveValue } from "@/core/responsive";
import { AddToCartButton, type CatalogCartSource } from "@/features/catalog-cart-integration";

import { AvailabilityBadge } from "../../components/availability-badge";
import {
  formatVariantDetails,
  formatVariantSummary,
  resolveDefaultVariant,
} from "../../model/variant-selection";
import type { CatalogProductView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";
import { AdaptiveVariantSelector } from "./components/adaptive-variant-selector";
import { ProductMediaGallery } from "./components/product-media-gallery";

export type ProductDetailScreenProps = {
  /** The product to resolve and inspect; passed by the route. */
  productId: string;
};

export function ProductDetailScreen({ productId }: ProductDetailScreenProps) {
  const router = useRouter();
  const catalog = useCatalog();
  const { isLandscape } = useLayout();
  const canSplit = useResponsiveValue({ compact: false, medium: false, expanded: true });
  const useTwoColumnLayout = isLandscape && canSplit;

  // Selected variant and image are screen-local React state
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedMediaAssetId, setSelectedMediaAssetId] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/products");
    }
  }, [router]);

  const handleBrandPress = useCallback(
    (product: CatalogProductView) => {
      if (product.brand !== null) {
        router.push({ pathname: "/brand-detail", params: { brandId: product.brand.id } });
      }
    },
    [router],
  );

  const handleCategoryPress = useCallback(
    (categoryId: string) => {
      router.push({ pathname: "/category-detail", params: { categoryId } });
    },
    [router],
  );

  const handleSelectVariant = useCallback((variantId: string) => {
    setSelectedVariantId(variantId);
    setSelectedMediaAssetId(null);
  }, []);

  const handleSelectMedia = useCallback((mediaAssetId: string) => {
    setSelectedMediaAssetId(mediaAssetId);
  }, []);

  if (catalog.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading product..." />
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

  const product = view.resolveProduct(productId);

  if (product === undefined) {
    return (
      <Screen>
        <EmptyState
          title="Product not found"
          description="This product is no longer in the catalog. It may have been removed since you started browsing."
          action={{ label: "Back to products", onPress: () => router.replace("/products") }}
        />
      </Screen>
    );
  }

  // Selected variant resolution:
  // 1. Explicit customer selection preserved if still valid
  // 2. Initial entry or snapshot recovery prefers first available variant in backend order
  // 3. Fallback to first backend variant if none available
  const variant =
    (selectedVariantId
      ? product.variants.find((candidate) => candidate.id === selectedVariantId)
      : undefined) ??
    resolveDefaultVariant(product.variants) ??
    product.variants[0];

  if (variant === undefined) {
    throw new Error(`product ${product.id} resolved without a variant`);
  }

  // Active media resolution
  const pickedMedia = variant.media.find((item) => item.mediaAssetId === selectedMediaAssetId);
  const activeMediaAssetId =
    pickedMedia?.mediaAssetId ?? variant.primaryMedia?.mediaAssetId ?? null;

  // Integration seam: derive structural source for AddToCartButton
  const addSource: CatalogCartSource = {
    productId: product.id,
    productName: product.name,
    variant: {
      id: variant.id,
      titleOverride: variant.title_override,
      isAvailable: variant.is_available,
      primaryImageUri: variant.primaryMedia?.secureUrl ?? null,
      options: variant.options.map((option) => ({
        optionTypeId: option.type.id,
        optionValueId: option.value.id,
        optionValueLabel: option.value.value,
        optionTypeName: option.type.name,
      })),
    },
    variantCount: product.variants.length,
    variantIndex: product.variants.findIndex((candidate) => candidate.id === variant.id),
  };

  const selectedSummary = formatVariantSummary(variant);
  const selectedDetails = formatVariantDetails(variant);

  return (
    <Screen>
      {/* pb-36 clears the persistent cart button in the bottom right corner */}
      <ScrollView contentContainerClassName="gap-6 px-5 pb-36 pt-6 md:px-8">
        {/* Back navigation button */}
        <Button
          variant="ghost"
          size="compact"
          onPress={handleBack}
          className="min-h-touch gap-1.5 self-start pl-2"
          accessibilityLabel="Go back to previous screen"
        >
          <Icon as={ArrowLeft} size={18} />
          <Text className="font-semibold">Back</Text>
        </Button>

        <View className={useTwoColumnLayout ? "flex-row items-start gap-10" : "gap-8"}>
          {/* Media gallery */}
          <View className={useTwoColumnLayout ? "w-1/2 max-w-[540px]" : "w-full"}>
            <ProductMediaGallery
              media={variant.media}
              alt={`${product.name} — ${variant.label}`}
              activeMediaAssetId={activeMediaAssetId}
              onSelectMedia={handleSelectMedia}
            />
          </View>

          {/* Product Decision Workspace */}
          <View className={useTwoColumnLayout ? "flex-1 gap-6" : "gap-6"}>
            {/* Header & Taxonomy */}
            <View className="gap-3">
              {/* Quieter navigable brand & category metadata with >= 48dp touch targets */}
              <View className="flex-row flex-wrap items-center gap-2">
                {product.brand ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Browse brand ${product.brand.name}`}
                    onPress={() => handleBrandPress(product)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="min-h-touch flex-row items-center gap-1 py-1 active:opacity-75"
                  >
                    <Text variant="caption" className="font-semibold text-primary">
                      {product.brand.name}
                    </Text>
                    <Icon as={ChevronRight} size={13} className="text-muted-foreground/60" />
                  </Pressable>
                ) : null}

                {product.categories.map((cat, idx) => (
                  <View key={cat.id} className="flex-row items-center gap-2">
                    {product.brand || idx > 0 ? (
                      <Text variant="caption" tone="muted" className="text-muted-foreground/40">
                        /
                      </Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Browse category ${cat.name}`}
                      onPress={() => handleCategoryPress(cat.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      className="min-h-touch flex-row items-center py-1 active:opacity-75"
                    >
                      <Text variant="caption" tone="muted" className="font-medium">
                        {cat.name}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>

              <Text
                variant="display"
                accessibilityRole="header"
                className="text-2xl font-extrabold tracking-tight md:text-3xl"
              >
                {product.name}
              </Text>

              {product.short_description ? (
                <Text variant="body" tone="muted" className="leading-relaxed">
                  {product.short_description}
                </Text>
              ) : null}
            </View>

            {/* Adaptive Variant Selection */}
            <AdaptiveVariantSelector
              variants={product.variants}
              selectedVariantId={variant.id}
              onSelectVariant={handleSelectVariant}
            />

            {/* Decision & Add to Cart Area */}
            <View className="gap-3.5 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
              <View className="flex-row items-center justify-between gap-3">
                <View className="gap-0.5">
                  <Text variant="caption" tone="muted">
                    Your Selection
                  </Text>
                  <Text variant="body" className="font-bold text-foreground">
                    {selectedSummary}
                  </Text>
                  {selectedDetails ? (
                    <Text variant="caption" tone="muted">
                      {selectedDetails}
                    </Text>
                  ) : null}
                </View>
                <AvailabilityBadge isAvailable={variant.is_available} type="variant" />
              </View>

              {/* Primary Add to Cart Action */}
              <View className="pt-2">
                <AddToCartButton source={addSource} />
              </View>

              {!variant.is_available ? (
                <Text variant="caption" tone="destructive" className="pt-1">
                  This choice is currently out of stock. Please select another option to continue.
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
