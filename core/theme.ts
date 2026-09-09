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
    background: "222 32% 97%",
    foreground: "228 34% 13%",
    card: "0 0% 100%",
    cardForeground: "228 34% 13%",
    popover: "0 0% 100%",
    popoverForeground: "228 34% 13%",
    primary: "231 73% 48%",
    primaryForeground: "0 0% 100%",
    secondary: "225 32% 92%",
    secondaryForeground: "229 32% 20%",
    muted: "222 24% 93%",
    mutedForeground: "224 14% 40%",
    accent: "56 96% 52%",
    accentForeground: "229 44% 12%",
    success: "153 63% 31%",
    successForeground: "0 0% 100%",
    warning: "35 96% 48%",
    warningForeground: "229 44% 12%",
    destructive: "355 73% 48%",
    destructiveForeground: "0 0% 100%",
    border: "224 22% 83%",
    input: "224 22% 78%",
    ring: "231 73% 52%",
  },
  dark: {
    background: "229 34% 8%",
    foreground: "220 32% 96%",
    card: "228 29% 12%",
    cardForeground: "220 32% 96%",
    popover: "228 29% 12%",
    popoverForeground: "220 32% 96%",
    primary: "231 91% 70%",
    primaryForeground: "231 54% 12%",
    secondary: "228 24% 19%",
    secondaryForeground: "220 32% 96%",
    muted: "228 22% 17%",
    mutedForeground: "221 17% 68%",
    accent: "56 96% 57%",
    accentForeground: "229 44% 10%",
    success: "153 58% 52%",
    successForeground: "153 56% 9%",
    warning: "35 96% 59%",
    warningForeground: "229 44% 10%",
    destructive: "355 85% 67%",
    destructiveForeground: "355 48% 10%",
    border: "227 20% 25%",
    input: "227 20% 31%",
    ring: "231 91% 72%",
  },
} as const;

/** The `--radius` token. Not a colour, but part of the same contract, and the
 * one value React Navigation has no slot for. */
export const radius = "0.75rem";

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
