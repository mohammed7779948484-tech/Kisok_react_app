/**
 * Corner radii in dp. Surfaces round more as they grow: fields and chips sit
 * at `md`, cards at `xl`, editorial panels at `2xl`/`3xl`, and pills at `full`.
 */
export const radius = {
  none: 0,
  xs: 8,
  sm: 11,
  md: 14,
  lg: 18,
  xl: 24,
  "2xl": 28,
  "3xl": 34,
  full: 9999,
} as const;

export type RadiusToken = keyof typeof radius;
