import { ScrollView, View } from "react-native";

import { Screen } from "@/components/layout/screen";
import { Alert, Button, Text } from "@/components/ui";
import { useSignOutAction } from "@/core/auth";

/** A JS string (not JSX text) so the apostrophe needs no entity escaping. */
const DESCRIPTION =
  "The staff preparation experience isn't available here. Sign out to return the tablet to customer sign-in.";

/**
 * Shown when a `preparation` account signs in on a customer-kiosk tablet. The
 * Preparation experience is never mounted on such a device, so this screen
 * explains what the tablet is for and offers the same safe sign-out the rest
 * of the app uses — no parallel sign-out logic of its own.
 *
 * Reachability is decided by the root guard (T07): this screen only renders
 * its state, so it reads no device-policy or profile state. `useSignOutAction`
 * is its whole connection to the session.
 *
 * States (capability-aware): ready, sign-out pending, and the shared
 * pipeline's blocked/failed message. It is local-only — there is no data to
 * load, so there are no loading, empty, or error-retry states to invent.
 */
export function KioskMismatchScreen() {
  const signOut = useSignOutAction();

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerClassName="flex-grow items-center justify-center p-6">
        <View className="w-full max-w-md gap-8">
          <View className="gap-2">
            <Text variant="h2" className="text-center">
              This is a customer tablet
            </Text>
            <Text variant="lead" tone="muted" className="text-center">
              {DESCRIPTION}
            </Text>
          </View>
          <Button size="large" block disabled={signOut.pending} onPress={signOut.run}>
            <Text>Sign out and return to customer sign-in</Text>
          </Button>
          {signOut.message ? <Alert variant="warning" title={signOut.message} /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
