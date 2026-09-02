import type { ExpoConfig } from "expo/config";

/**
 * KISOK — private in-store catalog and ordering app.
 *
 * Deployment target is store-owned Android tablets. Web is a first-class
 * DEVELOPMENT preview target (agents verify UI in a browser), not a shipping
 * surface. Orientation is unlocked because the kiosk is used both portrait and
 * landscape; layouts must handle both. See docs/design-system.md.
 */
const BUNDLE_ID = "com.kisok.kiosk";

const config: ExpoConfig = {
  name: "KISOK",
  slug: "kisok",
  version: "1.0.0",
  orientation: "default",
  icon: "./assets/images/icon.png",
  scheme: "kisok",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  android: {
    adaptiveIcon: {
      backgroundColor: "#0F1A18",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: BUNDLE_ID,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_ID,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 220,
        resizeMode: "contain",
        backgroundColor: "#FCFBF8",
        dark: { backgroundColor: "#0F1A18" },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
    // KISOK kiosk-runtime: declares the Android managed-configurations
    // (app restrictions) schema and sets android:lockTaskMode="if_whitelisted"
    // on the main activity so the SAME APK is a locked store kiosk on
    // DPC-allowlisted tablets and a normal app everywhere else. The app never
    // calls startLockTask/stopLockTask; the MDM owns enforcement.
    "./modules/kiosk-policy/app.plugin.js",
    // KISOK kiosk-runtime: env-guarded release signing for the managed
    // deployment path. Inert without the MYAPP_UPLOAD_* env — local dev and
    // e2e CI keep the Expo template's debug-signed release default. With all
    // four present at prebuild time it writes the guarded signing config into
    // the generated, gitignored android/ tree only. Fail-closed
    // secret-presence checks live in the release workflow, not the plugin.
    "./plugins/with-android-release-signing.ts",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
