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
      // Reachable two ways: auth `resolving`/`error` (the early return above)
      // and policy-readiness `pending` with a standard policy — the first
      // native device-policy read has not produced a verdict yet, so the
      // resolver holds here instead of mounting Preparation (RD-01/IR-01:
      // the read may take several seconds, with no ordering guarantee
      // against auth).
      return <StartupScreen />;
  }
}
