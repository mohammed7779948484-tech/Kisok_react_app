import { Redirect } from "expo-router";

import { useAuth } from "@/core/auth";
import { StartupScreen } from "@/features/auth";
import { useRootTarget } from "@/features/kiosk-runtime";

/**
 * Entry point. Sends the session to the one experience it may use — the
 * device policy can veto preparation (a customer-kiosk tablet gets the
 * mismatch screen instead). Routing only — no data loading, no business
 * logic; the target comes from the same resolver the layout guards use.
 */
export default function IndexRoute() {
  const { status } = useAuth();
  const target = useRootTarget();

  if (status === "resolving" || status === "error") return <StartupScreen />;

  switch (target) {
    case "sign-in":
      return <Redirect href="/sign-in" />;
    case "unauthorized":
      return <Redirect href="/unauthorized" />;
    case "customer":
      return <Redirect href="/(customer)" />;
    case "preparation":
      return <Redirect href="/(preparation)" />;
    case "kiosk-mismatch":
      return <Redirect href="/kiosk-mismatch" />;
    case "startup":
      // Unreachable: the status early-return above covered resolving and
      // error, the only inputs that map to "startup".
      return <StartupScreen />;
  }
}
