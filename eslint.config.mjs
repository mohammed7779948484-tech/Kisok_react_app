// https://docs.expo.dev/guides/using-eslint/
//
// Beyond style, this config MECHANICALLY ENFORCES the architecture boundaries
// described in AGENTS.md and docs/architecture.md. If a rule below fails, the
// fix is to move the code, not to add an eslint-disable.
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

/** Packages deliberately removed from this project. Re-adding them is a regression. */
const FORBIDDEN_LEGACY = [
  { name: "axios", message: "Use the Supabase client or fetch. See docs/data-and-supabase.md." },
  { name: "drizzle-orm", message: "The Drizzle/MySQL stack was removed. Supabase is the backend." },
  { name: "express", message: "There is no Node server in this app. Supabase is the backend." },
  { name: "mysql2", message: "The Drizzle/MySQL stack was removed. Supabase is the backend." },
  { name: "superjson", message: "Left over from the removed tRPC stack." },
];

const FORBIDDEN_LEGACY_PATTERNS = [
  {
    group: ["@trpc/*"],
    message: "The tRPC stack was removed. Call Supabase from a feature api/ module.",
  },
];

/** Only a feature's public API (`@/features/<name>`) may be imported from outside it. */
const NO_DEEP_FEATURE_IMPORT = {
  group: ["@/features/*/*"],
  message:
    "Import a feature only through its public API: `@/features/<name>`. Inside a feature, use relative imports.",
};

/** UI must never reach the network directly. */
const NO_SUPABASE_IN_UI = [
  {
    name: "@supabase/supabase-js",
    message:
      "UI must not call Supabase. Put the call in the feature's api/ module and expose a query hook.",
  },
];
const NO_SUPABASE_IN_UI_PATTERNS = [
  {
    group: ["@/core/supabase", "@/core/supabase/*"],
    message:
      "UI must not call Supabase. Put the call in the feature's api/ module and expose a query hook.",
  },
];

export default defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*", "ignite/templates/**", "core/supabase/database.types.ts"],
  },
  {
    // Baseline for all application source.
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "core/**/*.{ts,tsx}",
      "features/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: FORBIDDEN_LEGACY,
          patterns: [...FORBIDDEN_LEGACY_PATTERNS, NO_DEEP_FEATURE_IMPORT],
        },
      ],
      // Use `@/core/logging` instead — it redacts sensitive values and stays quiet in production.
      "no-console": "error",
    },
  },
  {
    // Expo Router files are routing + composition only.
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...FORBIDDEN_LEGACY, ...NO_SUPABASE_IN_UI],
          patterns: [
            ...FORBIDDEN_LEGACY_PATTERNS,
            NO_DEEP_FEATURE_IMPORT,
            ...NO_SUPABASE_IN_UI_PATTERNS,
            {
              group: ["zustand", "zustand/*"],
              message: "Routes hold no state. Own the store inside the feature and expose a hook.",
            },
            {
              group: ["@tanstack/react-query"],
              message: "Routes do not fetch. Render the feature's screen; it owns its query hooks.",
            },
          ],
        },
      ],
    },
  },
  {
    // Presentational layers: screens, components, and the design system.
    files: [
      "features/*/screens/**/*.{ts,tsx}",
      "features/*/components/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...FORBIDDEN_LEGACY, ...NO_SUPABASE_IN_UI],
          patterns: [
            ...FORBIDDEN_LEGACY_PATTERNS,
            NO_DEEP_FEATURE_IMPORT,
            ...NO_SUPABASE_IN_UI_PATTERNS,
          ],
        },
      ],
    },
  },
  {
    // The logger is the one place allowed to reach the console.
    files: ["core/logging/**/*.{ts,tsx}"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.test.{ts,tsx}", "core/testing/**/*.{ts,tsx}"],
    rules: { "no-console": "off" },
  },
]);
