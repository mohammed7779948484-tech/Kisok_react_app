import "@/global.css";
import "react-native-reanimated";

import { ThemeProvider } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppErrorBoundary } from "@/components/app/error-boundary";
import { EnvGate } from "@/components/app/env-gate";
import { AuthProvider, useAuth } from "@/core/auth";
import { QueryProvider } from "@/core/query";
import { NAV_THEME } from "@/core/theme";
import { StartupScreen } from "@/features/auth";

export const unstable_settings = { anchor: "index" };

/**
 * Root navigator.
 *
 * Route access is declared with `Stack.Protected` guards rather than redirect
 * effects, so an unreachable screen simply is not in the navigator. This is UX
 * protection only — Supabase RLS is the actual authorization boundary.
 */
function RootNavigator() {
  const { status, profile } = useAuth();

  // Hold the whole app on one screen until identity is known, so no route
  // renders against a half-resolved session.
  if (status === "resolving" || status === "error") {
    return <StartupScreen />;
  }

  const ready = status === "ready";

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />

      <Stack.Protected guard={status === "signedOut"}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>

      <Stack.Protected guard={status === "unauthorized"}>
        <Stack.Screen name="unauthorized" />
      </Stack.Protected>

      <Stack.Protected guard={ready && profile?.role === "customer"}>
        <Stack.Screen name="(customer)" />
      </Stack.Protected>

      <Stack.Protected guard={ready && profile?.role === "preparation"}>
        <Stack.Screen name="(preparation)" />
      </Stack.Protected>

      {/* Development-only surfaces. Unreachable in a production build. */}
      <Stack.Protected guard={__DEV__}>
        <Stack.Screen name="(dev)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Read from NativeWind so the navigator's own surfaces follow the same colour
  // scheme as the Tailwind classes, instead of React Navigation painting its
  // white default behind every screen transition.
  const { colorScheme } = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={NAV_THEME[colorScheme === "dark" ? "dark" : "light"]}>
          {/* Wraps every provider and screen, so a throw anywhere below shows a
            recovery screen rather than leaving a white tablet in a shop. It sits
            INSIDE ThemeProvider deliberately: the fallback is then painted in
            the app's own colours instead of React Navigation's white default. */}
          <AppErrorBoundary>
            <EnvGate>
              <QueryProvider>
                <AuthProvider>
                  <RootNavigator />
                  {/* Hosts dialogs and adaptive sheets. Must be mounted once, here. */}
                  <PortalHost />
                </AuthProvider>
              </QueryProvider>
            </EnvGate>
          </AppErrorBoundary>
        </ThemeProvider>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
