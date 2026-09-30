import { Pressable, ScrollView } from "react-native";

import { Text } from "@/design-system";
import { cn } from "@/core/utils";

export type CategoryShortcut = { id: string; label: string };

/**
 * One-tap scopes across the top of a browse page: "All products" and each
 * root category that has products. Selecting one replaces the category
 * filter rather than adding to it.
 */
export function CategoryShortcutStrip({
  shortcuts,
  selectedId,
  onSelect,
  allLabel = "All products",
}: {
  shortcuts: CategoryShortcut[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  allLabel?: string;
}) {
  if (shortcuts.length < 2) return null;
  const items: { id: string | null; label: string }[] = [
    { id: null, label: allLabel },
    ...shortcuts,
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      contentContainerClassName="items-center gap-1"
    >
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <Pressable
            key={item.id ?? "all"}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(item.id)}
            className={cn(
              "h-touch justify-center rounded-full px-4",
              selected ? "bg-primary" : "active:bg-muted",
            )}
          >
            <Text
              className={cn(
                "font-sans-semibold text-body",
                selected ? "text-primary-foreground" : "text-foreground/75",
              )}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
