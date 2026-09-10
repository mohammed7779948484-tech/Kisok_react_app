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
  resolveVariantByOptionValues,
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

  // 1. Single variant: no options to choose, show clean specification summary
  if (strategy.type === "single") {
    return (
      <View className={cn("gap-2 border-t border-border/60 pt-4", className)}>
        <Text variant="caption" tone="muted" className="font-semibold uppercase tracking-wider">
          Specification
        </Text>
        <Text variant="body" className="font-semibold text-foreground">
          {formatVariantSummary(selectedVariant)}
        </Text>
      </View>
    );
  }

  // 2. High cardinality clean single dimension (7+ values): searchable tablet picker sheet
  if (
    (strategy.type === "clean-single-dimension-picker" ||
      strategy.type === "single-dimension-picker") &&
    strategy.primaryDimension
  ) {
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
      const matchResult = resolveVariantByOptionValues(variants, { [dim.typeId]: valueId });
      if (matchResult.type === "resolved") {
        onSelectVariant(matchResult.variant.id);
      }
    };

    return (
      <View className={cn("gap-3 border-t border-border/60 pt-5", className)}>
        <View className="flex-row items-center justify-between">
          <Text variant="label" tone="primary">
            {dim.typeName}
          </Text>
          <Text variant="caption" tone="muted">
            {dim.values.length} choices available
          </Text>
        </View>

        {/* Selected flavor/option summary card */}
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
            className="shrink-0 gap-1.5"
            accessibilityLabel={`Change ${dim.typeName}`}
          >
            <Text>Change</Text>
            <Icon as={ChevronRight} size={16} />
          </Button>
        </Card>

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

  // 3. Low cardinality clean single dimension (2-6 values): inline toggle group
  if (
    (strategy.type === "clean-single-dimension-inline" ||
      strategy.type === "single-dimension-inline") &&
    strategy.primaryDimension
  ) {
    const dim = strategy.primaryDimension;
    const currentSelectedValueId =
      selectedVariant.options.find((opt) => opt.type.id === dim.typeId)?.value.id ?? "";

    const handleValueChange = (valueId: string | undefined) => {
      if (!valueId) return;
      const matchResult = resolveVariantByOptionValues(variants, { [dim.typeId]: valueId });
      if (matchResult.type === "resolved") {
        onSelectVariant(matchResult.variant.id);
      }
    };

    return (
      <View className={cn("gap-3 border-t border-border/60 pt-5", className)}>
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
              accessibilityLabel={`${val.value}, ${val.isAvailable ? "Available" : "Currently unavailable"}`}
            >
              <Text>{val.value}</Text>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </View>
    );
  }

  // 4. Clean multi-dimension matrix: progressive selector with strict compatibility guarantees
  if (
    (strategy.type === "clean-multi-dimension" || strategy.type === "multi-dimension") &&
    strategy.dimensions
  ) {
    const currentSelections: Record<string, string> = {};
    for (const opt of selectedVariant.options) {
      currentSelections[opt.type.id] = opt.value.id;
    }

    return (
      <View className={cn("gap-5 border-t border-border/60 pt-5", className)}>
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

            const matchResult = resolveVariantByOptionValues(variants, updated);
            if (matchResult.type === "resolved") {
              onSelectVariant(matchResult.variant.id);
            }
            // If unresolved or ambiguous, do NOT silently mutate unrelated dimensions!
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
                      accessibilityLabel={`${val.value}, ${isValidCombo ? "Compatible" : "Not available with current selection"}`}
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

  // 5. Large concrete set (5+ variants without clean taxonomy): searchable concrete variant picker
  if (strategy.type === "large-concrete-picker" || variants.length > 4) {
    const pickerItems: OptionPickerItem[] = variants.map((v) => {
      const summary = formatVariantSummary(v);
      return {
        id: v.id,
        label: v.label,
        description: summary !== v.label ? summary : undefined,
        isAvailable: v.is_available,
      };
    });

    const selectedSummary = formatVariantSummary(selectedVariant);

    return (
      <View className={cn("gap-3 border-t border-border/60 pt-5", className)}>
        <View className="flex-row items-center justify-between">
          <Text variant="label" tone="primary">
            Option Selection
          </Text>
          <Text variant="caption" tone="muted">
            {variants.length} options available
          </Text>
        </View>

        <Card className="flex-row items-center justify-between gap-4 border-border/80 bg-card p-4">
          <View className="flex-1 gap-1">
            <Text variant="caption" tone="muted">
              Selected Option
            </Text>
            <Text variant="h3" className="font-bold text-foreground">
              {selectedVariant.label}
            </Text>
            {selectedSummary !== selectedVariant.label ? (
              <Text variant="caption" tone="muted">
                {selectedSummary}
              </Text>
            ) : null}
            <View className="pt-1">
              <AvailabilityBadge isAvailable={selectedVariant.is_available} type="variant" />
            </View>
          </View>

          <Button
            variant="outline"
            onPress={() => setPickerOpen(true)}
            className="shrink-0 gap-1.5"
            accessibilityLabel="Change option"
          >
            <Text>Change</Text>
            <Icon as={ChevronRight} size={16} />
          </Button>
        </Card>

        <LargeOptionPickerSheet
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="Choose option"
          items={pickerItems}
          selectedId={selectedVariantId}
          onSelect={onSelectVariant}
        />
      </View>
    );
  }

  // 6. Small concrete set (2-4 variants): rich inline radio cards
  return (
    <View className={cn("gap-4 border-t border-border/60 pt-5", className)}>
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
