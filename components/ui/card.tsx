import { View, type ViewProps } from "react-native";

import { cn } from "@/core/utils";

import { Text } from "./text";

/**
 * Surface container. Elevation policy: KISOK uses a border plus a flat surface
 * colour rather than shadows. Tonal separation stays crisp on bright store
 * tablets and avoids noisy elevation in dense operational views.
 */
export function Card({ className, ...props }: ViewProps) {
  return <View className={cn("rounded-lg border border-border bg-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: ViewProps) {
  return <View className={cn("gap-2 p-5", className)} {...props} />;
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
  return <View className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ViewProps) {
  return (
    <View className={cn("flex-row flex-wrap items-center gap-3 p-5 pt-0", className)} {...props} />
  );
}
