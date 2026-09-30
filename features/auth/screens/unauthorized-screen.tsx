import { View } from "react-native";

import { Button, Text } from "@/design-system";
import { useAuth, useSignOutAction } from "@/core/auth";

import { AuthFrame } from "../components/auth-frame";

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
  const admin = profile?.role === "admin";

  return (
    <AuthFrame
      eyebrow="Account access"
      headline="This account isn’t for the tablet."
      lead="Store tablets open with a customer or preparation account."
    >
      <View
        accessibilityRole="alert"
        className="gap-6 rounded-3xl border border-border bg-card p-6"
      >
        <View className="gap-2">
          <Text variant="h2" accessibilityRole="header">
            {admin ? "Administrator account" : "No active store profile"}
          </Text>
          <Text tone="muted">
            {admin
              ? "Administrator accounts are managed in the web admin app, not on the store tablet."
              : "This account doesn’t have an active store profile. Ask an administrator to activate it."}
          </Text>
        </View>
        <Button size="large" block onPress={signOut.run} disabled={signOut.pending}>
          <Text>{signOut.pending ? "Signing out…" : "Sign out"}</Text>
        </Button>
        {signOut.message ? (
          <Text tone="destructive" accessibilityLiveRegion="polite">
            {signOut.message}
          </Text>
        ) : null}
      </View>
    </AuthFrame>
  );
}
