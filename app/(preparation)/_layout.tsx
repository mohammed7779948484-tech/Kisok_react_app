import { Stack } from "expo-router";
import { View } from "react-native";

import { OfflineNotice } from "@/components/feedback";

/**
 * Preparation employee experience. Same rules as the customer layout:
 * routing and composition only.
 */
export default function PreparationLayout() {
  return (
    <View className="flex-1">
      <OfflineNotice respectTopInset />
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
