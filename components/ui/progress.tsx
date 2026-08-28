import * as ProgressPrimitive from "@rn-primitives/progress";
import { View } from "react-native";

import { cn } from "@/core/utils";

/**
 * Determinate progress. Pass `accessibilityLabel` describing what is
 * progressing — "Order resets in 12 seconds", not "Progress".
 */
export function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: ProgressPrimitive.RootProps & { indicatorClassName?: string }) {
  const percent = Math.min(100, Math.max(0, value ?? 0));

  return (
    <ProgressPrimitive.Root
      value={percent}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator asChild>
        <View
          className={cn("h-full bg-primary", indicatorClassName)}
          style={{ width: `${percent}%` }}
        />
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  );
}
