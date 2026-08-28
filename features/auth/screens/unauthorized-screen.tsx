import { View } from "react-native";

import { Button, Text } from "@/components/ui";
import { Screen } from "@/components/layout/screen";
import { useAuth } from "@/core/auth";

/**
 * The account authenticated but has no place in the tablet app: its profile is
 * inactive/missing, or its role is `admin`, which belongs to the separate web
 * admin application.
 *
 * This screen is a courtesy, not a security boundary — the database would
 * refuse the work regardless.
 */
export function UnauthorizedScreen() {
  const { profile, signOut } = useAuth();

  const reason =
    profile?.role === "admin"
      ? "Administrator accounts are managed in the web admin app, not on the store tablet."
      : "This account doesn't have an active store profile. Ask an administrator to activate it.";

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View className="flex-1 items-center justify-center gap-4 p-8">
        <Text variant="h2" className="text-center">
          This account can't use the tablet
        </Text>
        <Text variant="body" tone="muted" className="max-w-md text-center">
          {reason}
        </Text>
        <Button variant="secondary" onPress={() => void signOut()} className="mt-2">
          <Text>Sign out</Text>
        </Button>
      </View>
    </Screen>
  );
}
