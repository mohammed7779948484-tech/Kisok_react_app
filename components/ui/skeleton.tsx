import { useEffect } from "react";
import { View, type ViewProps } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { cn } from "@/core/utils";

/**
 * Loading placeholder.
 *
 * Motion policy: a single slow opacity pulse, and NOTHING when the OS reports
 * "reduce motion". Never add a sliding shimmer — it is distracting on a large
 * kiosk screen and expensive on low-end tablets.
 *
 * Reduce-motion is read with Reanimated's synchronous `useReducedMotion()`
 * rather than an async `AccessibilityInfo` call, so mounting a skeleton does not
 * schedule a state update after render.
 */
export function Skeleton({ className, ...props }: ViewProps) {
  const opacity = useSharedValue(0.6);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = 0.6;
      return;
    }

    opacity.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={animatedStyle}>
      <View aria-hidden className={cn("rounded-lg bg-muted", className)} {...props} />
    </Animated.View>
  );
}
