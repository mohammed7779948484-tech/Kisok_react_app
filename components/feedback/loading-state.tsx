import { ActivityIndicator, View } from "react-native";

import { cn } from "@/core/utils";

import { Text } from "@/components/ui/text";

/**
 * Full-area spinner for a first load with nothing to show yet.
 * Prefer a skeleton (see SkeletonList) when the shape of the result is known —
 * it makes the wait feel shorter and avoids a layout jump.
 */
export function LoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      className={cn("flex-1 items-center justify-center gap-3 p-8", className)}
    >
      <ActivityIndicator size="large" />
      <Text variant="caption">{label}</Text>
    </View>
  );
}
