import { Redirect } from "expo-router";

import { useAuth } from "@/core/auth";
import { StartupScreen } from "@/features/auth";

/**
 * Entry point. Sends the session to the one experience its role can use.
 * Routing only — no data loading, no business logic.
 */
export default function IndexRoute() {
  const { status, profile } = useAuth();

  if (status === "resolving" || status === "error") return <StartupScreen />;
  if (status === "signedOut") return <Redirect href="/sign-in" />;
  if (status === "unauthorized") return <Redirect href="/unauthorized" />;

  return profile?.role === "preparation" ? (
    <Redirect href="/(preparation)" />
  ) : (
    <Redirect href="/(customer)" />
  );
}
