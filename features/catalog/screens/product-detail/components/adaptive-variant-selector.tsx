import { useMemo, useState } from "react";
import { View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import {
  Button,
  Card,
  Icon,
  RadioGroup,
  RadioGroupItem,
  Text,
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui";
import { cn } from "@/core/utils";

import {
  deriveVariantSelectionStrategy,
  formatVariantAvailability,
  formatVariantSummary,
  getValidOptionValuesForDimension,
} from "../../../model/variant-selection";
import type { CatalogVariantView } from "../../../model/catalog-view";
import { AvailabilityBadge } from "../../../components/availability-badge";
import { LargeOptionPickerSheet, type OptionPickerItem } from "./large-option-picker-sheet";

export type AdaptiveVariantSelectorProps = {
  variants: readonly CatalogVariantView[];
  selectedVariantId: string;
  onSelectVariant: (variantId: string) => void;
  className?: string;
};

export function AdaptiveVariantSelector({
  variants,
  selectedVariantId,
  onSelectVariant,
  className,
}: AdaptiveVariantSelectorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedVariant = useMemo(() => {
    return variants.find((candidate) => candidate.id === selectedVariantId) ?? variants[0];
  }, [variants, selectedVariantId]);

  const strategy = useMemo(() => {
    return deriveVariantSelectionStrategy(variants);
  }, [variants]);

  if (!selectedVariant) {
    return null;
  }

  if (strategy.type === "single") {
    // Single variant: no options to select, show concise confirmation
    return (
      <View className={cn("gap-2 border-t border-border/80 pt-4", className)}>
        <Text variant="caption" tone="muted" className="font-medium uppercase tracking-wider">
          Specification
        </Text>
        <Text variant="body" className="font-semibold text-foreground">
          {formatVariantSummary(selectedVariant)}
        </Text>
      </View>
    );
  }

  if (strategy.type === "single-dimension-picker" && strategy.primaryDimension) {
    const dim = strategy.primaryDimension;
    const selectedOptionValue =
      selectedVariant.options.find((opt) => opt.type.id === dim.typeId)?.value.value ??
      formatVariantSummary(selectedVariant);

    const pickerItems: OptionPickerItem[] = dim.values.map((v) => ({
      id: v.valueId,
      label: v.value,
      isAvailable: v.isAvailable,
    }));

    const currentSelectedValueId =
      selectedVariant.options.find((opt) => opt.type.id === dim.typeId)?.value.id ?? "";

    const handleSelectOptionValueId = (valueId: string) => {
      // Find matching concrete variant
      const matched = variants.find((v) =>
        v.options.some((o) => o.type.id === dim.typeId && o.value.id === valueId),
      );
      if (matched) {
        onSelectVariant(matched.id);
      }
    };

    return (
      <View className={cn("gap-3 border-t border-border/80 pt-5", className)}>
        <View className="flex-row items-center justify-between">
          <Text variant="label" tone="primary">
            {dim.typeName}
          </Text>
          <Text variant="caption" tone="muted">
            {dim.values.length} choices available
          </Text>
        </View>

        {/* Selected flavor summary card */}
        <Card className="flex-row items-center justify-between gap-4 border-border/80 bg-card p-4">
          <View className="flex-1 gap-1">
            <Text variant="caption" tone="muted">
              Selected {dim.typeName}
            </Text>
            <Text variant="h3" className="font-bold text-foreground">
              {selectedOptionValue}
            </Text>
            <View className="pt-1">
              <AvailabilityBadge isAvailable={selectedVariant.is_available} type="variant" />
            </View>
          </View>

          <Button
            variant="outline"
            onPress={() => setPickerOpen(true)}
            className="shrink-0"
            accessibilityLabel={`Change ${dim.typeName}`}
          >
            <Text>Change</Text>
            <Icon as={ChevronRight} size={16} />
          </Button>
        </Card>

        {/* Large Option Searchable Picker Sheet */}
        <LargeOptionPickerSheet
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title={`Choose ${dim.typeName}`}
          items={pickerItems}
          selectedId={currentSelectedValueId}
          onSelect={handleSelectOptionValueId}
        />
      </View>
    );
  }

  if (strategy.type === "single-dimension-inline" && strategy.primaryDimension) {
    const dim = strategy.primaryDimension;
    const currentSelectedValueId =
      selectedVariant.options.find((opt) => opt.type.id === dim.typeId)?.value.id ?? "";

    const handleValueChange = (valueId: string | undefined) => {
      if (!valueId) return;
      const matched = variants.find((v) =>
        v.options.some((o) => o.type.id === dim.typeId && o.value.id === valueId),
      );
      if (matched) {
        onSelectVariant(matched.id);
      }
    };

    return (
      <View className={cn("gap-3 border-t border-border/80 pt-5", className)}>
        <Text variant="label" tone="primary">
          Choose {dim.typeName}
        </Text>

        <ToggleGroup
          type="single"
          layout="content"
          value={currentSelectedValueId}
          onValueChange={handleValueChange}
          accessibilityLabel={`Select ${dim.typeName}`}
        >
          {dim.values.map((val) => (
            <ToggleGroupItem
              key={val.valueId}
              value={val.valueId}
              className={cn("px-4 py-2.5", !val.isAvailable && "opacity-60")}
              accessibilityLabel={`${val.value}, ${val.isAvailable ? "Available" : "Unavailable"}`}
            >
              <Text>{val.value}</Text>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </View>
    );
  }

  if (strategy.type === "multi-dimension" && strategy.dimensions) {
    // Current selections mapping: typeId -> valueId
    const currentSelections: Record<string, string> = {};
    for (const opt of selectedVariant.options) {
      currentSelections[opt.type.id] = opt.value.id;
    }

    return (
      <View className={cn("gap-5 border-t border-border/80 pt-5", className)}>
        {strategy.dimensions.map((dim) => {
          const selectedValueId = currentSelections[dim.typeId] ?? "";
          const validOptionIds = getValidOptionValuesForDimension(
            variants,
            dim.typeId,
            currentSelections,
          );

          const handleDimensionChange = (newValueId: string | undefined) => {
            if (!newValueId) return;
            const updated = { ...currentSelections, [dim.typeId]: newValueId };

            // Find best matching concrete variant
            let matched = variants.find((v) => {
              for (const [tId, vId] of Object.entries(updated)) {
                if (!v.options.some((o) => o.type.id === tId && o.value.id === vId)) {
                  return false;
                }
              }
              return true;
            });

            // If exact match not found, find variant matching the newly clicked dimension
            if (!matched) {
              matched = variants.find((v) =>
                v.options.some((o) => o.type.id === dim.typeId && o.value.id === newValueId),
              );
            }

            if (matched) {
              onSelectVariant(matched.id);
            }
          };

          return (
            <View key={dim.typeId} className="gap-2.5">
              <Text variant="label" tone="primary">
                {dim.typeName}
              </Text>
              <ToggleGroup
                type="single"
                layout="content"
                value={selectedValueId}
                onValueChange={handleDimensionChange}
                accessibilityLabel={`Select ${dim.typeName}`}
              >
                {dim.values.map((val) => {
                  const isValidCombo = validOptionIds.has(val.valueId);
                  return (
                    <ToggleGroupItem
                      key={val.valueId}
                      value={val.valueId}
                      disabled={!isValidCombo}
                      className={cn("px-4 py-2", !isValidCombo && "opacity-30")}
                      accessibilityLabel={`${val.value}, ${isValidCombo ? "Available" : "Not available with current selection"}`}
                    >
                      <Text>{val.value}</Text>
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </View>
          );
        })}
      </View>
    );
  }

  // Small set (<=4) or direct concrete choice fallback:
  return (
    <View className={cn("gap-4 border-t border-border/80 pt-5", className)}>
      <View className="gap-1">
        <Text variant="label" tone="primary">
          Options
        </Text>
        <Text variant="h3" accessibilityRole="header" className="font-bold">
          Choose an option
        </Text>
      </View>

      <RadioGroup value={selectedVariantId} onValueChange={onSelectVariant} className="gap-2.5">
        {variants.map((variant) => {
          const isSelected = variant.id === selectedVariantId;
          const availability = formatVariantAvailability(variant);
          const summary = formatVariantSummary(variant);

          return (
            <RadioGroupItem
              key={variant.id}
              value={variant.id}
              accessibilityLabel={`${variant.label}, ${availability.label}`}
              className={cn(
                "rounded-xl border p-4 transition-all active:scale-[0.99]",
                isSelected ? "border-primary bg-primary/5" : "border-border/80 bg-card",
              )}
            >
              <View className="flex-1 gap-1.5">
                <Text variant="body" className={cn("font-semibold", isSelected && "text-primary")}>
                  {variant.label}
                </Text>
                {summary !== variant.label ? (
                  <Text variant="caption" tone="muted">
                    {summary}
                  </Text>
                ) : null}
                <View className="pt-0.5">
                  <AvailabilityBadge isAvailable={variant.is_available} type="variant" />
                </View>
              </View>
            </RadioGroupItem>
          );
        })}
      </RadioGroup>
    </View>
  );
}
