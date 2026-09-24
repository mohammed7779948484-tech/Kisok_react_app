import { View } from "react-native";

import { cn } from "@/core/utils";

import { Text, TextClassContext } from "./text";

type ViewComponentProps = React.ComponentProps<typeof View>;

export function Card({ className, ...props }: ViewComponentProps) {
  return (
    <TextClassContext.Provider value="text-card-foreground">
      <View className={cn("rounded-lg border border-border bg-card", className)} {...props} />
    </TextClassContext.Provider>
  );
}

export function CardHeader({ className, ...props }: ViewComponentProps) {
  return <View className={cn("flex-col gap-2 p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text variant="h3" className={cn("text-card-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text variant="caption" tone="muted" className={className} {...props} />;
}

export function CardContent({ className, ...props }: ViewComponentProps) {
  return <View className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ViewComponentProps) {
  return (
    <View className={cn("flex-row flex-wrap items-center gap-3 p-5 pt-0", className)} {...props} />
  );
}
