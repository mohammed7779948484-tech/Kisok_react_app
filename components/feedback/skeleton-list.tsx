import { View } from "react-native";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/core/utils";

/** Placeholder rows matching a list's real item height, to avoid a layout jump. */
export function SkeletonList({
  count = 6,
  itemClassName = "h-20",
  className,
}: {
  count?: number;
  itemClassName?: string;
  className?: string;
}) {
  return (
    <View accessibilityLabel="Loading content" className={cn("gap-3", className)}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={itemClassName} />
      ))}
    </View>
  );
}

/** Placeholder grid for the catalog surfaces. */
export function SkeletonGrid({
  count = 8,
  columns = 2,
  className,
}: {
  count?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <View
      accessibilityLabel="Loading content"
      className={cn("flex-row flex-wrap gap-3", className)}
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton
          key={index}
          className="h-48 flex-1"
          style={{ minWidth: `${100 / columns - 4}%` }}
        />
      ))}
    </View>
  );
}
