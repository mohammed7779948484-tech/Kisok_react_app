import { View } from "react-native";

import { Text } from "@/design-system";
import { cn } from "@/core/utils";

import type { OrderStatus } from "../model/store-day";
import { STATUS_META } from "./order-status-badge";

const FLOW = ["new", "preparing", "ready", "completed"] as const;

/**
 * Where the order is in its life: New → Preparing → Ready → Completed. A
 * cancelled order shows where it stopped. Words carry the state; the rail
 * only reinforces it.
 */
export function OrderTimeline({ status }: { status: OrderStatus }) {
  const cancelled = status === "cancelled";
  const reached = cancelled ? -1 : FLOW.indexOf(status);

  return (
    <View
      accessible
      accessibilityLabel={`Order status: ${STATUS_META[status].label}`}
      className="flex-row items-center"
    >
      {FLOW.map((step, index) => {
        const done = index <= reached;
        const current = index === reached;
        return (
          <View key={step} className="flex-1 gap-2">
            <View className="flex-row items-center">
              <View
                className={cn(
                  "h-3 w-3 rounded-full",
                  done ? STATUS_META[step].accent : "border border-border bg-card",
                  current && "h-4 w-4",
                )}
              />
              {index < FLOW.length - 1 ? (
                <View
                  className={cn("h-0.5 flex-1", index < reached ? "bg-primary/60" : "bg-border")}
                />
              ) : null}
            </View>
            <Text
              className={cn(
                "text-caption",
                current ? "font-sans-bold text-foreground" : "text-muted-foreground",
              )}
            >
              {STATUS_META[step].label}
            </Text>
          </View>
        );
      })}
      {cancelled ? (
        <View className="ml-3 rounded-full bg-destructive/10 px-3 py-1">
          <Text className="font-sans-bold text-caption text-destructive">Cancelled</Text>
        </View>
      ) : null}
    </View>
  );
}
