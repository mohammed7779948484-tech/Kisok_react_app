import { ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { useAuth } from "@/core/auth";

/**
 * Shown while the Supabase session is restored and the active profile is
 * resolved. A failure here offers a retry rather than dropping the tablet onto
 * a blank screen.
 */
export function StartupScreen() {
  const { status, error, retry } = useAuth();

  if (status === "error") {
    return (
      <Screen>
        <ErrorState title="We couldn't start the app" error={error} onRetry={retry} />
      </Screen>
    );
  }

  return (
    <Screen>
      <LoadingState label="Preparing the application…" />
    </Screen>
  );
}
