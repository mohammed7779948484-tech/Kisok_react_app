import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { View } from "react-native";

import { Button, EmptyState, Icon, Screen, Text, usePageGutter } from "@/design-system";
import { useAuth } from "@/core/auth";

import { OrderFocus } from "../../components/order-focus";
import { useNow } from "../../components/use-now";
import { useOrderActions } from "../../components/use-order-actions";
import { effectiveTimezone, resolveStoreTimezone } from "../../model/store-day";
import { useStoreSettings } from "../../queries/use-store-settings";

type OrderDetailsScreenProps = {
  orderId?: string;
};

/**
 * One order full screen — opened from the board on narrower tablets and
 * from today's history. The same focus view as the board's side panel, so an
 * order reads and acts the same wherever it is opened.
 */
export function OrderDetailsScreen({ orderId }: OrderDetailsScreenProps) {
  const router = useRouter();
  const gutter = usePageGutter();
  const { profile } = useAuth();
  const storeSettings = useStoreSettings();
  const actions = useOrderActions();
  const now = useNow();
  const timezone = effectiveTimezone(resolveStoreTimezone(storeSettings.data ?? null));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/(preparation)"));

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View className="min-h-0 flex-1 gap-4 py-5" style={{ paddingHorizontal: gutter }}>
        <Button variant="tonal" onPress={back}>
          <Icon as={ArrowLeft} size={18} />
          <Text>Back</Text>
        </Button>
        <View className="min-h-0 w-full max-w-3xl flex-1 self-center rounded-3xl border border-border bg-card p-5 md:p-6">
          {typeof orderId === "string" && orderId.length > 0 ? (
            <OrderFocus
              orderId={orderId}
              actorPreparationId={profile?.id ?? ""}
              timezone={timezone}
              now={now}
              actions={actions}
            />
          ) : (
            <EmptyState
              title="Order unavailable"
              description="Go back and open the order from the board or today’s history."
            />
          )}
        </View>
      </View>
    </Screen>
  );
}
