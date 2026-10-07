import { useCallback, useMemo, useState } from "react";
import { BackHandler, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
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
import { matchingVariantIds, parseMatch } from "../../model/guided-discovery";
import { availableVariantCount } from "../../model/product-summary";
import { useCatalog } from "../../queries/use-catalog";
import { ChoiceCanvas } from "./components/choice-canvas";
import { OptionBrowser } from "./components/option-browser";
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
  /** Help Me Choose's answers (`serializeMatch`): matching choices are listed first. */
  match?: string;
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
 * right. Up to six options are shown in place; a larger set previews six and
 * opens the Option Browser — screen-local state that replaces the Stage and
 * Canvas, never a route or a sheet. The customer picks one explicitly (only a
 * genuinely single-option product counts as chosen), then sets a quantity and
 * adds it from the Order Bar. Selection and quantity live here, so both
 * survive opening and closing the browser; the quantity resets only when the
 * selected option changes or after a successful add.
 */
export function ProductDetailScreen({ productId, backLabel, match }: ProductDetailScreenProps) {
  const router = useRouter();
  const catalog = useCatalog();
  const { width, height } = useLayout();
  const gutter = usePageGutter();
  const insets = useSafeAreaInsets();

  // Selection, image, quantity and browsing state are screen-local.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMediaAssetId, setSelectedMediaAssetId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [browsing, setBrowsing] = useState(false);

  const product = catalog.data?.resolveProduct(productId);
  const parsedMatch = useMemo(() => parseMatch(match), [match]);
  const decision = useMemo(() => {
    if (!product) return null;
    const derived = deriveVariantDecision(product.variants);
    if (!parsedMatch) return derived;
    // Opened from Help Me Choose: its matches lead, in store order, and the
    // canvas says how many there are. Nothing is selected for the customer.
    const matching = new Set(matchingVariantIds(product, parsedMatch));
    if (matching.size === 0) return derived;
    const count = matching.size;
    return {
      ...derived,
      choices: [
        ...derived.choices.filter((choice) => matching.has(choice.id)),
        ...derived.choices.filter((choice) => !matching.has(choice.id)),
      ],
      context: `${count} ${count === 1 ? derived.noun : derived.nounPlural} ${count === 1 ? "matches" : "match"} your choices.`,
    };
  }, [product, parsedMatch]);

  // Browsing only means something while there is more than the preview: a
  // refresh that shrinks the set (or removes the product) ends it rather than
  // leaving it to reappear later.
  const showBrowser = browsing && decision !== null && decision.hasMore;
  if (browsing && !showBrowser) setBrowsing(false);

  // Android Back closes the browser before it leaves the screen. Registered
  // only while this screen is focused and browsing, so a Product Detail
  // further down the stack (or the checkout gate's own handler) is untouched.
  useFocusEffect(
    useCallback(() => {
      if (!showBrowser) return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        setBrowsing(false);
        return true;
      });
      return () => subscription.remove();
    }, [showBrowser]),
  );

  const resolvedBackLabel = backLabel ?? "Back to products";
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/products");
    }
  }, [router]);

  // The option the customer is looking at; a single-option product's only
  // choice counts even before it is tapped.
  const currentId =
    selectedId ?? (decision?.mode === "single" ? (decision.choices[0]?.id ?? null) : null);
  const handleSelect = useCallback(
    (variantId: string) => {
      // Choosing the same option again keeps its quantity.
      if (variantId === currentId) return;
      setSelectedId(variantId);
      setSelectedMediaAssetId(null);
      setQuantity(1);
    },
    [currentId],
  );
  const openBrowser = useCallback(() => setBrowsing(true), []);
  const closeBrowser = useCallback(() => setBrowsing(false), []);

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

  // One composition for both hosts: the Canvas, and the browser's column/foot.
  const orderBar = (
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
            quantity={quantity}
            onQuantityChange={setQuantity}
          />
        ) : null
      }
    />
  );

  if (showBrowser) {
    return (
      <CatalogShell currentDestination="products" settings={view.settings}>
        <ContentContainer className="flex-1">
          <OptionBrowser
            decision={decision}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
            onClose={closeBrowser}
            lowStockThreshold={lowStockThreshold}
            split={split}
            title={product.name}
            media={selected?.variant.primaryMedia ?? product.coverMedia}
            availableCount={availableVariantCount(product)}
            total={product.variants.length}
            orderBar={orderBar}
            bottomInset={insets.bottom}
          />
        </ContentContainer>
      </CatalogShell>
    );
  }

  const canvas = (
    <ChoiceCanvas
      decision={decision}
      height={split ? undefined : STACKED_CANVAS_HEIGHT}
      rack={
        decision.choices.length > 0 ? (
          <OptionRack
            decision={decision}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
            onBrowseAll={openBrowser}
            lowStockThreshold={lowStockThreshold}
          />
        ) : (
          <Text variant="body" tone="muted" className="py-6">
            No options are listed for this product right now.
          </Text>
        )
      }
      orderBar={orderBar}
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
