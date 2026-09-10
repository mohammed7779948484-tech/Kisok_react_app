import * as ProgressPrimitive from "@rn-primitives/progress";
import { View } from "react-native";

import { cn } from "@/core/utils";

export function Progress({
  className,
  indicatorClassName,
  value,
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string;
  accessibilityLabel: string;
}) {
  const normalizedMax = Number.isFinite(max) && max > 0 ? max : 100;
  const clampedValue = Math.min(normalizedMax, Math.max(0, value ?? 0));
  const percent = (clampedValue / normalizedMax) * 100;
  return (
    <ProgressPrimitive.Root
      value={clampedValue}
      max={normalizedMax}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator asChild>
        <View
          className={cn("h-full rounded-full bg-primary", indicatorClassName)}
          style={{ width: `${percent}%` }}
        />
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  );
}
