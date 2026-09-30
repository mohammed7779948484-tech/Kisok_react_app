import { Stack } from "expo-router";
import { View } from "react-native";

import { OfflineNotice } from "@/design-system";
import { CatalogCartProvider } from "@/features/catalog-cart-integration";
import { RecoveryGate } from "@/features/checkout";
import { WhatsNewGate } from "@/features/release-notes";

/** Recovery owns access to the complete browsing experience, including cart portals. */
export default function CustomerLayout() {
  return (
    <RecoveryGate>
      <CatalogCartProvider>
        <View className="flex-1">
          <OfflineNotice respectTopInset />
          <WhatsNewGate />
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </CatalogCartProvider>
    </RecoveryGate>
  );
}
