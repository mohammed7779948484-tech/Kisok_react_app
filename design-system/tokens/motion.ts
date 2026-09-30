/**
 * Motion is feedback, not decoration: short, and never required to understand
 * a state change. Every animated surface reads `useReducedMotion()` and falls
 * back to `duration.none`.
 */
export const duration = {
  none: 0,
  fast: 160,
  standard: 220,
} as const;

/** cubic-bezier(.2, .7, .2, 1) — a quick settle with no overshoot. */
export const easing = {
  standard: [0.2, 0.7, 0.2, 1] as const,
};

/** How far a revealed element travels when it rises into place. */
export const rise = 6;
