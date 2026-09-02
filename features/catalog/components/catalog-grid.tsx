import { FlashList, type FlashListProps, type ListRenderItem } from "@shopify/flash-list";
import { useCallback } from "react";
import { View } from "react-native";

import { useResponsiveValue } from "@/core/responsive";
import { cn } from "@/core/utils";

export type CatalogGridProps<Item> = Omit<
  FlashListProps<Item>,
  "data" | "horizontal" | "keyExtractor" | "numColumns" | "renderItem"
> & {
  data: readonly Item[];
  renderItem: ListRenderItem<Item>;
  keyExtractor: (item: Item, index: number) => string;
  className?: string;
};

export function CatalogGrid<Item>({
  data,
  renderItem,
  keyExtractor,
  className,
  ...listProps
}: CatalogGridProps<Item>) {
  const columns = useResponsiveValue({ compact: 2, medium: 3, expanded: 4 });
  const renderGridItem = useCallback<ListRenderItem<Item>>(
    (info) => <View className="p-2">{renderItem(info)}</View>,
    [renderItem],
  );

  return (
    <View className={cn("flex-1", className)}>
      <FlashList
        key={columns}
        {...listProps}
        data={data}
        renderItem={renderGridItem}
        keyExtractor={keyExtractor}
        numColumns={columns}
        horizontal={false}
      />
    </View>
  );
}
