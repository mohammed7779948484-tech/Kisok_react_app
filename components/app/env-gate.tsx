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
        <ScrollView contentContainerClassName="flex-grow justify-center gap-4 p-8">
          <Text variant="h2" tone="destructive">
            Configuration required
          </Text>
          <Text variant="body" className="font-mono text-sm">
            {message}
          </Text>
        </ScrollView>
      </View>
    );
  }

  return <>{children}</>;
}
