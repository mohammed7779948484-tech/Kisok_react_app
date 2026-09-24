import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";

/**
 * The navigation theme, in the shape React Navigation needs.
 *
 * `global.css` is the source of truth for KISOK colours, but React Navigation
 * cannot read CSS variables — it needs concrete colour strings for the surfaces
 * it paints itself: the container behind a screen, and anything it draws during
 * a transition. Without this it uses its own white default, which flashes
 * between screens on a dark-themed tablet.
 *
 * These values therefore restate the tokens from `global.css`, which is a second
 * copy and would drift silently. `core/__tests__/theme.test.ts` parses
 * `global.css` and fails if any value here stops matching, so the duplication
 * cannot rot unnoticed. Keep the HSL triples in exactly the format
 * `global.css` uses.
 *
 * The full set is mirrored, not just the six the navigator paints: React Native
 * Reusables' tooling expects this file to carry the whole token contract, and
 * having every token available in TypeScript is useful anywhere a colour is
 * needed programmatically rather than as a class.
 */
export const TOKENS = {
  light: {
    background: "42 24% 96%",
    foreground: "202 28% 14%",
    card: "42 22% 99%",
    cardForeground: "202 28% 14%",
    popover: "42 22% 99%",
    popoverForeground: "202 28% 14%",
    primary: "195 55% 27%",
    primaryForeground: "42 33% 98%",
    secondary: "196 18% 91%",
    secondaryForeground: "198 27% 19%",
    muted: "40 15% 91%",
    mutedForeground: "200 10% 38%",
    accent: "24 48% 43%",
    accentForeground: "42 33% 98%",
    success: "151 39% 31%",
    successForeground: "42 33% 98%",
    warning: "39 78% 42%",
    warningForeground: "202 32% 12%",
    warningText: "35 86% 27%",
    destructive: "7 58% 43%",
    destructiveForeground: "42 33% 98%",
    border: "40 12% 80%",
    input: "200 10% 70%",
    ring: "195 50% 36%",
  },
  dark: {
    background: "203 27% 9%",
    foreground: "43 20% 92%",
    card: "201 23% 13%",
    cardForeground: "43 20% 92%",
    popover: "201 23% 13%",
    popoverForeground: "43 20% 92%",
    primary: "190 45% 63%",
    primaryForeground: "202 34% 11%",
    secondary: "198 18% 20%",
    secondaryForeground: "43 20% 92%",
    muted: "202 15% 18%",
    mutedForeground: "198 10% 68%",
    accent: "27 57% 62%",
    accentForeground: "202 34% 11%",
    success: "151 42% 56%",
    successForeground: "153 42% 9%",
    warning: "40 75% 60%",
    warningForeground: "40 50% 9%",
    warningText: "40 75% 70%",
    destructive: "7 65% 65%",
    destructiveForeground: "7 46% 10%",
    border: "200 15% 26%",
    input: "200 14% 32%",
    ring: "190 48% 62%",
  },
} as const;

/** The `--radius` token. Not a colour, but part of the same contract, and the
 * one value React Navigation has no slot for. */
export const radius = "0.875rem";

const hsl = (triple: string) => `hsl(${triple})`;

/** `as const` above makes every value its own literal type, so the parameter is
 * described structurally rather than as one of the two scheme objects. */
type NavigationTokens = Record<keyof (typeof TOKENS)["light"], string>;

function navigationTheme(base: Theme, tokens: NavigationTokens): Theme {
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

/**
 * `NAV_THEME` is the name React Native Reusables' tooling looks for, so its
 * `doctor` recognises this project as themed rather than reporting a missing
 * file and offering to write one in a location that would not match this
 * repository's layout.
 */
export const NAV_THEME = {
  light: navigationTheme(DefaultTheme, TOKENS.light),
  dark: navigationTheme(DarkTheme, TOKENS.dark),
} as const;
