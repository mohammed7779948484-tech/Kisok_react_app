import { View } from "react-native";

import { cn } from "@/core/utils";

import { Skeleton } from "../primitives/skeleton";

/**
 * Placeholder cards in the shape of the grid they stand in for, so the page
 * does not jump when the real content arrives.
 */
export function SkeletonGrid({
  count = 8,
  columns = 2,
  itemClassName = "h-72",
  className,
}: {
  count?: number;
  columns?: number;
  itemClassName?: string;
  className?: string;
}) {
  const rows = Math.ceil(count / columns);
  return (
    <View accessibilityLabel="Loading content" className={cn("gap-4", className)}>
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} className="flex-row gap-4">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className={cn("flex-1 rounded-xl", itemClassName)} />
          ))}
        </View>
      ))}
    </View>
  );
}
