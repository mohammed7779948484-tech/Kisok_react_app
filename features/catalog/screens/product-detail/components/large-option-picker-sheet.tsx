import { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Check, X } from "lucide-react-native";
import { FlashList } from "@shopify/flash-list";

import {
  AdaptiveSheet,
  AdaptiveSheetClose,
  AdaptiveSheetContent,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
} from "@/components/ui/adaptive-sheet";
import { Button, Icon, Input, Text } from "@/components/ui";
import { cn } from "@/core/utils";

export type OptionPickerItem = {
  id: string;
  label: string;
  isAvailable: boolean;
};

export type LargeOptionPickerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: OptionPickerItem[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export function LargeOptionPickerSheet({
  open,
  onOpenChange,
  title,
  items,
  selectedId,
  onSelect,
}: LargeOptionPickerSheetProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return items;
    return items.filter((item) => item.label.toLowerCase().includes(trimmed));
  }, [items, searchQuery]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
      onOpenChange(false);
      setSearchQuery("");
    },
    [onSelect, onOpenChange],
  );

  const renderItem = useCallback(
    ({ item }: { item: OptionPickerItem }) => {
      const isSelected = item.id === selectedId;

      return (
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel={`${item.label}, ${item.isAvailable ? "Available" : "Currently unavailable"}`}
          accessibilityState={{ selected: isSelected }}
          onPress={() => handleSelect(item.id)}
          className={cn(
            "min-h-control flex-row items-center justify-between border-b border-border/50 px-5 py-3.5 active:bg-muted/60",
            isSelected && "bg-muted/40",
          )}
        >
          <View className="flex-1 pr-3">
            <Text
              variant="body"
              className={cn("font-medium", isSelected && "font-bold text-primary")}
            >
              {item.label}
            </Text>
            <Text
              variant="caption"
              tone={item.isAvailable ? "muted" : "destructive"}
              className="pt-0.5"
            >
              {item.isAvailable ? "Available" : "Currently unavailable"}
            </Text>
          </View>

          {isSelected ? (
            <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
              <Icon as={Check} size={14} className="text-primary-foreground" />
            </View>
          ) : null}
        </Pressable>
      );
    },
    [selectedId, handleSelect],
  );

  const keyExtractor = useCallback((item: OptionPickerItem) => item.id, []);

  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange}>
      <AdaptiveSheetContent className="flex-1">
        <AdaptiveSheetHeader className="border-b border-border pb-3">
          <View className="flex-row items-center justify-between">
            <AdaptiveSheetTitle>{title}</AdaptiveSheetTitle>
            <AdaptiveSheetClose asChild>
              <Button variant="ghost" size="icon" accessibilityLabel="Close picker">
                <Icon as={X} size={20} />
              </Button>
            </AdaptiveSheetClose>
          </View>

          {/* Search bar inside sheet */}
          <View className="pt-2">
            <Input
              placeholder={`Search ${title.toLowerCase()}...`}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              className="h-10 text-base"
            />
          </View>
        </AdaptiveSheetHeader>

        {/* Option list */}
        <View className="min-h-[300px] flex-1">
          {filteredItems.length === 0 ? (
            <View className="items-center justify-center p-8">
              <Text variant="body" tone="muted">
                No options match &ldquo;{searchQuery}&rdquo;
              </Text>
            </View>
          ) : (
            <FlashList
              data={filteredItems}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={{ paddingBottom: 32 }}
            />
          )}
        </View>
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}
