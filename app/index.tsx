import { Redirect } from "expo-router";

import { useAuth } from "@/core/auth";
import { StartupScreen } from "@/features/auth";
import { deviceRoleAccess, useDeviceMode } from "@/features/device-mode";

/**
 * Entry point. Sends the session to the one experience its role can use on
 * THIS tablet.
 *
 * Routing only — no data loading, no business logic. The device check is an
 * additional compatibility guard layered on the existing role routing: it can
 * only ever withhold an experience, never grant one. Supabase RLS remains the
 * authorization boundary.
 */
export default function IndexRoute() {
  const { status, profile } = useAuth();
  const deviceMode = useDeviceMode();

  if (status === "resolving" || status === "error") return <StartupScreen />;
  if (status === "signedOut") return <Redirect href="/sign-in" />;
  if (status === "unauthorized") return <Redirect href="/unauthorized" />;

  const access = profile ? deviceRoleAccess(profile.role, deviceMode) : "pending";

  // The device mode is not settled yet. Holding on the startup screen is
  // honest; guessing "ordinary tablet" would open the Preparation experience
  // on a locked customer kiosk for as long as the read takes.
  if (access === "pending") return <StartupScreen />;
  if (access === "blocked") return <Redirect href="/device-mismatch" />;

  return profile?.role === "preparation" ? (
    <Redirect href="/(preparation)" />
  ) : (
    <Redirect href="/(customer)" />
  );
}
