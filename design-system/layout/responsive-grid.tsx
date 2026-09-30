import { Children, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";

import { cn } from "@/core/utils";

import { columnsForWidth } from "../foundations/responsive";

/**
 * A non-virtualised grid for small, bounded sets — a Home section, a handful
 * of sub-categories. Columns come from the width the grid actually gets.
 * Anything that grows with store data belongs in a FlashList instead.
 */
export function ResponsiveGrid({
  children,
  minItemWidth,
  gap = 16,
  maxColumns = 4,
  className,
}: {
  children: ReactNode;
  minItemWidth: number;
  gap?: number;
  maxColumns?: number;
  className?: string;
}) {
  const [width, setWidth] = useState(0);
  const items = Children.toArray(children);
  const columns = columnsForWidth(width, { minItemWidth, gap, max: maxColumns });
  const rows: ReactNode[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }

  const handleLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  return (
    <View onLayout={handleLayout} className={cn("w-full", className)} style={{ rowGap: gap }}>
      {width > 0
        ? rows.map((row, rowIndex) => (
            <View key={rowIndex} className="flex-row" style={{ columnGap: gap }}>
              {row}
              {Array.from({ length: columns - row.length }, (_, pad) => (
                <View key={`pad-${pad}`} className="flex-1" />
              ))}
            </View>
          ))
        : null}
    </View>
  );
}

/** A cell of `ResponsiveGrid`: shares its row equally. */
export function GridCell({ className, children }: { className?: string; children: ReactNode }) {
  return <View className={cn("min-w-0 flex-1", className)}>{children}</View>;
}
