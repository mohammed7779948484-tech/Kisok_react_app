import { useState } from "react";
import { Pressable, View } from "react-native";

import { Checkbox, Separator, Text } from "@/design-system";
import { cn } from "@/core/utils";

import {
  activeFilterCount,
  EMPTY_FILTERS,
  toggleId,
  type BrowseFacets,
  type BrowseFilters,
  type FacetOption,
} from "../model/browse-filters";

/** Long facet lists show this many before "Show all". */
const FACET_PREVIEW = 6;

export type BrowseFilterRailProps = {
  facets: BrowseFacets;
  filters: BrowseFilters;
  onChange: (next: BrowseFilters) => void;
  /** Hide a facet that the page has already fixed (a brand page has one brand). */
  showCategories?: boolean;
  showBrands?: boolean;
  /** Render the "Refine / Filters" header. Off when a container pins it itself. */
  header?: boolean;
  className?: string;
};

/**
 * The refine panel. Every option and count comes from the products in scope;
 * each row is one 48dp target that toggles its checkbox.
 */
export function BrowseFilterRail({
  facets,
  filters,
  onChange,
  showCategories = true,
  showBrands = true,
  header = true,
  className,
}: BrowseFilterRailProps) {
  return (
    <View className={cn("gap-5", className)}>
      {header ? (
        <>
          <FilterRailHeader filters={filters} onChange={onChange} />
          <Separator />
        </>
      ) : null}
      <FacetGroup title="Availability">
        <CheckboxRow
          label="Available options"
          count={facets.availableCount}
          checked={filters.availableOnly}
          onToggle={() => onChange({ ...filters, availableOnly: !filters.availableOnly })}
        />
      </FacetGroup>

      {showCategories && facets.categories.length > 1 ? (
        <>
          <Separator />
          <FacetList
            title="Category"
            options={facets.categories}
            selected={filters.categoryIds}
            onToggle={(id) =>
              onChange({ ...filters, categoryIds: toggleId(filters.categoryIds, id) })
            }
          />
        </>
      ) : null}

      {showBrands && facets.brands.length > 1 ? (
        <>
          <Separator />
          <FacetList
            title="Brand"
            options={facets.brands}
            selected={filters.brandIds}
            onToggle={(id) => onChange({ ...filters, brandIds: toggleId(filters.brandIds, id) })}
          />
        </>
      ) : null}
    </View>
  );
}

/** "Refine / Filters", the applied count, and Reset once anything is applied. */
export function FilterRailHeader({
  filters,
  onChange,
}: {
  filters: BrowseFilters;
  onChange: (next: BrowseFilters) => void;
}) {
  const count = activeFilterCount(filters);
  return (
    <View className="flex-row items-end justify-between">
      <View className="gap-1">
        <Text className="font-sans-extrabold text-eyebrow uppercase tracking-[1.4px] text-muted-foreground">
          Refine
        </Text>
        <View className="flex-row items-center gap-2">
          <Text className="font-display text-title-lg">Filters</Text>
          {count > 0 ? (
            <View
              accessible
              accessibilityLabel={`${count} applied`}
              className="min-w-[22px] items-center rounded-full bg-primary px-1.5 py-0.5"
            >
              <Text className="font-sans-extrabold text-caption text-primary-foreground">
                {count}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {count > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset all filters"
          onPress={() => onChange(EMPTY_FILTERS)}
          className="min-h-touch justify-center px-2 active:opacity-70"
        >
          <Text className="font-sans-bold text-meta text-primary">Reset</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View accessibilityRole="none" className="gap-1">
      <Text accessibilityRole="header" className="mb-1 font-sans-bold text-body-lg">
        {title}
      </Text>
      {children}
    </View>
  );
}

function FacetList({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hidden = options.length - FACET_PREVIEW;
  // A selected option is never hidden behind "Show all".
  const visible =
    expanded || hidden <= 0
      ? options
      : options.filter((option, index) => index < FACET_PREVIEW || selected.includes(option.id));

  return (
    <FacetGroup title={title}>
      {visible.map((option) => (
        <CheckboxRow
          key={option.id}
          label={option.label}
          count={option.count}
          checked={selected.includes(option.id)}
          onToggle={() => onToggle(option.id)}
        />
      ))}
      {hidden > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((current) => !current)}
          className="min-h-touch justify-center active:opacity-70"
        >
          <Text className="font-sans-bold text-meta text-primary">
            {expanded ? "Show fewer" : `Show all ${options.length}`}
          </Text>
        </Pressable>
      ) : null}
    </FacetGroup>
  );
}

export function CheckboxRow({
  label,
  count,
  checked,
  onToggle,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      onPress={onToggle}
      className="min-h-touch flex-row items-center gap-3.5 rounded-md active:bg-muted/60"
    >
      <Checkbox checked={checked} onCheckedChange={onToggle} aria-hidden />
      <Text numberOfLines={2} className="min-w-0 flex-1 text-body text-foreground/85">
        {label}
      </Text>
      {count !== undefined ? (
        <Text className="text-caption tabular-nums text-muted-foreground">{count}</Text>
      ) : null}
    </Pressable>
  );
}
