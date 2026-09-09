import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { cn } from "@/core/utils";
import { useResponsiveValue } from "@/core/responsive";

/**
 * The scalable responsive grid for Catalog discovery collections (AC-03).
 *
 * Products, search results, brands and categories all grow with store data,
 * so this grid virtualizes with `@shopify/flash-list` (see the
 * kisok-react-native-rules lists reference: virtualize what can grow without
 * bound). Bounded Home sections do not use it.
 *
 * Column count follows the responsive contract: 2 columns on compact
 * (narrow web preview), 3 on medium (tablet portrait, the primary in-store
 * orientation), 4 on expanded (tablet landscape) — the design system's
 * documented responsive example. FlashList cannot change `numColumns`
 * in place, so the list is keyed by the column count and remounts only when
 * it changes (the plan's accepted rotation trade-off).
 *
 * Presentational only: data and the press handler arrive as props; no
 * fetching, no store, no Supabase client, no router.
 */
export type CatalogGridRowInfo<ItemT> = {
  item: ItemT;
  /**
   * One press handler shared by every row (memoized inside the grid), not a
   * fresh closure per row — inline closures defeat the virtualizer's row
   * memoization. Pass it straight to the row card's `onPress`.
   */
  onPress: (item: ItemT) => void;
};

export type CatalogGridProps<ItemT> = {
  data: ItemT[];
  /** Render one row. Pass stable references from the screen (useCallback). */
  renderItem: (info: CatalogGridRowInfo<ItemT>) => React.ReactElement;
  keyExtractor: (item: ItemT, index: number) => string;
  /** Reports a row press upward with the pressed item. */
  onItemPress: (item: ItemT) => void;
  testID?: string;
  className?: string;
};

export function CatalogGrid<ItemT>({
  data,
  renderItem,
  keyExtractor,
  onItemPress,
  testID,
  className,
}: CatalogGridProps<ItemT>) {
  const columns = useResponsiveValue({ compact: 2, medium: 3, expanded: 4 });

  const handleItemPress = useCallback(
    (item: ItemT) => {
      onItemPress(item);
    },
    [onItemPress],
  );

  const renderRow = useCallback(
    (info: { item: ItemT; index: number }) => (
      <View className="p-1.5">{renderItem({ item: info.item, onPress: handleItemPress })}</View>
    ),
    [renderItem, handleItemPress],
  );

  // Stable identity so FlashList's content container is not re-styled on
  // every render. 24 matches the p-6 scale for breathing room under the last
  // row; NativeWind classes cannot reach FlashList's content container.
  // Note: FlashList v2 no longer takes `estimatedItemSize` — it measures rows
  // itself, so there is nothing to hoist for that.
  const contentContainerStyle = useMemo(() => ({ paddingBottom: 24 }), []);

  return (
    <View className={cn("flex-1", className)}>
      <FlashList<ItemT>
        key={columns}
        data={data}
        numColumns={columns}
        renderItem={renderRow}
        keyExtractor={keyExtractor}
        contentContainerStyle={contentContainerStyle}
        testID={testID}
      />
    </View>
  );
}
