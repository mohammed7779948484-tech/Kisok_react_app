import { Link, Stack } from "expo-router";

import { Screen } from "@/components/layout/screen";
import { Button, Text } from "@/components/ui";
import { View } from "react-native";

export default function NotFoundRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <Screen edges={["top", "bottom", "left", "right"]}>
        <View className="flex-1 items-center justify-center gap-4 p-8">
          <Text variant="h2">This screen doesn&apos;t exist</Text>
          <Link href="/" asChild>
            <Button variant="secondary">
              <Text>Go to the start</Text>
            </Button>
          </Link>
        </View>
      </Screen>
    </>
  );
}
