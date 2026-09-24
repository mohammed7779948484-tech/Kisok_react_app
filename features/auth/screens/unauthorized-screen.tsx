import { View } from "react-native";

import { Button, Text } from "@/components/ui";
import { Screen } from "@/components/layout/screen";
import { useAuth, useSignOutAction } from "@/core/auth";

/**
 * The account authenticated but has no place in the tablet app: its profile is
 * inactive/missing, or its role is `admin`, which belongs to the separate web
 * admin application.
 *
 * This screen is a courtesy, not a security boundary — the database would
 * refuse the work regardless.
 */
export function UnauthorizedScreen() {
  const { profile } = useAuth();
  const signOut = useSignOutAction();

  const reason =
    profile?.role === "admin"
      ? "Administrator accounts are managed in the web admin app, not on the store tablet."
      : "This account doesn't have an active store profile. Ask an administrator to activate it.";

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View className="flex-1 items-center justify-center p-6 md:p-10">
        <View className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
          <View className="flex-row items-center justify-between bg-primary p-6 md:p-8">
            <Text variant="label" className="text-primary-foreground">
              Account access
            </Text>
            <View className="h-3 w-14 rounded-sm bg-accent" />
          </View>
          <View accessibilityRole="alert" className="items-start gap-5 p-6 md:p-10">
            <Text variant="h1" accessibilityRole="header">
              This account cannot use the tablet
            </Text>
            <Text variant="body" tone="muted" className="max-w-xl">
              {reason}
            </Text>
            <Button
              variant="secondary"
              onPress={signOut.run}
              disabled={signOut.pending}
              className="mt-2"
            >
              <Text>{signOut.pending ? "Signing out…" : "Sign out"}</Text>
            </Button>
            {signOut.message ? (
              <Text
                variant="body"
                tone="destructive"
                accessibilityLiveRegion="polite"
                className="max-w-xl"
              >
                {signOut.message}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Screen>
  );
}
