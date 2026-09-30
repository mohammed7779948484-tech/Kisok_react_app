import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";

/**
 * The colour roles in the shape React Navigation needs.
 *
 * `global.css` is the source of truth for KISOK colours, but React Navigation
 * cannot read CSS variables — it paints the container behind a screen, and
 * anything drawn during a transition, from concrete strings. Without this it
 * uses its own white default, which flashes between screens.
 *
 * These triples therefore restate `global.css` exactly, in the same format. The
 * full set is mirrored, not just the six the navigator paints, so any colour
 * that must be passed as a value (an icon `color`, a native prop) comes from
 * here rather than being retyped.
 */
export const TOKENS = {
  light: {
    background: "42 28% 93%",
    foreground: "156 10% 10%",
    card: "45 33% 98%",
    cardForeground: "156 10% 10%",
    popover: "45 33% 98%",
    popoverForeground: "156 10% 10%",
    primary: "163 47% 17%",
    primaryForeground: "72 24% 96%",
    secondary: "135 13% 88%",
    secondaryForeground: "163 47% 17%",
    muted: "42 23% 89%",
    mutedForeground: "153 5% 37%",
    accent: "27 29% 47%",
    accentForeground: "72 24% 96%",
    accentSoft: "31 40% 82%",
    success: "161 43% 31%",
    successForeground: "72 24% 96%",
    warning: "39 78% 42%",
    warningForeground: "202 32% 12%",
    warningText: "35 86% 27%",
    destructive: "8 52% 42%",
    destructiveForeground: "72 24% 96%",
    unavailable: "10 24% 42%",
    border: "47 11% 85%",
    input: "45 8% 72%",
    ring: "162 42% 24%",
  },
  dark: {
    background: "160 14% 8%",
    foreground: "45 20% 92%",
    card: "160 12% 12%",
    cardForeground: "45 20% 92%",
    popover: "160 12% 12%",
    popoverForeground: "45 20% 92%",
    primary: "150 30% 70%",
    primaryForeground: "163 47% 12%",
    secondary: "160 12% 18%",
    secondaryForeground: "45 20% 92%",
    muted: "160 10% 16%",
    mutedForeground: "150 6% 66%",
    accent: "30 40% 64%",
    accentForeground: "160 14% 8%",
    accentSoft: "30 20% 24%",
    success: "155 40% 56%",
    successForeground: "160 14% 8%",
    warning: "40 75% 60%",
    warningForeground: "40 50% 9%",
    warningText: "40 75% 70%",
    destructive: "8 60% 66%",
    destructiveForeground: "8 40% 10%",
    unavailable: "10 30% 68%",
    border: "160 8% 24%",
    input: "160 8% 34%",
    ring: "150 30% 64%",
  },
} as const;

/** The `--radius` token. Not a colour, but part of the RNR contract. */
export const radius = "0.875rem";

export type ColorScheme = keyof typeof TOKENS;
export type ColorRole = keyof (typeof TOKENS)["light"];

/** A colour role as a usable colour string, for props that cannot take a class. */
export function colorOf(role: ColorRole, scheme: ColorScheme = "light", alpha?: number): string {
  const triple = TOKENS[scheme][role];
  return alpha === undefined ? `hsl(${triple})` : `hsla(${triple.replace(/ /g, ", ")}, ${alpha})`;
}

type NavigationTokens = Record<ColorRole, string>;

function navigationTheme(base: Theme, tokens: NavigationTokens): Theme {
  const hsl = (triple: string) => `hsl(${triple})`;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: hsl(tokens.background),
      card: hsl(tokens.card),
      text: hsl(tokens.foreground),
      border: hsl(tokens.border),
      primary: hsl(tokens.primary),
      notification: hsl(tokens.destructive),
    },
  };
}

/** `NAV_THEME` is the name React Native Reusables' tooling looks for. */
export const NAV_THEME = {
  light: navigationTheme(DefaultTheme, TOKENS.light),
  dark: navigationTheme(DarkTheme, TOKENS.dark),
} as const;
