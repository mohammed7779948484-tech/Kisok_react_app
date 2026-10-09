import { Pressable } from "react-native";

import { Text } from "@/design-system";
import { cn } from "@/core/utils";

import { productCountLabel } from "../../../model/labels";
import type { GuidedChoice } from "../../../model/guided-discovery";

/** A large answer tile: what it is, and how many products it leads to. */
export function ChoiceTile({
  choice,
  onPress,
  selected = false,
}: {
  choice: GuidedChoice;
  onPress: (choice: GuidedChoice) => void;
  selected?: boolean;
}) {
  const count = productCountLabel(choice.productCount);
  return (
    <Pressable
      testID={`help-me-choose-choice-${choice.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${choice.label}, ${count}`}
      accessibilityState={{ selected }}
      onPress={() => onPress(choice)}
      className={cn(
        "min-h-touch grow basis-[168px] justify-center gap-1 rounded-xl border px-5 py-4 active:bg-muted",
        selected ? "border-primary bg-secondary" : "border-border bg-card",
      )}
    >
      <Text className="font-sans-bold text-title">{choice.label}</Text>
      <Text variant="meta" tone="muted">
        {count}
      </Text>
    </Pressable>
  );
}
