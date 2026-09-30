import { History, LogOut, RefreshCw } from "lucide-react-native";
import { View } from "react-native";

import { Button, Icon, Text } from "@/design-system";
import { cn } from "@/core/utils";

import { STATUS_META } from "../../../components/order-status-badge";
import type { LaneStatus } from "./status-lane";

export type WorkspaceHeaderProps = {
  clock: string;
  counts: Record<LaneStatus, number>;
  mine: number;
  refreshing: boolean;
  compact: boolean;
  signingOut: boolean;
  onRefresh: () => void;
  onHistory: () => void;
  onSignOut: () => void;
};

function Figure({ status, value, label }: { status: LaneStatus; value: number; label: string }) {
  const meta = STATUS_META[status];
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      className="flex-row items-center gap-2.5 rounded-2xl bg-card px-3.5 py-2"
    >
      <View className={cn("h-2.5 w-2.5 rounded-full", meta.accent)} />
      <Text className="font-display-semibold text-title-lg tabular-nums">{value}</Text>
      <Text variant="meta" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/**
 * The compact operational header: who and when (store clock), the shape of
 * the shift in three numbers, and the few tools an employee reaches for.
 */
export function WorkspaceHeader({
  clock,
  counts,
  mine,
  refreshing,
  compact,
  signingOut,
  onRefresh,
  onHistory,
  onSignOut,
}: WorkspaceHeaderProps) {
  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-[14px] bg-primary">
            <View className="h-4 w-4 rotate-45 rounded-[4px] border-2 border-primary-foreground" />
          </View>
          <View>
            <Text variant="h2" accessibilityRole="header">
              Preparation
            </Text>
            <View className="flex-row items-center gap-2">
              <View className="h-2 w-2 rounded-full bg-success" />
              <Text variant="caption" tone="muted">
                {`Live · store time ${clock}`}
              </Text>
            </View>
          </View>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <Button
            variant="tonal"
            size={compact ? "icon" : "compact"}
            accessibilityLabel="Refresh orders"
            disabled={refreshing}
            onPress={onRefresh}
          >
            <Icon as={RefreshCw} size={18} />
            {compact ? null : <Text>{refreshing ? "Refreshing…" : "Refresh"}</Text>}
          </Button>
          <Button
            variant="tonal"
            size={compact ? "icon" : "compact"}
            accessibilityLabel="Today’s history"
            onPress={onHistory}
          >
            <Icon as={History} size={18} />
            {compact ? null : <Text>Today’s history</Text>}
          </Button>
          <Button
            variant="ghost"
            size={compact ? "icon" : "compact"}
            accessibilityLabel="Sign out"
            disabled={signingOut}
            onPress={onSignOut}
          >
            <Icon as={LogOut} size={18} />
            {compact ? null : <Text>{signingOut ? "Signing out…" : "Sign out"}</Text>}
          </Button>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Figure status="new" value={counts.new} label="waiting" />
        <Figure status="preparing" value={counts.preparing} label="in preparation" />
        <Figure status="ready" value={counts.ready} label="ready" />
        {mine > 0 ? (
          <View className="flex-row items-center gap-2 rounded-2xl bg-primary px-3.5 py-2">
            <Text className="font-display-semibold text-title-lg tabular-nums text-primary-foreground">
              {mine}
            </Text>
            <Text className="text-meta text-primary-foreground/80">
              {mine === 1 ? "is yours" : "are yours"}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
