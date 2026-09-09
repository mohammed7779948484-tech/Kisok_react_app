import { ScrollView, View } from "react-native";

import { Screen } from "@/components/layout/screen";
import { OfflineNotice } from "@/components/feedback";
import { Text } from "@/components/ui";
import { useLayout } from "@/core/responsive";

import { SignInForm } from "../components/sign-in-form";

/**
 * Store account sign-in. Intentionally has no signup, password reset, or social
 * login: accounts are provisioned by an administrator in the web admin app.
 */
export function SignInScreen() {
  const layout = useLayout();
  const split = layout.isLandscape && !layout.isCompact;

  return (
    <Screen edges={["top", "bottom", "left", "right"]} constrained={false}>
      <OfflineNotice />
      <ScrollView contentContainerClassName="flex-grow" keyboardShouldPersistTaps="handled">
        <View className={split ? "flex-1 flex-row" : "flex-1"}>
          <View
            className={
              split
                ? "w-1/2 justify-between bg-primary p-10 xl:p-14"
                : "min-h-72 justify-between bg-primary p-6 md:min-h-96 md:p-10"
            }
          >
            <View className="flex-row items-center gap-3">
              <View className="h-3 w-12 rounded-sm bg-accent" />
              <Text variant="label" className="text-primary-foreground">
                Store tablet
              </Text>
            </View>

            <View className="max-w-xl gap-4 py-10">
              <Text
                variant="display"
                className="text-primary-foreground"
                accessibilityRole="header"
              >
                KISOK
              </Text>
              <Text variant="lead" className="max-w-lg text-primary-foreground/80">
                Welcome. Your store workspace starts here.
              </Text>
            </View>

            <View className="flex-row items-center gap-3">
              <View className="h-2 w-2 rounded-full bg-accent" />
              <Text variant="caption" className="text-primary-foreground/80">
                Private access for this store tablet
              </Text>
            </View>
          </View>

          <View
            className={
              split
                ? "w-1/2 items-center justify-center bg-background p-10 xl:p-14"
                : "flex-1 items-center bg-background p-6 py-10 md:p-10"
            }
          >
            <View className="w-full max-w-md gap-8">
              <View className="gap-3">
                <View className="h-2 w-16 rounded-sm bg-accent" />
                <Text variant="h1" accessibilityRole="header">
                  Sign in at this station
                </Text>
                <Text variant="body" tone="muted">
                  Use the store account assigned to this tablet.
                </Text>
              </View>
              <View className="rounded-lg border border-border bg-card p-5 md:p-6">
                <SignInForm />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
