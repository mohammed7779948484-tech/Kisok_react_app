import { Link, Stack } from "expo-router";

import { Screen } from "@/components/layout/screen";
import { Button, Text } from "@/components/ui";
import { View } from "react-native";

export default function NotFoundRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <Screen edges={["top", "bottom", "left", "right"]}>
        <View className="flex-1 items-center justify-center p-6 md:p-10">
          <View className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
            <View className="flex-row items-center justify-between bg-primary p-6 md:p-8">
              <Text variant="label" className="text-primary-foreground">
                Page not found
              </Text>
              <View className="h-3 w-14 rounded-sm bg-accent" />
            </View>
            <View className="items-start gap-5 p-6 md:p-10">
              <Text variant="h1" accessibilityRole="header">
                This screen doesn&apos;t exist
              </Text>
              <Text variant="body" tone="muted" className="max-w-xl">
                The address doesn&apos;t point to a KISOK workspace. Return to the start to
                continue.
              </Text>
              <Link href="/" asChild>
                <Button>
                  <Text>Go to the start</Text>
                </Button>
              </Link>
            </View>
          </View>
        </View>
      </Screen>
    </>
  );
}
