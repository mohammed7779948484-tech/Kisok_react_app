import { Stack } from "expo-router";
import { View } from "react-native";

import { OfflineNotice } from "@/design-system";
import { CatalogCartProvider } from "@/features/catalog-cart-integration";
import { CheckoutGate } from "@/features/checkout";
import { WhatsNewGate } from "@/features/release-notes";

/** The checkout gate sits around browsing so a pending order is resumed before anything else. */
export default function CustomerLayout() {
  return (
    <CheckoutGate>
      <CatalogCartProvider>
        <View className="flex-1">
          <OfflineNotice respectTopInset />
          <WhatsNewGate />
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </CatalogCartProvider>
    </CheckoutGate>
  );
}
