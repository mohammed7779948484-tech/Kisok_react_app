import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SlidersHorizontal } from "lucide-react-native";

import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetFooter,
  AdaptiveSheetTitle,
  Button,
  Icon,
  Text,
} from "@/design-system";

import { activeFilterCount, type BrowseFacets, type BrowseFilters } from "../model/browse-filters";
import { BrowseFilterRail } from "./browse-filter-rail";

/**
 * The filter rail for layouts too narrow to hold it: a "Filters" button that
 * opens the same rail in an adaptive sheet. Changes apply as they are made,
 * so the result count behind the sheet is always current.
 */
export function CompactRefine({
  facets,
  filters,
  onChange,
  resultCount,
  showCategories,
  showBrands,
}: {
  facets: BrowseFacets;
  filters: BrowseFilters;
  onChange: (next: BrowseFilters) => void;
  resultCount: number;
  showCategories?: boolean;
  showBrands?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={count > 0 ? `Filters, ${count} applied` : "Filters"}
        onPress={() => setOpen(true)}
        className="h-touch flex-row items-center gap-2 rounded-full border border-border bg-card px-4 active:bg-muted"
      >
        <Icon as={SlidersHorizontal} size={16} className="text-primary" />
        <Text className="font-sans-bold text-meta text-foreground">Filters</Text>
        {count > 0 ? (
          <View className="min-w-5 items-center rounded-full bg-primary px-1.5">
            <Text className="font-sans-extrabold text-caption text-primary-foreground">
              {count}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <AdaptiveSheet open={open} onOpenChange={setOpen}>
        <AdaptiveSheetContent>
          <AdaptiveSheetTitle className="sr-only">Filters</AdaptiveSheetTitle>
          <ScrollView contentContainerClassName="px-6 pb-4 pt-4 md:px-8">
            <BrowseFilterRail
              facets={facets}
              filters={filters}
              onChange={onChange}
              showCategories={showCategories}
              showBrands={showBrands}
            />
          </ScrollView>
          <AdaptiveSheetFooter>
            <Button block onPress={() => setOpen(false)}>
              <Text>{resultCount === 1 ? "Show 1 product" : `Show ${resultCount} products`}</Text>
            </Button>
          </AdaptiveSheetFooter>
        </AdaptiveSheetContent>
      </AdaptiveSheet>
    </>
  );
}
