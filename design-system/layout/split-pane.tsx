import { View } from "react-native";

import { cn } from "@/core/utils";

/**
 * Two regions side by side, or stacked when `split` is false. The caller
 * decides `split` from its own measured width (see `columnsForWidth` and
 * `splitMinWidth`) — this component only arranges.
 */
export function SplitPane({
  split,
  primary,
  secondary,
  primaryFlex = 1,
  secondaryWidth,
  secondaryFlex,
  gap = 32,
  align = "start",
  className,
}: {
  split: boolean;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  primaryFlex?: number;
  /** A fixed width for the secondary region when split. */
  secondaryWidth?: number;
  /** Or a flex share, when the secondary region should grow too. */
  secondaryFlex?: number;
  gap?: number;
  align?: "start" | "stretch";
  className?: string;
}) {
  if (!split) {
    return (
      <View className={cn("w-full", className)} style={{ rowGap: gap }}>
        {primary}
        {secondary}
      </View>
    );
  }

  return (
    <View
      className={cn(
        "w-full flex-row",
        align === "start" ? "items-start" : "items-stretch",
        className,
      )}
      style={{ columnGap: gap }}
    >
      <View className="min-w-0" style={{ flex: primaryFlex }}>
        {primary}
      </View>
      <View
        className="min-w-0"
        style={
          secondaryWidth !== undefined ? { width: secondaryWidth } : { flex: secondaryFlex ?? 1 }
        }
      >
        {secondary}
      </View>
    </View>
  );
}
