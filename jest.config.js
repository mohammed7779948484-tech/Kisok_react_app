/**
 * jest-expo is Expo's officially supported test preset; it ships the native
 * module mocks that match the installed SDK. See docs/testing.md.
 */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/core/testing/setup.ts"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  testPathIgnorePatterns: ["/node_modules/", "/.expo/", "/dist/", "/ignite/templates/"],
  transformIgnorePatterns: [
    "node_modules/(?!(?:jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|native-base|react-native-svg|nativewind|react-native-css-interop|@rn-primitives/.*)",
  ],
  collectCoverageFrom: [
    "core/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "features/**/*.{ts,tsx}",
    "!**/*.test.{ts,tsx}",
    "!core/supabase/database.types.ts",
  ],
};
