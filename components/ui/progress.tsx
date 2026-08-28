import * as ProgressPrimitive from "@rn-primitives/progress";
import { View } from "react-native";

import { cn } from "@/core/utils";

/**
 * Determinate progress.
 *
 * `accessibilityLabel` is REQUIRED and should describe what is progressing —
 * "Order resets in 12 seconds", not "Progress". A bare progress bar tells a
 * screen-reader user nothing, so the type enforces it rather than relying on
 * the caller remembering.
 */
export function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: ProgressPrimitive.RootProps & {
  indicatorClassName?: string;
  accessibilityLabel: string;
}) {
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
