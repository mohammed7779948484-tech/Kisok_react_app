import { useReducedMotion as useReanimatedReducedMotion } from "react-native-reanimated";

import { duration } from "../tokens/motion";

/**
 * Whether the person has asked the OS to reduce motion. Reanimated reads the
 * setting natively on Android and through `prefers-reduced-motion` on web.
 */
export function useReducedMotion(): boolean {
  return useReanimatedReducedMotion();
}

/** A duration token, or 0 when reduced motion is on. */
export function useMotionDuration(token: keyof typeof duration = "standard"): number {
  const reduced = useReducedMotion();
  return reduced ? duration.none : duration[token];
}
