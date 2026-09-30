/**
 * KISOK Tailwind / NativeWind configuration.
 *
 * Every scale here is read from `design-system/tokens`, so a class and the
 * TypeScript value a component measures with are one number. Colours resolve
 * to the semantic HSL variables in `design-system/theme/global.css`; add a
 * colour there first, never as an inline hex in a component.
 */
// jiti resolves the token modules relative to this file.
const jiti = require("jiti")(require.resolve("./tailwind.config.js"));

const { fontFamily, tailwindFontSizes } = jiti("./design-system/tokens/typography.ts");
const { radius } = jiti("./design-system/tokens/radii.ts");
const { size } = jiti("./design-system/tokens/sizing.ts");
const { breakpoint } = jiti("./design-system/tokens/layout.ts");

const px = (value) => `${value}px`;
const pxMap = (tokens) =>
  Object.fromEntries(Object.entries(tokens).map(([name, value]) => [name, px(value)]));
const role = (name) => `hsl(var(--${name}))`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,tsx}",
    "./components/**/*.{js,ts,tsx}",
    "./core/**/*.{js,ts,tsx}",
    "./design-system/**/*.{js,ts,tsx}",
    "./features/**/*.{js,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: role("background"),
        foreground: role("foreground"),
        card: { DEFAULT: role("card"), foreground: role("card-foreground") },
        popover: { DEFAULT: role("popover"), foreground: role("popover-foreground") },
        primary: { DEFAULT: role("primary"), foreground: role("primary-foreground") },
        secondary: { DEFAULT: role("secondary"), foreground: role("secondary-foreground") },
        muted: { DEFAULT: role("muted"), foreground: role("muted-foreground") },
        accent: {
          DEFAULT: role("accent"),
          foreground: role("accent-foreground"),
          soft: role("accent-soft"),
        },
        success: { DEFAULT: role("success"), foreground: role("success-foreground") },
        warning: {
          DEFAULT: role("warning"),
          foreground: role("warning-foreground"),
          text: role("warning-text"),
        },
        destructive: {
          DEFAULT: role("destructive"),
          foreground: role("destructive-foreground"),
        },
        unavailable: role("unavailable"),
        border: role("border"),
        input: role("input"),
        ring: role("ring"),
      },
      fontFamily: Object.fromEntries(
        Object.entries(fontFamily).map(([name, family]) => [name, [family]]),
      ),
      fontSize: tailwindFontSizes(),
      borderRadius: pxMap(radius),
      spacing: pxMap(size),
      minHeight: pxMap(size),
      minWidth: pxMap(size),
    },
    screens: {
      sm: px(breakpoint.sm),
      md: px(breakpoint.medium),
      lg: px(breakpoint.expanded),
      xl: px(breakpoint.wide),
    },
  },
  // Required by React Native Reusables: the primitives' enter/exit animation
  // classes resolve through it.
  plugins: [require("tailwindcss-animate")],
};
