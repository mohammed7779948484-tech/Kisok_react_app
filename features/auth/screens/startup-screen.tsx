import { View } from "react-native";

import { ErrorState, LoadingState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Text } from "@/components/ui";
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
      <Screen edges={["top", "bottom", "left", "right"]}>
        <View className="flex-1 items-center justify-center p-6 md:p-10">
          <View className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
            <View className="flex-row items-center justify-between bg-primary p-6 md:p-8">
              <Text variant="label" className="text-primary-foreground">
                Starting KISOK
              </Text>
              <View className="h-3 w-14 rounded-sm bg-accent" />
            </View>
            <ErrorState
              title="We couldn't start the app"
              error={error}
              onRetry={retry}
              className="min-h-80"
            />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View className="flex-1 items-center justify-center p-6 md:p-10">
        <View className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
          <View className="flex-row bg-primary p-6 md:p-8">
            <View className="flex-1 gap-2">
              <Text variant="h1" className="text-primary-foreground" accessibilityRole="header">
                KISOK
              </Text>
              <Text variant="body" className="text-primary-foreground/80">
                Opening the store workspace
              </Text>
            </View>
            <View className="h-4 w-16 rounded-sm bg-accent" />
          </View>
          <LoadingState label="Preparing the application…" className="min-h-64" />
        </View>
      </View>
    </Screen>
  );
}
