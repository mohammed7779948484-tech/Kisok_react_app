import { useCallback, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { chromeHeight, ContentContainer, Text, useLayout, usePageGutter } from "@/design-system";
import { AddToCartButton, type CatalogCartSource } from "@/features/catalog-cart-integration";

import { CatalogShell } from "../../components/catalog-shell";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogLoadingState,
  CatalogMissingState,
} from "../../components/catalog-state-panel";
import type { CatalogProductView, CatalogVariantView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";
import { ChoiceCanvas } from "./components/choice-canvas";
import { OptionRack } from "./components/option-rack";
import { OrderBar } from "./components/order-bar";
import { ProductStage } from "./components/product-stage";
import { deriveVariantDecision } from "./components/variant-decision";

/** Content wider than this places the Stage and the Canvas side by side. */
const SPLIT_MIN_CONTENT_WIDTH = 900;
const CANVAS_MIN_WIDTH = 400;
const STACKED_CANVAS_HEIGHT = 600;

export type ProductDetailScreenProps = {
  /** The product to resolve and inspect; passed by the route. */
  productId: string;
  /** Names where the customer came from, e.g. "Back to Vape Products". */
  backLabel?: string;
};

function toCartSource(product: CatalogProductView, variant: CatalogVariantView): CatalogCartSource {
  return {
    productId: product.id,
    productName: product.name,
    variant: {
      id: variant.id,
      titleOverride: variant.title_override,
      isAvailable: variant.is_available,
      availableQuantity: variant.available_quantity,
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
}

/**
 * Product Detail v1.8: the Product Stage on the left, the Choice Canvas on the
 * right. Every option is shown in place; the customer picks one explicitly
 * (only a genuinely single-option product counts as chosen), then sets a
 * quantity and adds it from the Order Bar.
 */
export function ProductDetailScreen({ productId, backLabel }: ProductDetailScreenProps) {
  const router = useRouter();
  const catalog = useCatalog();
  const { width, height } = useLayout();
  const gutter = usePageGutter();
  const insets = useSafeAreaInsets();

  // Selection, image and rack state are screen-local.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMediaAssetId, setSelectedMediaAssetId] = useState<string | null>(null);
  const [rackQuery, setRackQuery] = useState("");
  const [rackExpanded, setRackExpanded] = useState(false);

  const product = catalog.data?.resolveProduct(productId);
  const decision = useMemo(
    () => (product ? deriveVariantDecision(product.variants) : null),
    [product],
  );

  const resolvedBackLabel = backLabel ?? "Back to products";
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/products");
    }
  }, [router]);

  const handleSelect = useCallback((variantId: string) => {
    setSelectedId(variantId);
    setSelectedMediaAssetId(null);
  }, []);

  if (catalog.isPending)
    return <CatalogLoadingState destination="products" label="Loading product…" />;

  if (catalog.isError && !catalog.data) {
    return (
      <CatalogErrorState
        destination="products"
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
      />
    );
  }

  const view = catalog.data;
  if (!view || view.products.length === 0) {
    return <CatalogEmptyState destination="products" onRetry={() => void catalog.refetch()} />;
  }

  if (product === undefined || decision === null) {
    return (
      <CatalogMissingState
        destination="products"
        settings={view.settings}
        title="This product is no longer available"
        description="It may have been removed or hidden since you opened the catalog."
        action={{ label: resolvedBackLabel, onPress: handleBack }}
        secondaryAction={{ label: "Back to Explore", onPress: () => router.replace("/") }}
      />
    );
  }

  // A selection survives a catalog refresh only while its variant still
  // exists; otherwise the customer chooses again — nothing is re-picked for them.
  const selected =
    decision.choices.find((choice) => choice.id === selectedId) ??
    (decision.mode === "single" ? (decision.choices[0] ?? null) : null);

  const media = selected ? selected.variant.media : product.coverMedia ? [product.coverMedia] : [];
  const activeMediaAssetId =
    media.find((item) => item.mediaAssetId === selectedMediaAssetId)?.mediaAssetId ??
    media[0]?.mediaAssetId ??
    null;

  const lowStockThreshold =
    "global_low_stock_threshold" in view.settings ? view.settings.global_low_stock_threshold : 0;
  const split = width - gutter * 2 >= SPLIT_MIN_CONTENT_WIDTH;
  // The Stage scrolls, so its picture may size from the window; the Canvas
  // never scrolls, so in a split layout it fills the column it is given.
  const visualHeight = split ? Math.min(492, Math.max(300, height - chromeHeight - 318)) : 420;

  const stage = (
    <ProductStage
      product={product}
      decision={decision}
      selected={selected}
      media={media}
      activeMediaAssetId={activeMediaAssetId}
      onSelectMedia={setSelectedMediaAssetId}
      visualHeight={visualHeight}
      backLabel={resolvedBackLabel}
      onBack={handleBack}
      onBrandPress={() => {
        if (product.brand) {
          router.push({ pathname: "/brand-detail", params: { brandId: product.brand.id } });
        }
      }}
      onCategoryPress={(categoryId) =>
        router.push({ pathname: "/category-detail", params: { categoryId } })
      }
    />
  );

  const canvas = (
    <ChoiceCanvas
      decision={decision}
      height={split ? undefined : STACKED_CANVAS_HEIGHT}
      condensed={rackExpanded || rackQuery.trim().length > 0}
      rack={
        decision.choices.length > 0 ? (
          <OptionRack
            decision={decision}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
            query={rackQuery}
            onQueryChange={setRackQuery}
            expanded={rackExpanded}
            onExpandedChange={setRackExpanded}
            lowStockThreshold={lowStockThreshold}
          />
        ) : (
          <Text variant="body" tone="muted" className="py-6">
            No options are listed for this product right now.
          </Text>
        )
      }
      orderBar={
        <OrderBar
          prompt={decision.prompt}
          selected={selected}
          action={
            selected ? (
              <AddToCartButton
                key={selected.id}
                source={toCartSource(product, selected.variant)}
                withQuantity
                tone="inverse"
              />
            ) : null
          }
        />
      }
    />
  );

  return (
    <CatalogShell currentDestination="products" settings={view.settings}>
      {split ? (
        <ContentContainer className="flex-1 flex-row gap-[34px]">
          <ScrollView
            className="flex-[1.08]"
            contentContainerClassName="pb-10 pt-2.5"
            showsVerticalScrollIndicator={false}
          >
            {stage}
          </ScrollView>
          <View
            className="pt-2.5"
            style={{
              flex: 0.8,
              minWidth: CANVAS_MIN_WIDTH,
              // Clear the Android navigation bar under edge-to-edge.
              paddingBottom: Math.max(16, insets.bottom + 8),
            }}
          >
            {canvas}
          </View>
        </ContentContainer>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-12">
          <ContentContainer className="gap-8 pt-2.5">
            {stage}
            {canvas}
          </ContentContainer>
        </ScrollView>
      )}
    </CatalogShell>
  );
}
