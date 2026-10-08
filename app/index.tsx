import { Redirect } from "expo-router";

import { useAuth } from "@/core/auth";
import { StartupScreen } from "@/features/auth";
import { deviceRoleAccess, useDeviceMode } from "@/features/device-mode";

/**
 * Entry point. Sends the session to the experience authorized by its role.
 * Device classification never delays a valid Customer or Preparation account.
 * Routing only; Supabase authorization and RLS remain the security boundary.
 */
export default function IndexRoute() {
  const { status, profile } = useAuth();
  const deviceMode = useDeviceMode();

  if (status === "resolving" || status === "error") return <StartupScreen />;
  if (status === "signedOut") return <Redirect href="/sign-in" />;
  if (status === "unauthorized") return <Redirect href="/unauthorized" />;

  const access = profile ? deviceRoleAccess(profile.role, deviceMode) : "pending";

  // Only missing identity keeps a ready session pending. Device reads and
  // retries cannot delay an account whose tablet role is already known.
  if (access === "pending") return <StartupScreen />;
  if (access === "blocked") return <Redirect href="/device-mismatch" />;

  return profile?.role === "preparation" ? (
    <Redirect href="/(preparation)" />
  ) : (
    <Redirect href="/(customer)" />
  );
}
