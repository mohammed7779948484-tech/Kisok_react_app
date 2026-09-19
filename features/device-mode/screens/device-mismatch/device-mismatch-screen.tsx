import { View } from "react-native";

import { Screen } from "@/components/layout/screen";
import { Button, Text } from "@/components/ui";
import { useSignOutAction } from "@/core/auth";

import { useDeviceMode } from "../../state/device-mode-context";

/**
 * Shown when a signed-in role has no experience on THIS tablet.
 *
 * Two device states reach it, and they need different words:
 *
 *  - the managed configuration says this is the Customer Kiosk tablet, and a
 *    preparation employee has signed in;
 *  - the managed configuration could not be read at all, and the retries gave
 *    up. Saying "this is the kiosk" there would be a claim we cannot make.
 *
 * Either way the account is perfectly valid, so the wording blames the device
 * rather than the person, and both states offer the same way out.
 *
 * Like `UnauthorizedScreen`, this is UX protection rather than a security
 * boundary: Supabase RLS decides what the account may actually do. Signing out
 * goes through the shared `useSignOutAction()` pipeline, so the kiosk handoff
 * safety that protects the next customer applies here unchanged.
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
