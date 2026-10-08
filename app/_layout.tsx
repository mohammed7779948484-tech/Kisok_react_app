import "@/design-system/theme/global.css";
import "react-native-reanimated";

import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppErrorBoundary } from "@/components/app/error-boundary";
import { EnvGate } from "@/components/app/env-gate";
import { AuthProvider, useAuth } from "@/core/auth";
import { QueryProvider } from "@/core/query";
import { DesignSystemProvider } from "@/design-system";
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
 * The authenticated account role determines its workspace. Device mode is
 * descriptive context and cannot withhold or delay an authorized experience.
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
  // Both tablet roles are allowed regardless of device mode. Missing identity
  // stays pending and other roles stay blocked. The entry redirect uses the
  // same decision, so it agrees with the navigator about access.
  const deviceAccess = ready && profile ? deviceRoleAccess(profile.role, deviceMode) : "pending";

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

      <Stack.Protected guard={profile?.role === "preparation" && deviceAccess === "allowed"}>
        <Stack.Screen name="(preparation)" />
      </Stack.Protected>

      {/* Legacy fallback for a blocked role. Neither authorized tablet role
          can reach this route; core/auth normally rejects other roles first. */}
      <Stack.Protected guard={deviceAccess === "blocked"}>
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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Fonts and the navigation colour theme. The theme follows NativeWind's
          colour scheme, so React Navigation never paints its white default
          behind a screen transition. */}
        <DesignSystemProvider>
          {/* Wraps every provider and screen, so a throw anywhere below shows a
            recovery screen rather than leaving a white tablet in a shop. It sits
            INSIDE the design-system provider deliberately: the fallback is then
            painted in the app's own colours and type. */}
          <AppErrorBoundary>
            <EnvGate>
              <QueryProvider>
                <AuthProvider>
                  {/* Keeps descriptive MDM device context current, independently
                    of authenticated workspace access. */}
                  <DeviceModeProvider>
                    <RootNavigator />
                  </DeviceModeProvider>
                  {/* Hosts dialogs and adaptive sheets. Must be mounted once, here. */}
                  <PortalHost />
                </AuthProvider>
              </QueryProvider>
            </EnvGate>
          </AppErrorBoundary>
        </DesignSystemProvider>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
