import { useWindowDimensions } from "react-native";

/**
 * Semantic layout sizes for a tablet-first kiosk.
 *
 * Use these instead of scattering raw pixel comparisons through screens. The
 * thresholds match the Tailwind `screens` in tailwind.config.js, so
 * `className="md:flex-row"` and `useLayoutSize()` always agree.
 *
 *   compact  — narrow browser preview / split screen
 *   medium   — tablet portrait (the primary in-store orientation)
 *   expanded — tablet landscape and larger
 */
export const BREAKPOINTS = {
  compact: 0,
  medium: 768,
  expanded: 1024,
} as const;

export type LayoutSize = keyof typeof BREAKPOINTS;

export function layoutSizeForWidth(width: number): LayoutSize {
  if (width >= BREAKPOINTS.expanded) return "expanded";
  if (width >= BREAKPOINTS.medium) return "medium";
  return "compact";
}

export type Layout = {
  width: number;
  height: number;
  size: LayoutSize;
  isCompact: boolean;
  isMedium: boolean;
  /** True on tablet landscape — the layout that can afford side-by-side panels. */
  isExpanded: boolean;
  isPortrait: boolean;
  isLandscape: boolean;
};

/**
 * Reactive layout description. Uses `useWindowDimensions` (not `Dimensions`)
 * so rotating an Android tablet re-renders.
 */
export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  const size = layoutSizeForWidth(width);
  const isPortrait = height >= width;

  return {
    width,
    height,
    size,
    isCompact: size === "compact",
    isMedium: size === "medium",
    isExpanded: size === "expanded",
    isPortrait,
    isLandscape: !isPortrait,
  };
}

/**
 * Pick a value per layout size, falling back down the scale.
 * `useResponsiveValue({ compact: 2, expanded: 4 })` yields 2 on a medium screen.
 */
export function useResponsiveValue<T>(values: { compact: T; medium?: T; expanded?: T }): T {
  const { size } = useLayout();
  if (size === "expanded") return values.expanded ?? values.medium ?? values.compact;
  if (size === "medium") return values.medium ?? values.compact;
  return values.compact;
}

/** Keeps long-form content readable on a wide landscape tablet. */
export const CONTENT_MAX_WIDTH = 1280;
