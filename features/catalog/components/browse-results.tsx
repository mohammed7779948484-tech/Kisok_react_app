import { useCallback, useMemo, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import {
  EmptyState,
  railWidth,
  ResultToolbar,
  splitMinWidth,
  Text,
  usePageGutter,
  type StateAction,
} from "@/design-system";
import { cn } from "@/core/utils";

import {
  appliedFilters,
  applyFilters,
  deriveFacets,
  EMPTY_FILTERS,
  reconcileFilters,
  sortProducts,
  type BrowseFilters,
  type BrowseSort,
} from "../model/browse-filters";
import type { CatalogProductView, CatalogView } from "../model/catalog-view";
import { productCountLabel } from "../model/labels";
import { searchMatchReason } from "../model/search-match";
import { AppliedFilterRow } from "./applied-filter-row";
import { CatalogGrid, type CatalogGridRowInfo } from "./catalog-grid";
import { CategoryShortcutStrip } from "./category-shortcut-strip";
import { CompactRefine } from "./compact-refine";
import { FilterRailPanel } from "./filter-rail-panel";
import { ProductCard } from "./product-card";

/** Below this many products a rail is more furniture than help. */
const RAIL_MIN_PRODUCTS = 6;
const RAIL_GAP = 30;
const MULTIPLE_SCOPES = "multiple";

const productKey = (product: CatalogProductView) => product.id;

export type BrowseResultsProps = {
  view: CatalogView;
  /** The products in scope before refinement (a category, a brand, a query). */
  products: CatalogProductView[];
  /** Page content above the results; spans the full width. */
  header: React.ReactElement;
  scopeLabel: string;
  onProductPress: (product: CatalogProductView) => void;
  /**
   * `rail` — a side rail when there is room, a Filters sheet otherwise.
   * `inline` — always the compact Filters button, for pages whose hero
   * should keep the full width.
   */
  refine?: "rail" | "inline";
  showCategoryFacet?: boolean;
  showBrandFacet?: boolean;
  /** Root-category scopes above the results (the Products page). */
  showShortcuts?: boolean;
  initialFilters?: BrowseFilters;
  /** A normalized search query, so each card can say why it matched. */
  matchQuery?: string;
  /** Shown when refinement leaves nothing (the scope itself is never empty here). */
  emptyTitle?: string;
  emptySecondaryAction?: StateAction;
  testID?: string;
};

/**
 * Refine, sort and show a product set. The filters, sort and their counts are
 * all derived from `products`, so every option leads somewhere.
 */
export function BrowseResults({
  view,
  products,
  header,
  scopeLabel,
  onProductPress,
  refine = "rail",
  showCategoryFacet = true,
  showBrandFacet = true,
  showShortcuts = false,
  initialFilters = EMPTY_FILTERS,
  matchQuery,
  emptyTitle = "No products match these filters",
  emptySecondaryAction,
  testID,
}: BrowseResultsProps) {
  const gutter = usePageGutter();
  const [width, setWidth] = useState(0);
  const [rawFilters, setFilters] = useState<BrowseFilters>(initialFilters);
  const [sort, setSort] = useState<BrowseSort>("store");

  const facets = useMemo(() => deriveFacets(products, view), [products, view]);
  const filters = reconcileFilters(rawFilters, facets);
  const results = useMemo(
    () => sortProducts(applyFilters(products, filters), sort),
    [products, filters, sort],
  );
  const applied = appliedFilters(filters, facets);

  const split =
    refine === "rail" &&
    width - gutter * 2 >= splitMinWidth &&
    products.length >= RAIL_MIN_PRODUCTS;
  const railInset = split ? railWidth + RAIL_GAP : 0;

  // The rail rides up with the page heading, then pins below the chrome —
  // the native translation of a sticky sidebar. The offset is a shared value
  // so scrolling the results never re-renders React.
  const headerHeight = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const railStyle = useAnimatedStyle(() => ({
    top: Math.max(headerHeight.value - scrollY.value, 0),
    // Hidden until the heading is measured, so it never flashes over it.
    opacity: headerHeight.value > 0 ? 1 : 0,
  }));
  const handleScrollOffset = useCallback(
    (offsetY: number) => {
      scrollY.value = offsetY;
    },
    [scrollY],
  );
  const handleHeaderLayout = useCallback(
    (event: LayoutChangeEvent) => {
      headerHeight.value = event.nativeEvent.layout.height;
    },
    [headerHeight],
  );

  // The strip shows one scope at a time; several rail selections select none of it.
  const shortcutId =
    filters.categoryIds.length === 0
      ? null
      : filters.categoryIds.length === 1
        ? (filters.categoryIds[0] ?? null)
        : MULTIPLE_SCOPES;

  const renderCard = useCallback(
    ({ item, onPress }: CatalogGridRowInfo<CatalogProductView>) => (
      <ProductCard
        product={item}
        onPress={onPress}
        matchReason={matchQuery ? searchMatchReason(item, matchQuery) : undefined}
      />
    ),
    [matchQuery],
  );

  const listHeader = (
    <View>
      <View onLayout={handleHeaderLayout} style={{ marginLeft: -railInset }}>
        {header}
        {showShortcuts ? (
          <View className="mt-7 border-b border-border pb-4">
            <CategoryShortcutStrip
              shortcuts={facets.categories.map(({ id, label }) => ({ id, label }))}
              selectedId={shortcutId}
              onSelect={(id) => setFilters({ ...filters, categoryIds: id === null ? [] : [id] })}
            />
          </View>
        ) : null}
      </View>
      <View className="gap-3 pb-5 pt-5">
        <ResultToolbar countLabel={productCountLabel(results.length)} scopeLabel={scopeLabel}>
          {!split ? (
            <CompactRefine
              facets={facets}
              filters={filters}
              onChange={setFilters}
              resultCount={results.length}
              showCategories={showCategoryFacet}
              showBrands={showBrandFacet}
            />
          ) : null}
          <SortControl value={sort} onChange={setSort} />
        </ResultToolbar>
        <AppliedFilterRow applied={applied} filters={filters} onChange={setFilters} />
      </View>
    </View>
  );

  return (
    <View
      className="flex-1 overflow-hidden"
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      {width > 0 ? (
        <CatalogGrid
          data={results}
          renderItem={renderCard}
          keyExtractor={productKey}
          onItemPress={onProductPress}
          horizontalPadding={gutter}
          leadingInset={railInset}
          maxColumns={4}
          listHeaderComponent={listHeader}
          listEmptyComponent={
            <EmptyState
              className="py-12"
              title={emptyTitle}
              description={
                products.length > 0 ? "Remove a filter to widen the results." : undefined
              }
              action={
                products.length > 0
                  ? { label: "Clear filters", onPress: () => setFilters(EMPTY_FILTERS) }
                  : undefined
              }
              secondaryAction={emptySecondaryAction}
            />
          }
          onScrollOffset={handleScrollOffset}
          testID={testID}
        />
      ) : null}

      {split ? (
        // The rail's top follows the heading and pins under the chrome; its
        // bottom stays on the viewport, so its own scroller is always in view.
        <Animated.View
          pointerEvents="box-none"
          style={[{ position: "absolute", bottom: 0, left: gutter, width: railWidth }, railStyle]}
        >
          <FilterRailPanel
            facets={facets}
            filters={filters}
            onChange={setFilters}
            showCategories={showCategoryFacet}
            showBrands={showBrandFacet}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

function SortControl({
  value,
  onChange,
}: {
  value: BrowseSort;
  onChange: (next: BrowseSort) => void;
}) {
  const options: { value: BrowseSort; label: string }[] = [
    { value: "store", label: "Store order" },
    { value: "name", label: "A–Z" },
  ];
  return (
    <View className="flex-row items-center gap-2">
      <Text variant="meta" tone="muted">
        Sort
      </Text>
      <View
        accessibilityRole="radiogroup"
        className="flex-row rounded-full border border-border bg-card p-0.5"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              className={cn(
                "h-touch justify-center rounded-full px-4",
                selected ? "bg-primary" : "active:bg-muted",
              )}
            >
              <Text
                className={cn(
                  "font-sans-bold text-meta",
                  selected ? "text-primary-foreground" : "text-foreground/75",
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
