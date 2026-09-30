import { useEffect } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
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
  // NativeWind applies `className` only to interop components such as View;
  // on Android a Reanimated view drops it. So the size and shape live on a
  // plain View, and only the opacity pulse is animated inside it.
  return (
    <View
      aria-hidden
      style={style}
      className={cn("overflow-hidden rounded-md", className)}
      {...props}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, animatedStyle]}>
        <View className="flex-1 bg-muted" />
      </Animated.View>
    </View>
  );
}
