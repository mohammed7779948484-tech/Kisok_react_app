/**
 * KISOK Tailwind / NativeWind configuration.
 *
 * Colours resolve to the semantic HSL variables declared in `global.css`.
 * Add a colour here only by adding a token there first — never inline a hex
 * value in a component.
 *
 * Breakpoints are tablet-first, sized for the real deployment target
 * (store-owned Android tablets) plus the narrower browser widths agents use
 * for web preview. See `core/responsive`.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,tsx}",
    "./components/**/*.{js,ts,tsx}",
    "./core/**/*.{js,ts,tsx}",
    "./features/**/*.{js,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: {
        sm: "calc(var(--radius) - 6px)",
        md: "calc(var(--radius) - 3px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 6px)",
      },
      spacing: {
        // Minimum comfortable touch target for the kiosk. See docs/design-system.md.
        touch: "48px",
      },
    },
    screens: {
      // Narrow browser preview / split-screen.
      sm: "480px",
      // Tablet portrait — the primary in-store orientation.
      md: "768px",
      // Tablet landscape.
      lg: "1024px",
      // Large landscape / desk monitor during development.
      xl: "1280px",
    },
  },
  // Required by React Native Reusables: its CLI lists tailwindcss-animate among
  // the core dependencies, and the primitives' enter/exit animation classes
  // resolve through it. Verified against @react-native-reusables/cli 0.7.1.
  plugins: [require("tailwindcss-animate")],
};
