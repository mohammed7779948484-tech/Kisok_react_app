import { useCallback } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { AppImage } from "@/components/media/app-image";
import { Button, Text } from "@/components/ui";

import { CatalogGrid, type CatalogGridRowInfo } from "../../components/catalog-grid";
import { ProductCard } from "../../components/product-card";
import { productCountLabel } from "../../model/labels";
import type { CatalogBrandView, CatalogProductView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";

/**
 * Stable by construction (module scope): a fresh inline keyExtractor would
 * give the grid a new prop identity on every render.
 */
const productKeyExtractor = (product: CatalogProductView) => product.id;

/**
 * Brand Detail (AC-04): the brand-scoped products of one resolved brand.
 *
 * `brandId` arrives as a prop from the route (view state, not server state).
 * The screen consumes the feature's own `useCatalog` hook — never Supabase
 * directly — with the same snapshot layer as the other discovery screens:
 * cold loading, error with retry only while no snapshot exists (a failed
 * background refetch keeps the populated detail on screen — TanStack retains
 * `data`, and the shared QueryClient refetches on focus/reconnect for
 * long-lived kiosk sessions), or whole-catalog empty (no products means there
 * is nothing to scope to any brand). The error object is passed through so
 * `ErrorState` decides whether retry is worth offering.
 *
 * Local projections of a SUCCESSFUL snapshot are handled here, never as
 * network states: a stale/invalid `brandId` (`view.resolveBrand` returns
 * undefined) renders a local not-found state — honest "brand not found" copy
 * plus the way back, no `ErrorState`, no retry pretending a fetch failed.
 * A resolved brand always has at least one product under the real contract
 * (`get_customer_catalog` returns only brands with ≥1 valid product —
 * `used_brands`, 20260826050006_lean_customer_catalog.sql:57-64), so a resolved
 * brand renders its products grid directly; there is no reachable
 * zero-products state to handle here.
 *
 * The brand's products come from `view.productsForBrand(brandId)` in backend
 * order and render through the T03 `CatalogGrid` (FlashList, 2/3/4 columns):
 * a brand's assortment is unbounded in principle, so this is the feature's
 * scalable composition exactly like All Products. Product cards are PUSHED to
 * `/product-detail` (object form) so this list stays mounted behind the
 * detail.
 *
 * Back affordance: the brief pins "detail screens retain an obvious way back
 * to the discovery surface that opened them", so a header `Go back` control
 * calls `router.back()` — it returns to whatever pushed this detail (the
 * Brands list, or Home's brand section) and can never stack duplicate root
 * history. Root `CatalogNavigation` is deliberately NOT rendered on this
 * detail screen: its replace semantics, used from a pushed detail, would
 * duplicate the root entry sitting directly below (e.g. [/brands,
 * /brand-detail] → [/brands, /brands]), which is the duplicate-root stacking
 * AC-08 forbids. The local not-found state carries its own way out instead.
 */
export type BrandDetailScreenProps = {
  /** The brand to resolve and scope products to; passed by the route. */
  brandId: string;
};

export function BrandDetailScreen({ brandId }: BrandDetailScreenProps) {
  const router = useRouter();
  const catalog = useCatalog();

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleProductPress = useCallback(
    (product: CatalogProductView) => {
      router.push({ pathname: "/product-detail", params: { productId: product.id } });
    },
    [router],
  );

  // CatalogGrid memoizes its row renderer against these props — keep the
  // identities stable (useCallback / module scope) so a re-render of this
  // screen does not defeat the virtualizer's row memoization.
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

  const brand = view.resolveBrand(brandId);

  if (brand === undefined) {
    // Stale/invalid id: a LOCAL projection of a successful snapshot. There is
    // no identity to render, so the honest way back is the whole state.
    return (
      <Screen>
        <EmptyState
          title="Brand not found"
          description="This brand isn't in the current catalog. It may have been removed since you started browsing. Go back to see the brands this store has now."
          action={{ label: "Go back", onPress: handleBack }}
        />
      </Screen>
    );
  }

  // A resolved brand always carries ≥1 product under the snapshot contract,
  // so the resolved path renders its grid directly — no zero-product branch.
  const products = view.productsForBrand(brandId);

  return (
    <Screen>
      <View className="flex-1">
        <View className="gap-3 px-6 pb-2 pt-6">
          <Button variant="ghost" onPress={handleBack} className="self-start">
            <Text>Go back</Text>
          </Button>
          <BrandIdentity brand={brand} productCount={products.length} />
        </View>
        <CatalogGrid
          data={products}
          renderItem={renderProductCard}
          keyExtractor={productKeyExtractor}
          onItemPress={handleProductPress}
          testID="brand-products-grid"
          className="px-4"
        />
      </View>
    </Screen>
  );
}

type BrandIdentityProps = {
  brand: CatalogBrandView;
  productCount: number;
};

/**
 * The resolved brand's identity: image through the same `AppImage` media
 * contract the `BrandCard` uses (its fallback slot keeps the header layout
 * stable when the brand has no image), name as the screen header, and the
 * derived product count for this brand.
 */
function BrandIdentity({ brand, productCount }: BrandIdentityProps) {
  return (
    <View className="flex-row items-center gap-4">
      <AppImage
        uri={brand.image?.secureUrl ?? null}
        alt={brand.name}
        contentFit="cover"
        className="h-16 w-16 rounded-lg"
      />
      <View className="flex-1 gap-1">
        <Text variant="h1" accessibilityRole="header">
          {brand.name}
        </Text>
        <Text variant="body" tone="muted">
          {productCountLabel(productCount)}
        </Text>
      </View>
    </View>
  );
}
