import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Button, Text } from "@/components/ui";
import { AddToCartButton, type CatalogCartSource } from "@/features/catalog-cart-integration";

import { AvailabilityBadge } from "../../components/availability-badge";
import type { CatalogProductView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";
import { ProductMediaGallery } from "./components/product-media-gallery";
import { VariantChoiceList } from "./components/variant-choice-list";

/**
 * Product Detail (AC-07; the AC-03/AC-06 result target and the AC-08 journey
 * closure): one resolved product's identity, generic variants and media —
 * inspection only, never an ordering surface.
 *
 * `productId` arrives as a prop from the route (view state, not server state).
 * The screen consumes the feature's own `useCatalog` hook — never Supabase
 * directly — with the same snapshot layer as the other detail screens: cold
 * loading, error with retry only while no snapshot exists (a failed background
 * refetch keeps the populated detail on screen — TanStack retains `data`, and
 * the shared QueryClient refetches on focus/reconnect for long-lived kiosk
 * sessions), or whole-catalog empty (no products means there is nothing to
 * resolve). The error object is passed through so `ErrorState` decides whether
 * retry is worth offering.
 *
 * Local projections of a SUCCESSFUL snapshot are handled here, never as
 * network states: a stale/invalid `productId` (`view.resolveProduct` returns
 * undefined) renders a local not-found state — honest "product not found" copy
 * plus the way back, no `ErrorState`, no retry pretending a fetch failed. A
 * resolved product always has at least one valid variant under the real
 * contract (`valid_products`, 20260826050006_lean_customer_catalog.sql:45-49),
 * so the resolved path always has a variant to select and show; there is no
 * zero-variant branch to handle (the T07-R01 lesson).
 *
 * Identity composition: the product name is the header, the DERIVED
 * any-variant availability is the T03 `AvailabilityBadge` (Design decision 10
 * — consumed, never re-derived), and the optional short description renders as
 * muted body copy. The product's COVER image is composed through the media
 * gallery, not a separate header thumbnail: the model's variant `media`
 * already falls back to `coverMedia`, so a second image surface would show the
 * same secure URL twice on one screen. Brand and category render as context
 * chips that PUSH the corresponding detail routes (object form, exact ids) so
 * discovery continues without losing this screen.
 *
 * Variant and image selection are screen-local React state (Design decision 3)
 * — never server state, never a store, never a Cart action. The first variant
 * in backend order is the default selection; ANY variant, including an
 * unavailable one, stays selectable for inspection (Design decision 9), and
 * switching variants resets the image pick to the new variant's primary so a
 * stale thumbnail choice cannot leak across variants. The gallery receives the
 * selected variant's derived media and the resolved active id, and remounts
 * its large image by the resolved URI (Design decision 12).
 *
 * No quantity control, price, stock count, identifier display or other
 * ordering affordance exists anywhere on this screen. The ONE exception is
 * the sanctioned Add-to-cart action below the variant list: the
 * catalog-cart-integration feature's plan deliberately superseded this
 * screen's original "zero cart affordances" statement (catalog brief AC-07,
 * written when no Cart public API existed) for exactly this action. The
 * screen renders the integration's PUBLIC `AddToCartButton` from a
 * structural `CatalogCartSource` it derives here — the owning screen knows
 * its own shapes — and the button, not this screen, owns every cart call:
 * quantity stays fixed at 1 per press (control lives in the cart), and no
 * price, stock, or identifier crosses the seam.
 *
 * Back affordance: the brief pins "detail screens retain an obvious way back
 * to the discovery surface that opened them", so a header `Go back` control
 * calls `router.back()` — it returns to whatever pushed this detail (the
 * Products list, a Brand or Category Detail, or Search) and can never stack
 * duplicate root history. Root `CatalogNavigation` is deliberately NOT
 * rendered on this detail screen: its replace semantics, used from a pushed
 * detail, would duplicate the root entry sitting directly below (e.g.
 * [/products, /product-detail] → [/products, /products]), which is the
 * duplicate-root stacking AC-08 forbids. The local not-found state carries its
 * own way out instead.
 */
export type ProductDetailScreenProps = {
  /** The product to resolve and inspect; passed by the route. */
  productId: string;
};

export function ProductDetailScreen({ productId }: ProductDetailScreenProps) {
  const router = useRouter();
  const catalog = useCatalog();
  // Design decision 3: the selected variant and image are screen-local React
  // state. `selectedVariantId === null` is the default — the first variant in
  // backend order; `selectedMediaAssetId === null` is "no explicit thumbnail
  // pick yet" — the variant's primary media.
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedMediaAssetId, setSelectedMediaAssetId] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    router.back();
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
    // Inspection only: the pick is screen-local state, and the image choice
    // resets with it — the new variant's primary media becomes the active
    // image, so a stale thumbnail pick never leaks across variants.
    setSelectedVariantId(variantId);
    setSelectedMediaAssetId(null);
  }, []);

  const handleSelectMedia = useCallback((mediaAssetId: string) => {
    setSelectedMediaAssetId(mediaAssetId);
  }, []);

  if (catalog.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading the catalog…" />
      </Screen>
    );
  }

  // Full-screen error only when NO snapshot exists: on a failed background
  // refetch TanStack keeps `data` and the populated detail stays on screen
  // through the blip (see the state rules in the component doc comment).
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
    // Stale/invalid id: a LOCAL projection of a successful snapshot. There is
    // no identity to render, so the honest way back is the whole state.
    return (
      <Screen>
        <EmptyState
          title="Product not found"
          description="This product isn't in the current catalog. It may have been removed since you started browsing. Go back to see the products this store has now."
          action={{ label: "Go back", onPress: handleBack }}
        />
      </Screen>
    );
  }

  // A resolved product always carries ≥1 variant under the snapshot contract,
  // so this always resolves — the stale pick (a variant removed by a snapshot
  // refresh) degrades to the first variant instead of to nothing. If the
  // contract ever breaks, fail loudly here rather than papering it over with a
  // fake zero-variant display (the T07-R01 lesson).
  const variant =
    product.variants.find((candidate) => candidate.id === selectedVariantId) ?? product.variants[0];
  if (variant === undefined) {
    throw new Error(`product ${product.id} resolved without a variant`);
  }

  // The active image: the customer's explicit pick while it is still part of
  // this variant's media, else the variant's derived primary (which already
  // falls back to the product cover). `null` when there is no media at all —
  // the gallery renders the shared image fallback for exactly that case.
  const pickedMedia = variant.media.find((item) => item.mediaAssetId === selectedMediaAssetId);
  const activeMediaAssetId =
    pickedMedia?.mediaAssetId ?? variant.primaryMedia?.mediaAssetId ?? null;

  // The integration seam (plan decision 2): the owning screen derives the
  // structural source from its OWN resolved view — raw `title_override` (the
  // mapper trims), the variant's derived primary image (cover fallback
  // already applied by the model), the ordered option pairs, and the
  // variant's position — and hands it to the integration's public Add
  // action. Structural by design: no composed label and no catalog view type
  // crosses the feature boundary, so the T01 label rule stays the integration's.
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

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 px-6 pb-6 pt-6">
        <Button variant="ghost" onPress={handleBack} className="self-start">
          <Text>Go back</Text>
        </Button>
        <View className="gap-2">
          <Text variant="h1" accessibilityRole="header">
            {product.name}
          </Text>
          <AvailabilityBadge isAvailable={product.isAvailable} />
          {product.short_description !== null ? (
            <Text variant="body" tone="muted">
              {product.short_description}
            </Text>
          ) : null}
          {product.brand !== null ? (
            <View className="gap-1">
              <Text variant="label" tone="muted">
                Brand
              </Text>
              <Button
                variant="ghost"
                accessibilityLabel={product.brand.name}
                onPress={() => handleBrandPress(product)}
                className="self-start"
              >
                <Text>{product.brand.name}</Text>
              </Button>
            </View>
          ) : null}
          {product.categories.length > 0 ? (
            <View className="gap-1">
              <Text variant="label" tone="muted">
                Categories
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {product.categories.map((category) => (
                  <Button
                    key={category.id}
                    variant="ghost"
                    accessibilityLabel={category.name}
                    onPress={() => handleCategoryPress(category.id)}
                    className="self-start"
                  >
                    <Text>{category.name}</Text>
                  </Button>
                ))}
              </View>
            </View>
          ) : null}
        </View>
        <ProductMediaGallery
          media={variant.media}
          alt={`${product.name} — ${variant.label}`}
          activeMediaAssetId={activeMediaAssetId}
          onSelectMedia={handleSelectMedia}
        />
        <VariantChoiceList
          variants={product.variants}
          selectedVariantId={variant.id}
          onSelectVariant={handleSelectVariant}
        />
        {/* The plan-sanctioned Add action (see the doc comment): rendered only
            on the resolved-product path, below the variant list, so it follows
            the resolved selection. The integration's button owns every cart
            call and the Quick Cart open — this screen renders and derives
            nothing else for it. */}
        <AddToCartButton source={addSource} />
      </ScrollView>
    </Screen>
  );
}
