import { View } from "react-native";

import { Eyebrow } from "../patterns/section-heading";
import { Separator } from "../primitives/separator";
import { Text } from "../primitives/text";

/** A titled block of the lab. Lab-only scaffolding, not a production pattern. */
export function LabSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-5">
      <View className="gap-2">
        <Eyebrow rule>{eyebrow}</Eyebrow>
        <Text variant="h1" accessibilityRole="header" aria-level={2}>
          {title}
        </Text>
      </View>
      <Separator />
      <View className="gap-6">{children}</View>
    </View>
  );
}

export function LabCaption({ children }: { children: string }) {
  return (
    <Text className="font-sans-bold text-eyebrow uppercase tracking-[1.2px] text-muted-foreground">
      {children}
    </Text>
  );
}
