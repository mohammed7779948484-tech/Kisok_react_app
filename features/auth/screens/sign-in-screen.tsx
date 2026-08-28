import { ScrollView, View } from "react-native";

import { Screen } from "@/components/layout/screen";
import { OfflineNotice } from "@/components/feedback";
import { Text } from "@/components/ui";

import { SignInForm } from "../components/sign-in-form";

/**
 * Store account sign-in. Intentionally has no signup, password reset, or social
 * login: accounts are provisioned by an administrator in the web admin app.
 */
export function SignInScreen() {
  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <OfflineNotice />
      <ScrollView
        contentContainerClassName="flex-grow items-center justify-center p-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-md gap-8">
          <View className="gap-2">
            <Text variant="display">KISOK</Text>
            <Text variant="lead" tone="muted">
              Sign in with the store account for this tablet.
            </Text>
          </View>
          <SignInForm />
        </View>
      </ScrollView>
    </Screen>
  );
}
