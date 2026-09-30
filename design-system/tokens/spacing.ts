/**
 * Spacing scale in dp. It is Tailwind's own 4dp step, so `gap-4` and
 * `space[4]` are the same 16dp — this module exists for the places that need a
 * number rather than a class (list gaps, measured layouts, hit slop).
 */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

export type SpaceToken = keyof typeof space;
