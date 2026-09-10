import { ScrollView, View } from "react-native";

import { Text, ToggleGroup, ToggleGroupItem } from "@/components/ui";
import { cn } from "@/core/utils";

export type CategoryBrandFilterOption = {
  /** The brand this option selects. */
  brandId: string;
  /** The brand's display name. */
  name: string;
};

export type CategoryBrandFilterProps = {
  options: readonly CategoryBrandFilterOption[];
  selectedBrandId: string | null;
  onSelectBrand: (brandId: string | null) => void;
  className?: string;
};

export function CategoryBrandFilter({
  options,
  selectedBrandId,
  onSelectBrand,
  className,
}: CategoryBrandFilterProps) {
  const currentValue = selectedBrandId ?? "all";

  const handleValueChange = (value: string | undefined) => {
    if (!value || value === "all") {
      onSelectBrand(null);
    } else {
      onSelectBrand(value);
    }
  };

  if (options.length === 0) {
    return null;
  }

  return (
    <View className={cn("gap-2", className)}>
      <Text variant="caption" tone="muted" className="font-semibold">
        Filter by brand:
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 pr-4"
      >
        <ToggleGroup
          type="single"
          layout="content"
          value={currentValue}
          onValueChange={handleValueChange}
          accessibilityLabel="Filter products by brand"
          className="flex-row flex-nowrap"
        >
          <ToggleGroupItem
            value="all"
            accessibilityLabel="All Brands"
            className="h-touch px-4 py-2"
          >
            <Text variant="caption" className="font-medium">
              All Brands
            </Text>
          </ToggleGroupItem>

          {options.map((option) => (
            <ToggleGroupItem
              key={option.brandId}
              value={option.brandId}
              accessibilityLabel={option.name}
              className="h-touch px-4 py-2"
            >
              <Text variant="caption" className="font-medium">
                {option.name}
              </Text>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </ScrollView>
    </View>
  );
}
