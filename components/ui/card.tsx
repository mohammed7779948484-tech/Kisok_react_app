import { View, type ViewProps } from "react-native";

import { cn } from "@/core/utils";

import { Text } from "./text";

/**
 * Surface container. Elevation policy: KISOK uses a border plus a flat surface
 * colour rather than shadows — shadows render inconsistently across Android and
 * react-native-web and add noise on a dense catalog grid.
 */
export function Card({ className, ...props }: ViewProps) {
  return <View className={cn("rounded-xl border border-border bg-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: ViewProps) {
  return <View className={cn("gap-1.5 p-4", className)} {...props} />;
}

export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Text variant="h3" className={cn("text-card-foreground", className)}>
      {children}
    </Text>
  );
}

export function CardDescription({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Text variant="caption" className={className}>
      {children}
    </Text>
  );
}

export function CardContent({ className, ...props }: ViewProps) {
  return <View className={cn("p-4 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ViewProps) {
  return <View className={cn("flex-row items-center gap-3 p-4 pt-0", className)} {...props} />;
}
