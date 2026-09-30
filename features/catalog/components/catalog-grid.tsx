import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useFocusEffect } from "expo-router";

import { columnsForWidth } from "@/design-system";
import { cn } from "@/core/utils";

/**
 * The virtualised grid for catalog collections that grow with store data —
 * products, search results, brands. Bounded Home sections do not use it.
 *
 * Column count comes from the width the grid is actually given (a filter
 * rail beside it costs a column), not from the window. FlashList cannot
 * change `numColumns` in place, so the list is keyed by the column count and
 * remounts only when it changes — on rotation, not on every render.
 *
 * Presentational only: data and the press handler arrive as props.
 */
export type CatalogGridRowInfo<ItemT> = {
  item: ItemT;
  /** One press handler shared by every row — never a fresh closure per row. */
  onPress: (item: ItemT) => void;
};

export type CatalogGridProps<ItemT> = {
  data: ItemT[];
  renderItem: (info: CatalogGridRowInfo<ItemT>) => React.ReactElement;
  keyExtractor: (item: ItemT, index: number) => string;
  onItemPress: (item: ItemT) => void;
  /** The narrowest a cell may get before the grid drops a column. */
  minItemWidth?: number;
  maxColumns?: number;
  /** Space between cells, both axes. */
  gap?: number;
  /** Horizontal padding of the list content (the page gutter, usually). */
  horizontalPadding?: number;
  /**
   * Extra room reserved at the leading edge for a region drawn beside the
   * grid (the filter rail). Header content that should span the full width
   * pulls itself back over it with a negative margin.
   */
  leadingInset?: number;
  listHeaderComponent?: React.ReactElement;
  listEmptyComponent?: React.ReactElement;
  listFooterComponent?: React.ReactElement;
  /**
   * The list's vertical offset, on every scroll and again when the screen
   * regains focus: on web an inactive screen is hidden with `display: none`,
   * which resets its scroll position without a scroll event.
   */
  onScrollOffset?: (offsetY: number) => void;
  testID?: string;
  className?: string;
};

export function CatalogGrid<ItemT>({
  data,
  renderItem,
  keyExtractor,
  onItemPress,
  minItemWidth = 260,
  maxColumns = 4,
  gap = 18,
  horizontalPadding = 0,
  leadingInset = 0,
  listHeaderComponent,
  listEmptyComponent,
  listFooterComponent,
  onScrollOffset,
  testID,
  className,
}: CatalogGridProps<ItemT>) {
  const [width, setWidth] = useState(0);
  const listRef = useRef<FlashListRef<ItemT>>(null);
  const columns = columnsForWidth(width - horizontalPadding * 2 - leadingInset, {
    minItemWidth,
    gap,
    max: maxColumns,
  });

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      onScrollOffset?.(event.nativeEvent.contentOffset.y),
    [onScrollOffset],
  );

  // The list (re)mounts at the top whenever it first measures or its column
  // count changes (it is keyed by `columns`); say so, or a consumer tracking
  // the offset keeps the old list's position.
  const mounted = width > 0;
  useEffect(() => {
    if (mounted) onScrollOffset?.(0);
  }, [columns, mounted, onScrollOffset]);

  useFocusEffect(
    useCallback(() => {
      // Only the web node exposes `scrollTop`; native keeps its offset and events.
      const node: unknown = listRef.current?.getScrollableNode();
      if (node && typeof (node as { scrollTop?: unknown }).scrollTop === "number") {
        onScrollOffset?.((node as { scrollTop: number }).scrollTop);
      }
    }, [onScrollOffset]),
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const handleItemPress = useCallback((item: ItemT) => onItemPress(item), [onItemPress]);

  const halfGap = gap / 2;
  const renderRow = useCallback(
    ({ item }: { item: ItemT; index: number }) => (
      <View style={{ paddingHorizontal: halfGap, paddingBottom: gap }} className="flex-1">
        {renderItem({ item, onPress: handleItemPress })}
      </View>
    ),
    [renderItem, handleItemPress, halfGap, gap],
  );

  // Cells carry half the gap on each side, so the content is inset by the
  // remaining half to land exactly on the page gutter.
  const contentContainerStyle = useMemo(
    () => ({
      paddingLeft: Math.max(0, horizontalPadding - halfGap) + leadingInset,
      paddingRight: Math.max(0, horizontalPadding - halfGap),
      paddingBottom: 40,
    }),
    [horizontalPadding, halfGap, leadingInset],
  );

  const inset = (element?: React.ReactElement) =>
    element ? <View style={{ paddingHorizontal: halfGap }}>{element}</View> : undefined;

  return (
    <View className={cn("flex-1", className)} onLayout={handleLayout}>
      {width > 0 ? (
        <FlashList<ItemT>
          ref={listRef}
          key={columns}
          data={data}
          numColumns={columns}
          renderItem={renderRow}
          keyExtractor={keyExtractor}
          ListHeaderComponent={inset(listHeaderComponent)}
          ListEmptyComponent={inset(listEmptyComponent)}
          ListFooterComponent={inset(listFooterComponent)}
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          onScroll={onScrollOffset ? handleScroll : undefined}
          scrollEventThrottle={16}
          testID={testID}
        />
      ) : null}
    </View>
  );
}
