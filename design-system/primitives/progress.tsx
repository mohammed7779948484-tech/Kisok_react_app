import * as ProgressPrimitive from "@rn-primitives/progress";
import * as React from "react";
import { Platform, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from "react-native-reanimated";

import { cn } from "@/core/utils";

function Indicator({ value, className }: { value: number | undefined | null; className?: string }) {
  const progress = useDerivedValue(() => value ?? 0);

  const indicator = useAnimatedStyle(() => {
    return {
      width: withSpring(
        `${interpolate(progress.value, [0, 100], [0, 100], Extrapolation.CLAMP)}%`,
        { overshootClamping: true },
      ),
    };
  });

  if (Platform.OS === "web") {
    return (
      <View
        className={cn("h-full w-full flex-1 bg-primary transition-all", className)}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      >
        <ProgressPrimitive.Indicator className={cn("h-full w-full", className)} />
      </View>
    );
  }

  return (
    <ProgressPrimitive.Indicator asChild>
      <Animated.View style={indicator} className={cn("h-full bg-primary", className)} />
    </ProgressPrimitive.Indicator>
  );
}

export function Progress({
  className,
  indicatorClassName,
  value,
  max = 100,
  accessibilityLabel,
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
      accessibilityLabel={accessibilityLabel}
      className={cn("relative h-2.5 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <Indicator value={percent} className={indicatorClassName} />
    </ProgressPrimitive.Root>
  );
}
