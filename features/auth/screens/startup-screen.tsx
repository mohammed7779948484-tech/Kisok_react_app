import { RotateCw } from "lucide-react-native";
import { View } from "react-native";

import { Button, Icon, Screen, Spinner, Text } from "@/design-system";
import { useAuth } from "@/core/auth";

import { KisokMark } from "../components/auth-frame";

/**
 * Shown while the Supabase session is restored and the active profile is
 * resolved. A failure offers a retry rather than leaving a blank tablet.
 */
export function StartupScreen() {
  const { status, error, retry } = useAuth();
  const failed = status === "error";

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View
        className="flex-1 items-center justify-center gap-8 px-6"
        accessibilityRole={failed ? "alert" : "progressbar"}
        accessibilityLiveRegion="polite"
        accessibilityLabel={failed ? undefined : "Opening the store"}
      >
        <KisokMark size={72} />
        <View className="max-w-md items-center gap-3">
          <Text variant="h1" className="text-center">
            {failed ? "We couldn’t open the store" : "Opening the store"}
          </Text>
          <Text variant="lead" className="text-center">
            {failed
              ? (error?.userMessage ?? "Check the connection and try again.")
              : "Getting this tablet ready — just a moment."}
          </Text>
        </View>
        {failed ? (
          <Button size="large" onPress={retry}>
            <Icon as={RotateCw} size={20} className="text-primary-foreground" />
            <Text>Try again</Text>
          </Button>
        ) : (
          <Spinner size="large" />
        )}
      </View>
    </Screen>
  );
}
