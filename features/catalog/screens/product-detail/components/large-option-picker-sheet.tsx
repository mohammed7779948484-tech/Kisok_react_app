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
import { normalizeCatalogSearchText } from "../../../model/catalog-view";

export type OptionPickerItem = {
  id: string;
  label: string;
  description?: string;
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

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        setSearchQuery("");
      }
    },
    [onOpenChange],
  );

  const filteredItems = useMemo(() => {
    const normalized = normalizeCatalogSearchText(searchQuery);
    if (!normalized) return items;
    return items.filter(
      (item) =>
        normalizeCatalogSearchText(item.label).includes(normalized) ||
        (item.description && normalizeCatalogSearchText(item.description).includes(normalized)),
    );
  }, [items, searchQuery]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
      handleOpenChange(false);
    },
    [onSelect, handleOpenChange],
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  const selectedIndex = useMemo(() => {
    if (!selectedId || searchQuery !== "") return undefined;
    const index = filteredItems.findIndex((item) => item.id === selectedId);
    return index > 0 ? index : undefined;
  }, [filteredItems, selectedId, searchQuery]);

  const renderItem = useCallback(
    ({ item }: { item: OptionPickerItem }) => {
      const isSelected = item.id === selectedId;
      const fullLabel = item.description ? `${item.label}, ${item.description}` : item.label;
      const availabilityText = item.isAvailable ? "Available" : "Currently unavailable";

      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${fullLabel}, ${availabilityText}`}
          accessibilityState={{ selected: isSelected }}
          onPress={() => handleSelect(item.id)}
          className={cn(
            "min-h-touch flex-row items-center justify-between border-b border-border/50 px-5 py-3.5 active:bg-muted/60",
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
            {item.description ? (
              <Text variant="caption" tone="muted" className="pt-0.5">
                {item.description}
              </Text>
            ) : null}
            <Text
              variant="caption"
              tone={item.isAvailable ? "muted" : "destructive"}
              className="pt-1 font-medium"
            >
              {availabilityText}
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
    <AdaptiveSheet open={open} onOpenChange={handleOpenChange}>
      <AdaptiveSheetContent className="flex-1">
        <AdaptiveSheetHeader className="border-b border-border pb-3">
          <View className="flex-row items-center justify-between">
            <AdaptiveSheetTitle>{title}</AdaptiveSheetTitle>
            <AdaptiveSheetClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-touch min-w-[48px]"
                accessibilityLabel="Close picker"
              >
                <Icon as={X} size={20} />
              </Button>
            </AdaptiveSheetClose>
          </View>

          {/* Search bar inside sheet with tablet-compliant 48dp ergonomics and explicit accessible name */}
          <View className="relative pt-2">
            <Input
              accessibilityLabel={`Search ${title.toLowerCase()}`}
              placeholder={`Search ${title.toLowerCase()}...`}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              className="min-h-control pr-12 text-base"
            />
            {searchQuery.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search text"
                onPress={handleClearSearch}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="absolute bottom-1.5 right-1.5 h-12 w-12 items-center justify-center rounded-full active:bg-muted"
              >
                <Icon as={X} size={16} className="text-muted-foreground" />
              </Pressable>
            ) : null}
          </View>
        </AdaptiveSheetHeader>

        {/* Virtualized option list */}
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
              initialScrollIndex={selectedIndex}
              contentContainerStyle={{ paddingBottom: 32 }}
            />
          )}
        </View>
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}
