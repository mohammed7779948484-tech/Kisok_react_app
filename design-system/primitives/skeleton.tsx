import { useEffect } from "react";
import type { ViewProps } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { cn } from "@/core/utils";

export function Skeleton({ className, style, ...props }: ViewProps) {
  const opacity = useSharedValue(0.55);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = 0.65;
      return;
    }
    opacity.value = withRepeat(withTiming(0.95, { duration: 1100 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      aria-hidden
      style={[animatedStyle, style]}
      className={cn("rounded-md bg-muted", className)}
      {...props}
    />
  );
}
