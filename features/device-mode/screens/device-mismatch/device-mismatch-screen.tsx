import { View } from "react-native";

import { Screen } from "@/components/layout/screen";
import { Button, Text } from "@/components/ui";
import { useSignOutAction } from "@/core/auth";

/**
 * Shown when a signed-in role has no experience on THIS tablet.
 *
 * Reached only when the device's MDM-pushed managed configuration says this is
 * the Customer Kiosk tablet and a preparation employee has signed in. The
 * account is perfectly valid — it simply belongs on an employee tablet — so
 * the wording blames the device, not the person.
 *
 * Like `UnauthorizedScreen`, this is UX protection rather than a security
 * boundary: Supabase RLS decides what the account may actually do. Signing out
 * goes through the shared `useSignOutAction()` pipeline, so the kiosk handoff
 * safety that protects the next customer applies here unchanged.
 */
export function DeviceMismatchScreen() {
  const signOut = useSignOutAction();

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View className="flex-1 items-center justify-center gap-4 p-8">
        <Text variant="h2" className="text-center">
          This tablet is the customer kiosk
        </Text>
        <Text variant="body" tone="muted" className="max-w-md text-center">
          Preparation work happens on an employee tablet. Sign out to hand this one back to
          customers.
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
