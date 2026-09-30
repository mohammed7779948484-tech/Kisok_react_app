/**
 * Page geometry.
 *
 * 1280×800dp landscape is the calibration viewport; everything else is
 * derived from widths, not from a device name. Breakpoints match the Tailwind
 * `screens` in tailwind.config.js, so `lg:` classes and `useLayout()` agree.
 */
export const breakpoint = {
  compact: 0,
  /** Narrow browser preview / split screen. */
  sm: 480,
  /** Tablet portrait. */
  medium: 768,
  /** Tablet landscape — side-by-side layouts become available. */
  expanded: 1024,
  /** The calibration width. */
  wide: 1280,
} as const;

/** Horizontal page gutter per layout size. */
export const gutter = {
  compact: 16,
  medium: 28,
  expanded: 44,
} as const;

/** Content never grows beyond this; wider screens gain margin, not line length. */
export const pageMaxWidth = 1440;

/** Height of the catalog chrome row at the calibration viewport. */
export const chromeHeight = 84;

/** Filter rail width in split browse layouts. */
export const railWidth = 232;

/** Below this content width a split browse layout collapses to one column. */
export const splitMinWidth = 960;
