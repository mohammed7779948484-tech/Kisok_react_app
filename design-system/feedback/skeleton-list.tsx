import { View } from "react-native";

import { cn } from "@/core/utils";

import { Skeleton } from "../primitives/skeleton";

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
        <Skeleton key={index} className={cn("rounded-lg", itemClassName)} />
      ))}
    </View>
  );
}
