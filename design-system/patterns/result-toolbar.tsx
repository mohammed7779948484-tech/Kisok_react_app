import { View } from "react-native";

import { cn } from "@/core/utils";

import { Text } from "../primitives/text";

/**
 * The line above a result set: how many, in what scope, and the secondary
 * controls (sort, refine) on the right. It knows nothing about what the
 * results are.
 */
export function ResultToolbar({
  countLabel,
  scopeLabel,
  children,
  className,
}: {
  countLabel: string;
  scopeLabel?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={cn(
        "min-h-control flex-row flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border pb-2",
        className,
      )}
    >
      <View
        accessible
        accessibilityLiveRegion="polite"
        className="min-w-0 shrink flex-row flex-wrap items-baseline gap-x-3"
      >
        <Text className="font-sans-bold text-title">{countLabel}</Text>
        {scopeLabel ? (
          <Text variant="meta" tone="muted" numberOfLines={1}>
            {scopeLabel}
          </Text>
        ) : null}
      </View>
      {children ? <View className="flex-row items-center gap-3">{children}</View> : null}
    </View>
  );
}
