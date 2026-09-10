import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";
import { cn } from "@/core/utils";

/**
 * Persistent banner while the device has no connection.
 *
 * Reads TanStack Query's `onlineManager`, which `QueryProvider` already wires to
 * NetInfo — one source of truth for "are we online", so the banner and query
 * retry behaviour can never disagree.
 */
export function OfflineNotice({
  className,
  respectTopInset = false,
}: {
  className?: string;
  /** Use when mounted above a route stack rather than inside a Screen safe area. */
  respectTopInset?: boolean;
}) {
  const [online, setOnline] = useState(() => onlineManager.isOnline());
  const insets = useSafeAreaInsets();

  useEffect(() => onlineManager.subscribe(setOnline), []);

  if (online) return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={cn("w-full border-b border-warning/30 bg-warning/15 px-4 py-3", className)}
      style={respectTopInset ? { paddingTop: insets.top + 8 } : undefined}
    >
      <Text variant="label" tone="warning" className="text-center">
        No connection. Some actions are unavailable.
      </Text>
    </View>
  );
}
