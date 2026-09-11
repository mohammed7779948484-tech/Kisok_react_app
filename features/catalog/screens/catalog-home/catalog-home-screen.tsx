import { useCallback } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ArrowRight, Search } from "lucide-react-native";
import { useRouter } from "expo-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { AppImage } from "@/components/media/app-image";
import { AspectRatio, Button, Card, Icon, Text } from "@/components/ui";
import { useLayout, useResponsiveValue } from "@/core/responsive";

import { BrandCard } from "../../components/brand-card";
import { CatalogShell } from "../../components/catalog-shell";
import { CategoryCard } from "../../components/category-card";
import { ProductCard } from "../../components/product-card";
import { AvailabilityBadge } from "../../components/availability-badge";
import { deriveFeaturedLayout, formatProductOptionCount } from "../../model/discovery-presentation";
import type {
  CatalogBrandView,
  CatalogCategoryView,
  CatalogProductView,
} from "../../model/catalog-view";
import { useCatalog } from "../../queries/use-catalog";

export function CatalogHomeScreen() {
  const router = useRouter();
  const catalog = useCatalog();
  const { isExpanded } = useLayout();
  const columns = useResponsiveValue({ compact: 2, medium: 3, expanded: 4 });

  const handleBrandPress = useCallback(
    (brand: CatalogBrandView) => {
      router.push({ pathname: "/brand-detail", params: { brandId: brand.id } });
    },
    [router],
  );

  const handleCategoryPress = useCallback(
    (category: CatalogCategoryView) => {
      router.push({ pathname: "/category-detail", params: { categoryId: category.id } });
    },
    [router],
  );

  const handleProductPress = useCallback(
    (product: CatalogProductView) => {
      router.push({ pathname: "/product-detail", params: { productId: product.id } });
    },
    [router],
  );

  const handleSearchShortcut = useCallback(() => {
    router.replace("/search");
  }, [router]);

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

  const { brands, categories, featuredProducts } = view.home;
  const featured = deriveFeaturedLayout(featuredProducts);

  return (
    <CatalogShell currentDestination="home" settings={view.settings}>
      <ScrollView contentContainerClassName="gap-10 px-5 pb-36 pt-6 md:px-8">
        {/* Page-level accessible heading representing Store / Catalog */}
        <View className="sr-only">
          <Text variant="h1" accessibilityRole="header">
            {view.settings && "store_name" in view.settings && view.settings.store_name
              ? `${view.settings.store_name} Catalog`
              : "Store Catalog"}
          </Text>
        </View>

        {/* Immediate Search & Discovery Affordance */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search catalog"
          onPress={handleSearchShortcut}
          className="min-h-touch flex-row items-center justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-sm active:bg-muted/40"
        >
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Icon as={Search} size={20} className="text-primary" />
            </View>
            <View>
              <Text variant="body" className="font-semibold text-foreground">
                Search the catalog
              </Text>
              <Text variant="caption" tone="muted">
                Find by product name, brand, category, or option
              </Text>
            </View>
          </View>
          <View className="h-9 items-center justify-center rounded-lg bg-secondary px-4">
            <Text variant="caption" className="font-semibold text-secondary-foreground">
              Search
            </Text>
          </View>
        </Pressable>

        {/* Adaptive Featured Section */}
        {featured.mode === "spotlight" && featured.spotlightProduct ? (
          <SpotlightFeaturedCard
            product={featured.spotlightProduct}
            onPress={handleProductPress}
            isExpanded={isExpanded}
          />
        ) : featured.mode === "showcase" ? (
          <HomeSection
            title="Featured"
            browseAllLabel="View all products"
            onBrowseAll={() => router.replace("/products")}
          >
            <ShowcaseFeaturedGrid items={featured.items} onPress={handleProductPress} />
          </HomeSection>
        ) : featured.mode === "grid" ? (
          <HomeSection
            title="Featured"
            browseAllLabel="View all products"
            onBrowseAll={() => router.replace("/products")}
          >
            <HomeCardsGrid
              items={featured.items}
              columns={columns}
              renderItem={(product) => (
                <ProductCard product={product} onPress={handleProductPress} />
              )}
            />
          </HomeSection>
        ) : null}

        {/* Shop by Category Section */}
        {categories.length > 0 ? (
          <HomeSection
            title="Categories"
            browseAllLabel="All categories"
            onBrowseAll={() => router.replace("/categories")}
          >
            <HomeCardsGrid
              items={categories}
              columns={columns}
              renderItem={(category) => (
                <CategoryCard category={category} onPress={handleCategoryPress} />
              )}
            />
          </HomeSection>
        ) : null}

        {/* Explore Brands Section */}
        {brands.length > 0 ? (
          <HomeSection
            title="Brands"
            browseAllLabel="All brands"
            onBrowseAll={() => router.replace("/brands")}
          >
            <HomeCardsGrid
              items={brands}
              columns={columns}
              renderItem={(brand) => <BrandCard brand={brand} onPress={handleBrandPress} />}
            />
          </HomeSection>
        ) : null}
      </ScrollView>
    </CatalogShell>
  );
}

type SpotlightFeaturedCardProps = {
  product: CatalogProductView;
  onPress: (product: CatalogProductView) => void;
  isExpanded: boolean;
};

function SpotlightFeaturedCard({ product, onPress, isExpanded }: SpotlightFeaturedCardProps) {
  const handlePress = useCallback(() => {
    onPress(product);
  }, [onPress, product]);

  const optionCount = formatProductOptionCount(product);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Featured product: ${product.name}`}
      onPress={handlePress}
      className="active:scale-[0.99]"
    >
      <Card className="overflow-hidden border-border/80 bg-card shadow-sm">
        <View className={isExpanded ? "flex-row items-center" : "flex-col"}>
          {/* Spotlight Packaging Image */}
          <View className={isExpanded ? "w-2/5 p-6" : "w-full p-4"}>
            <AspectRatio
              ratio={isExpanded ? 1 : 16 / 10}
              className="w-full rounded-xl bg-muted/25 p-4"
            >
              <AppImage
                uri={product.coverMedia?.secureUrl ?? null}
                alt={product.name}
                contentFit="contain"
                className="h-full w-full"
              />
            </AspectRatio>
          </View>

          {/* Editorial Content */}
          <View className="flex-1 justify-center gap-4 p-6 md:p-8">
            <View className="flex-row items-center gap-2">
              <Text
                variant="caption"
                tone="primary"
                className="font-semibold uppercase tracking-wider"
              >
                Featured Spotlight
              </Text>
              {product.brand ? (
                <Text variant="caption" tone="muted" className="font-medium">
                  by {product.brand.name}
                </Text>
              ) : null}
            </View>

            <View className="gap-2">
              <Text variant="h2" className="text-2xl font-extrabold tracking-tight md:text-3xl">
                {product.name}
              </Text>
              {product.short_description ? (
                <Text variant="body" tone="muted" numberOfLines={3} className="leading-relaxed">
                  {product.short_description}
                </Text>
              ) : null}
            </View>

            <View className="flex-row flex-wrap items-center justify-between gap-4 pt-2">
              <View className="flex-row items-center gap-3">
                <AvailabilityBadge
                  type="product"
                  isAvailable={product.isAvailable}
                  variantCount={product.variants.length}
                />
                {optionCount ? (
                  <Text variant="caption" tone="muted" className="font-medium">
                    {optionCount}
                  </Text>
                ) : null}
              </View>

              {/* Visual CTA only - no nested interactive Button */}
              <View
                pointerEvents="none"
                aria-hidden={true}
                className="h-touch min-h-touch flex-row items-center gap-2 rounded-xl bg-primary px-5 py-2.5"
              >
                <Text variant="body" className="font-semibold text-primary-foreground">
                  Discover product
                </Text>
                <Icon as={ArrowRight} size={16} className="text-primary-foreground" />
              </View>
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

type ShowcaseFeaturedGridProps = {
  items: CatalogProductView[];
  onPress: (product: CatalogProductView) => void;
};

function ShowcaseFeaturedGrid({ items, onPress }: ShowcaseFeaturedGridProps) {
  const count = items.length;

  if (count === 2) {
    return (
      <View className="flex-col gap-6 md:flex-row">
        {items.map((product) => (
          <View key={product.id} className="flex-1">
            <ProductCard product={product} onPress={onPress} />
          </View>
        ))}
      </View>
    );
  }

  if (count === 3) {
    return (
      <View className="flex-col gap-4 md:flex-row">
        {items.map((product) => (
          <View key={product.id} className="flex-1">
            <ProductCard product={product} onPress={onPress} />
          </View>
        ))}
      </View>
    );
  }

  // Gate H: 4 items render as 2x2 on compact/medium and 4x1 on expanded landscape
  if (count === 4) {
    return (
      <View className="flex-col gap-4 lg:flex-row">
        <View className="flex-1 flex-row gap-4">
          <View className="flex-1">
            <ProductCard product={items[0]!} onPress={onPress} />
          </View>
          <View className="flex-1">
            <ProductCard product={items[1]!} onPress={onPress} />
          </View>
        </View>
        <View className="flex-1 flex-row gap-4">
          <View className="flex-1">
            <ProductCard product={items[2]!} onPress={onPress} />
          </View>
          <View className="flex-1">
            <ProductCard product={items[3]!} onPress={onPress} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-4">
      {items.map((product) => (
        <View key={product.id} className="min-w-[200px] flex-1">
          <ProductCard product={product} onPress={onPress} />
        </View>
      ))}
    </View>
  );
}

type HomeSectionProps = {
  title: string;
  browseAllLabel: string;
  onBrowseAll: () => void;
  children: React.ReactNode;
};

function HomeSection({ title, browseAllLabel, onBrowseAll, children }: HomeSectionProps) {
  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between gap-3 border-b border-border/60 pb-3">
        <Text variant="h2" accessibilityRole="header" className="font-bold tracking-tight">
          {title}
        </Text>

        <Button
          variant="ghost"
          size="compact"
          onPress={onBrowseAll}
          className="min-h-touch shrink-0 gap-1"
        >
          <Text className="font-semibold text-primary">{browseAllLabel}</Text>
          <Icon as={ArrowRight} size={14} className="text-primary" />
        </Button>
      </View>
      {children}
    </View>
  );
}

type HomeCardsGridProps<ItemT extends { id: string }> = {
  items: ItemT[];
  columns: number;
  renderItem: (item: ItemT) => React.ReactElement;
};

function HomeCardsGrid<ItemT extends { id: string }>({
  items,
  columns,
  renderItem,
}: HomeCardsGridProps<ItemT>) {
  const rows: ItemT[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }

  return (
    <View className="gap-4">
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-4">
          {row.map((item) => (
            <View key={item.id} className="flex-1">
              {renderItem(item)}
            </View>
          ))}
          {row.length < columns
            ? Array.from({ length: columns - row.length }, (_, emptySlot) => (
                <View key={`empty-${emptySlot}`} className="flex-1" />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}
