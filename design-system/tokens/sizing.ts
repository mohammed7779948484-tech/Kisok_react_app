/**
 * Control and target sizes in dp.
 *
 * `touch` is the Android 48dp minimum and is a floor for every pressable,
 * whatever its visible size. Visible controls may be smaller only when a hit
 * slop brings the target back to 48 (see `foundations/touch-target`).
 */
export const size = {
  touch: 48,
  /** Default button / field height. */
  control: 52,
  /** Primary call-to-action height. */
  "control-lg": 56,
  /** Round icon affordances (card arrows) — visible 40, target via hit slop. */
  "icon-button": 40,
  /** Option thumbnail inside the Option Rack. */
  "option-thumb": 46,
  /** Gallery thumbnail on the Product Stage. */
  "gallery-thumb": 56,
  /** Width of an adaptive side sheet. */
  sheet: 480,
} as const;

export const iconSize = {
  sm: 14,
  md: 18,
  lg: 20,
  xl: 24,
} as const;

export type SizeToken = keyof typeof size;
