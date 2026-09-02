import { View } from "react-native";

import { Button, Text } from "@/components/ui";
import { cn } from "@/core/utils";

/**
 * The local brand filter of Category Detail (AC-05).
 *
 * Presentational only: it receives its options, its selected brand id and its
 * callbacks as props and reports interactions upward. It must not fetch, must
 * not read a store, and must not import the Supabase client or a router —
 * the owning screen owns the selection state (Design decision 3: the category
 * brand filter is screen-local React state) and the routing.
 *
 * Options are mutually exclusive, so the chip pattern mirrors
 * `CatalogNavigation`: every option is a 48dp Button whose selected state is
 * announced through `aria-selected` and mirrored visually by the
 * primary/ghost variants (never colour alone — the state is queryable and
 * announced). "All Brands" is the default option, renders first, and pressing
 * it reports `null` — the reset-to-all case, which the screen also offers
 * inline at the no-match state so the reset sits where the customer is looking
 * (AC-05's reset affordance). A category's brand set is small and owner
 * managed, so a wrapping row of buttons is honest here — no virtualization
 * ceremony for a handful of chips (see the kisok-react-native-rules list
 * rules).
 */
export type CategoryBrandFilterOption = {
  /** The brand this option selects. */
  brandId: string;
  /** The brand's display name — the option's visible and accessible name. */
  name: string;
};

export type CategoryBrandFilterProps = {
  /** The selectable brands; the screen derives them from the current snapshot. */
  options: readonly CategoryBrandFilterOption[];
  /**
   * The currently selected brand id, or `null` for the default All Brands.
   * The component never changes it by itself — it is controlled.
   */
  selectedBrandId: string | null;
  /**
   * Reports the pressed option's brand id, or `null` when All Brands (the
   * reset-to-all case) is pressed.
   */
  onSelectBrand: (brandId: string | null) => void;
  className?: string;
};

export function CategoryBrandFilter({
  options,
  selectedBrandId,
  onSelectBrand,
  className,
}: CategoryBrandFilterProps) {
  const isAllBrandsSelected = selectedBrandId === null;

  return (
    <View className={cn("gap-2", className)}>
      <Text variant="body" tone="muted">
        Filter by brand
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant={isAllBrandsSelected ? "primary" : "ghost"}
          accessibilityLabel="All Brands"
          aria-selected={isAllBrandsSelected}
          onPress={() => onSelectBrand(null)}
        >
          <Text>All Brands</Text>
        </Button>
        {options.map((option) => {
          const isSelected = option.brandId === selectedBrandId;

          return (
            <Button
              key={option.brandId}
              variant={isSelected ? "primary" : "ghost"}
              accessibilityLabel={option.name}
              aria-selected={isSelected}
              onPress={() => onSelectBrand(option.brandId)}
            >
              <Text>{option.name}</Text>
            </Button>
          );
        })}
      </View>
    </View>
  );
}
