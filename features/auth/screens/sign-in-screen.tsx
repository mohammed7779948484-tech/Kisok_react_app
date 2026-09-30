import { View } from "react-native";

import { Text } from "@/design-system";

import { AuthFrame } from "../components/auth-frame";
import { SignInForm } from "../components/sign-in-form";

/**
 * Store account sign-in. Intentionally has no signup, password reset, or social
 * login: accounts are provisioned by an administrator in the web admin app.
 */
export function SignInScreen() {
  return (
    <AuthFrame
      eyebrow="Store tablet"
      headline="Welcome to the store."
      lead="Sign in with the account assigned to this tablet to open the catalog or the preparation workspace."
    >
      <View className="gap-7">
        <View className="gap-2">
          <Text variant="h1" accessibilityRole="header">
            Sign in
          </Text>
          <Text tone="muted">Use the store account assigned to this station.</Text>
        </View>
        <View className="rounded-3xl border border-border bg-card p-6">
          <SignInForm />
        </View>
      </View>
    </AuthFrame>
  );
}
