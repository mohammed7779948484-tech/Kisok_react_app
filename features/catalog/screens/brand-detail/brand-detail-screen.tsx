import { useCallback } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { SectionHeading, SectionLink, useLayout } from "@/design-system";

import { BrowseResults } from "../../components/browse-results";
import { CatalogHero, HeroFact } from "../../components/catalog-hero";
import { CatalogShell } from "../../components/catalog-shell";
import { HELP_ME_CHOOSE_PILL_CLEARANCE } from "../../components/help-me-choose-pill";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogLoadingState,
  CatalogMissingState,
} from "../../components/catalog-state-panel";
import type { CatalogProductView } from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";
import { productDetailHref } from "../product-detail/product-detail-href";

export type BrandDetailScreenProps = {
  brandId: string;
};

/** A brand's page shows its products directly; the brand facet is implied and hidden. */
export function BrandDetailScreen({ brandId }: BrandDetailScreenProps) {
  const router = useRouter();
  const catalog = useCatalog();
  const { isExpanded } = useLayout();

  const handleProductPress = useCallback(
    (product: CatalogProductView) => {
      const name = catalog.data?.resolveBrand(brandId)?.name;
      router.push(productDetailHref(product.id, name ? `Back to ${name}` : undefined));
    },
    [router, catalog.data, brandId],
  );

  if (catalog.isPending) return <CatalogLoadingState destination="brands" />;

  if (catalog.isError && !catalog.data) {
    return (
      <CatalogErrorState
        destination="brands"
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
      />
    );
  }

  const view = catalog.data;
  if (!view || view.products.length === 0) {
    return <CatalogEmptyState destination="brands" onRetry={() => void catalog.refetch()} />;
  }

  const brand = view.resolveBrand(brandId);
  if (brand === undefined) {
    return (
      <CatalogMissingState
        destination="brands"
        settings={view.settings}
        title="This brand is no longer available"
        description="It may have been removed since you started browsing."
        action={{ label: "Back to brands", onPress: () => router.replace("/brands") }}
        secondaryAction={{
          label: "Browse all products",
          onPress: () => router.replace("/products"),
        }}
      />
    );
  }

  const products = view.productsForBrand(brandId);
  const optionCount = products.reduce((total, product) => total + product.variants.length, 0);

  return (
    <CatalogShell
      currentDestination="brands"
      settings={view.settings}
      helpMeChoose={{ brandId: brand.id }}
    >
      <BrowseResults
        view={view}
        products={products}
        refine="inline"
        showBrandFacet={false}
        scopeLabel={`${brand.name} products`}
        onProductPress={handleProductPress}
        bottomInset={HELP_ME_CHOOSE_PILL_CLEARANCE}
        testID="brand-products-grid"
        emptyTitle={products.length === 0 ? "Nothing from this brand right now" : undefined}
        emptySecondaryAction={{ label: "All brands", onPress: () => router.replace("/brands") }}
        header={
          <View>
            <CatalogHero
              wide={isExpanded}
              breadcrumb={[
                { label: "Brands", onPress: () => router.replace("/brands") },
                { label: brand.name },
              ]}
              eyebrow="Brand"
              title={brand.name}
              media={brand.image}
              mediaFit="contain"
              mediaTint="evergreen"
              mediaCaption={brand.name}
            >
              <View className="flex-row gap-10">
                <HeroFact
                  value={products.length}
                  label={products.length === 1 ? "product" : "products"}
                />
                <HeroFact value={optionCount} label="catalog options" />
              </View>
            </CatalogHero>
            <SectionHeading
              className="pt-10"
              eyebrow={`Products by ${brand.name}`}
              title={`Browse ${brand.name}`}
              action={<SectionLink label="All brands" onPress={() => router.replace("/brands")} />}
            />
          </View>
        }
      />
    </CatalogShell>
  );
}
