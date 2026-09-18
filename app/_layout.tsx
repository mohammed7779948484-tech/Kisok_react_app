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
import { DeviceModeProvider, deviceRoleAccess, useDeviceMode } from "@/features/device-mode";

export const unstable_settings = { anchor: "index" };

/**
 * Root navigator.
 *
 * Route access is declared with `Stack.Protected` guards rather than redirect
 * effects, so an unreachable screen simply is not in the navigator. This is UX
 * protection only — Supabase RLS is the actual authorization boundary.
 *
 * Two things decide what is reachable: WHO is signed in (`useAuth`) and WHAT
 * kind of tablet this is (`useDeviceMode`). The device check can only ever
 * withhold an experience, never grant one — see `features/device-mode`.
 *
 * Exported for the guard-table test in `app/__tests__`; Expo Router uses the
 * default export below.
 */
export function RootNavigator() {
  const { status, profile } = useAuth();
  const deviceMode = useDeviceMode();

  // Hold the whole app on one screen until identity is known, so no route
  // renders against a half-resolved session.
  if (status === "resolving" || status === "error") {
    return <StartupScreen />;
  }

  const ready = status === "ready";
  // "allowed" on an ordinary tablet, "blocked" on a customer kiosk, "pending"
  // until the managed configuration has been read. Only `preparation` is ever
  // withheld; the customer experience is correct on both kinds of tablet.
  const preparationAccess =
    ready && profile ? deviceRoleAccess(profile.role, deviceMode) : "pending";

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

      <Stack.Protected guard={profile?.role === "preparation" && preparationAccess === "allowed"}>
        <Stack.Screen name="(preparation)" />
      </Stack.Protected>

      {/* This tablet is the customer kiosk and a preparation employee signed in.
          The account is valid; it simply belongs on an employee tablet. */}
      <Stack.Protected guard={profile?.role === "preparation" && preparationAccess === "blocked"}>
        <Stack.Screen name="device-mismatch" />
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
                  {/* Reads the MDM-pushed managed configuration once and keeps
                    it current. Mounted here because the root navigator's guards
                    consume it. */}
                  <DeviceModeProvider>
                    <RootNavigator />
                  </DeviceModeProvider>
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
