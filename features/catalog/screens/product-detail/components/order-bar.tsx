import { View } from "react-native";
import { ArrowRight, CircleSlash } from "lucide-react-native";

import { Icon, Text } from "@/design-system";

import type { OptionChoice } from "./variant-decision";

/**
 * The one place a selection becomes an order line. Until a choice is made it
 * says what to do; after, it shows what was chosen and hosts the add action
 * (rendered by the catalog–cart integration and passed in as `action`). An
 * unavailable choice is shown, never added.
 */
export function OrderBar({
  prompt,
  selected,
  action,
}: {
  prompt: string;
  selected: OptionChoice | null;
  action: React.ReactNode;
}) {
  if (!selected) {
    return (
      <View className="min-h-[100px] flex-row items-center gap-3.5 bg-primary px-6 py-4">
        <View className="h-[42px] w-[42px] items-center justify-center rounded-full bg-primary-foreground/10">
          <Icon as={ArrowRight} size={16} className="text-primary-foreground" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5" accessibilityLiveRegion="polite">
          <Text className="font-sans-bold text-body-lg text-primary-foreground">{prompt}</Text>
          <Text className="text-caption text-primary-foreground/70">
            Select one of the options above to set quantity.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="min-h-[100px] gap-2.5 bg-primary px-6 pb-4 pt-3">
      <View accessibilityLiveRegion="polite" className="gap-0.5">
        <Text className="font-sans-bold text-eyebrow uppercase tracking-[1.2px] text-primary-foreground/65">
          Selected
        </Text>
        <Text numberOfLines={2} className="font-sans-bold text-title text-primary-foreground">
          {selected.label}
        </Text>
        <Text className="text-caption text-primary-foreground/75">
          {selected.isAvailable
            ? `${selected.availableQuantity} available now`
            : "Currently unavailable"}
        </Text>
        {selected.details ? (
          <Text numberOfLines={1} className="text-caption text-primary-foreground/70">
            {selected.details}
          </Text>
        ) : null}
      </View>
      {selected.isAvailable ? (
        action
      ) : (
        <View className="flex-row items-center gap-2">
          <Icon as={CircleSlash} size={14} className="text-primary-foreground/70" />
          <Text className="text-caption text-primary-foreground/80">
            This option can’t be added right now. Choose another to continue.
          </Text>
        </View>
      )}
    </View>
  );
}
