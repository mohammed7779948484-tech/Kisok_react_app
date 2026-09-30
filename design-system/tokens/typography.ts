/**
 * Type roles for KISOK.
 *
 * Two families with explicit jobs: Inter for every piece of interface copy, and
 * Gelasio — a Georgia-metric serif under the SIL Open Font License — for the
 * editorial display voice. The High Fidelity reference names `Georgia`, which is
 * not a font Android ships, so the serif is bundled rather than assumed.
 *
 * Each weight is its own registered family. Android does not synthesise a
 * weight from a custom family reliably, so a weight is chosen by family name
 * (`font-sans-semibold`), never by pairing `font-sans` with `font-semibold`.
 *
 * Sizes are dp, calibrated at 1280×800 landscape. The reference's 8–9px meta
 * copy is raised to an 11dp floor so it stays legible at arm's length.
 */
export const fontFamily = {
  sans: "Inter_400Regular",
  "sans-medium": "Inter_500Medium",
  "sans-semibold": "Inter_600SemiBold",
  "sans-bold": "Inter_700Bold",
  "sans-extrabold": "Inter_800ExtraBold",
  display: "Gelasio_500Medium",
  "display-semibold": "Gelasio_600SemiBold",
} as const;

export type FontFamilyToken = keyof typeof fontFamily;

type TypeStep = { size: number; lineHeight: number; letterSpacing?: number };

/**
 * Letter-spacing is stored in dp, not em: React Native's `letterSpacing` is an
 * absolute value, so a relative em would silently resolve differently per
 * platform.
 */
export const typeScale = {
  /** Uppercase overlines and fine meta. */
  eyebrow: { size: 11, lineHeight: 14, letterSpacing: 1.4 },
  caption: { size: 12, lineHeight: 16 },
  meta: { size: 13, lineHeight: 18 },
  body: { size: 15, lineHeight: 22 },
  "body-lg": { size: 16, lineHeight: 24 },
  title: { size: 18, lineHeight: 24, letterSpacing: -0.2 },
  "title-lg": { size: 22, lineHeight: 28, letterSpacing: -0.3 },
  "display-xs": { size: 24, lineHeight: 26, letterSpacing: -0.7 },
  "display-sm": { size: 32, lineHeight: 34, letterSpacing: -1.4 },
  "display-md": { size: 38, lineHeight: 40, letterSpacing: -1.7 },
  "display-lg": { size: 52, lineHeight: 52, letterSpacing: -2.6 },
  "display-xl": { size: 64, lineHeight: 62, letterSpacing: -3.2 },
} as const satisfies Record<string, TypeStep>;

export type TypeScaleToken = keyof typeof typeScale;

/** The shape Tailwind's `fontSize` theme key expects. */
export function tailwindFontSizes(): Record<string, [string, Record<string, string>]> {
  return Object.fromEntries(
    Object.entries(typeScale).map(([name, step]) => {
      const options: Record<string, string> = { lineHeight: `${step.lineHeight}px` };
      if ("letterSpacing" in step) options.letterSpacing = `${step.letterSpacing}px`;
      return [name, [`${step.size}px`, options]];
    }),
  );
}
