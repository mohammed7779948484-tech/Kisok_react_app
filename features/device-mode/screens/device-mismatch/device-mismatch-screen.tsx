import { View } from "react-native";

import { Button, Screen, Text } from "@/design-system";
import { useSignOutAction } from "@/core/auth";

import { useDeviceMode } from "../../state/device-mode-context";

/**
 * Retained legacy fallback for a role blocked by the routing decision.
 * Valid Customer and Preparation accounts cannot reach this screen, regardless
 * of device mode. The legacy device-specific copy and shared sign-out pipeline
 * are kept here to avoid unrelated screen or navigation changes.
 *
 * Supabase authorization and RLS remain the security boundary.
 */
export function DeviceMismatchScreen() {
  const signOut = useSignOutAction();
  const deviceMode = useDeviceMode();

  const isKiosk = deviceMode === "customer-kiosk";
  const title = isKiosk
    ? "This tablet is the customer kiosk"
    : "We couldn't read this tablet's setup";
  const explanation = isKiosk
    ? "Preparation work happens on an employee tablet. Sign out to hand this one back to customers."
    : "Until it can be read, preparation work is kept off this tablet in case it is the customer kiosk. Sign out, then ask an administrator to check the tablet's configuration.";

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View className="flex-1 items-center justify-center gap-4 p-8">
        <Text variant="h2" className="text-center">
          {title}
        </Text>
        <Text variant="body" tone="muted" className="max-w-md text-center">
          {explanation}
        </Text>
        <Button
          variant="secondary"
          onPress={signOut.run}
          disabled={signOut.pending}
          className="mt-2"
        >
          <Text>{signOut.pending ? "Signing out…" : "Sign out"}</Text>
        </Button>
        {signOut.message ? (
          <Text variant="body" tone="destructive" className="max-w-md text-center">
            {signOut.message}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
