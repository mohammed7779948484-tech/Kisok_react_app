import { Stack } from "expo-router";
import { View } from "react-native";

import { OfflineNotice } from "@/components/feedback";
import { CatalogCartProvider } from "@/features/catalog-cart-integration";
import { RecoveryGate } from "@/features/checkout";

/** Recovery owns access to the complete browsing experience, including cart portals. */
export default function CustomerLayout() {
  return (
    <RecoveryGate>
      <CatalogCartProvider>
        <View className="flex-1">
          <OfflineNotice respectTopInset />
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </CatalogCartProvider>
    </RecoveryGate>
  );
}
