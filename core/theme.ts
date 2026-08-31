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
    background: "40 20% 99%",
    foreground: "200 12% 10%",
    card: "0 0% 100%",
    cardForeground: "200 12% 10%",
    popover: "0 0% 100%",
    popoverForeground: "200 12% 10%",
    primary: "165 62% 26%",
    primaryForeground: "160 40% 97%",
    secondary: "40 16% 94%",
    secondaryForeground: "200 12% 18%",
    muted: "40 14% 95%",
    mutedForeground: "205 8% 42%",
    accent: "32 90% 48%",
    accentForeground: "30 60% 99%",
    success: "150 62% 30%",
    successForeground: "0 0% 100%",
    warning: "38 92% 44%",
    warningForeground: "200 20% 12%",
    destructive: "4 72% 46%",
    destructiveForeground: "0 0% 100%",
    border: "40 12% 88%",
    input: "40 12% 88%",
    ring: "165 62% 32%",
  },
  dark: {
    background: "200 16% 8%",
    foreground: "40 14% 94%",
    card: "200 14% 11%",
    cardForeground: "40 14% 94%",
    popover: "200 14% 11%",
    popoverForeground: "40 14% 94%",
    primary: "165 52% 48%",
    primaryForeground: "200 20% 8%",
    secondary: "200 12% 16%",
    secondaryForeground: "40 14% 94%",
    muted: "200 12% 16%",
    mutedForeground: "200 8% 64%",
    accent: "32 88% 56%",
    accentForeground: "200 20% 8%",
    success: "150 50% 46%",
    successForeground: "200 20% 8%",
    warning: "38 88% 56%",
    warningForeground: "200 20% 8%",
    destructive: "4 66% 56%",
    destructiveForeground: "0 0% 100%",
    border: "200 10% 20%",
    input: "200 10% 22%",
    ring: "165 52% 52%",
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
