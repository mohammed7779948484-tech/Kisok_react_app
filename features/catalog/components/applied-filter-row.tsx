import { Pressable, ScrollView } from "react-native";
import { X } from "lucide-react-native";

import { Icon, Text } from "@/design-system";

import { EMPTY_FILTERS, type AppliedFilter, type BrowseFilters } from "../model/browse-filters";

/** The applied filters as chips — each removable on its own, or all at once. */
export function AppliedFilterRow({
  applied,
  filters,
  onChange,
}: {
  applied: AppliedFilter[];
  filters: BrowseFilters;
  onChange: (next: BrowseFilters) => void;
}) {
  if (applied.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="items-center gap-2 py-1"
    >
      {applied.map((chip) => (
        <Pressable
          key={chip.key}
          accessibilityRole="button"
          accessibilityLabel={`Remove filter ${chip.label}`}
          onPress={() => onChange(chip.remove(filters))}
          className="h-touch flex-row items-center gap-2 rounded-full border border-primary/25 bg-secondary px-4 active:opacity-80"
        >
          <Text className="font-sans-semibold text-meta text-primary">{chip.label}</Text>
          <Icon as={X} size={14} className="text-primary" />
        </Pressable>
      ))}
      {applied.length > 1 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(EMPTY_FILTERS)}
          className="h-touch justify-center px-3 active:opacity-70"
        >
          <Text className="font-sans-bold text-meta text-primary">Clear all</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
