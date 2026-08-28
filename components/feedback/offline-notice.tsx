import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { cn } from "@/core/utils";

/**
 * Persistent banner while the device has no connection.
 *
 * Reads TanStack Query's `onlineManager`, which `QueryProvider` already wires to
 * NetInfo — one source of truth for "are we online", so the banner and query
 * retry behaviour can never disagree.
 */
export function OfflineNotice({ className }: { className?: string }) {
  const [online, setOnline] = useState(() => onlineManager.isOnline());

  useEffect(() => onlineManager.subscribe(setOnline), []);

  if (online) return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={cn("w-full bg-warning px-4 py-2", className)}
    >
      <Text variant="label" className="text-center text-warning-foreground">
        No connection. Some actions are unavailable.
      </Text>
    </View>
  );
}
