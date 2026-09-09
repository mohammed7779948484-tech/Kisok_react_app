import { ScrollView, View } from "react-native";

import { Text } from "@/components/ui";
import { getEnv } from "@/core/env";

/**
 * Turns a missing/invalid `.env.local` into a readable screen instead of a white
 * flash and an unhelpful red box. Purely a developer-experience guard — the
 * message names the file to create and never prints a value.
 */
export function EnvGate({ children }: { children: React.ReactNode }) {
  try {
    getEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <View className="flex-1 bg-background">
        <ScrollView contentContainerClassName="flex-grow items-center justify-center p-6 md:p-10">
          <View
            accessibilityRole="alert"
            className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card"
          >
            <View className="flex-row items-center justify-between bg-primary p-6 md:p-8">
              <Text variant="label" className="text-primary-foreground">
                Setup required
              </Text>
              <View className="h-3 w-14 rounded-sm bg-accent" />
            </View>
            <View className="gap-5 p-6 md:p-10">
              <Text variant="h1" tone="destructive" accessibilityRole="header">
                Configuration required
              </Text>
              <Text variant="body" tone="muted">
                Add the missing development configuration, then reload the application.
              </Text>
              <View className="rounded-md bg-muted p-4">
                <Text variant="mono" selectable>
                  {message}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return <>{children}</>;
}
