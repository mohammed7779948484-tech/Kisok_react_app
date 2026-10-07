import { Pressable, View } from "react-native";
import { X } from "lucide-react-native";

import { Icon, Text } from "@/design-system";
import { cn } from "@/core/utils";

/**
 * One committed answer. The label opens the question again so the answer can
 * be changed (when there is anything to change it to); the ✕ removes it.
 */
export function AnswerChip({
  label,
  onChange,
  onRemove,
  editing = false,
}: {
  label: string;
  /** Omitted when the question has no other choice to offer. */
  onChange?: () => void;
  onRemove: () => void;
  editing?: boolean;
}) {
  return (
    <View
      className={cn(
        "min-h-touch flex-row items-center rounded-full border bg-secondary pl-1",
        editing ? "border-primary" : "border-primary/25",
      )}
    >
      {onChange ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Change ${label}`}
          accessibilityState={{ selected: editing }}
          onPress={onChange}
          className="min-h-touch justify-center rounded-full pl-4 pr-1 active:opacity-70"
        >
          <Text className="font-sans-semibold text-meta text-primary">{label}</Text>
        </Pressable>
      ) : (
        <Text className="pl-4 pr-1 font-sans-semibold text-meta text-primary">{label}</Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${label}`}
        onPress={onRemove}
        className="h-touch w-touch items-center justify-center rounded-full active:bg-primary/10"
      >
        <Icon as={X} size={14} className="text-primary" />
      </Pressable>
    </View>
  );
}
