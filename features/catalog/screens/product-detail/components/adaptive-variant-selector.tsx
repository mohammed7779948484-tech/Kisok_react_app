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
  formatVariantDetails,
  formatVariantSummary,
  resolveContextualOptionState,
  resolveVariantByOptionValues,
  type OptionDimension,
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
  const [activeDimensionPicker, setActiveDimensionPicker] = useState<OptionDimension | null>(null);

  const selectedVariant = useMemo(() => {
    return (
      variants.find((candidate) => candidate.id === selectedVariantId) ??
      variants.find((v) => v.is_available) ??
      variants[0]
    );
  }, [variants, selectedVariantId]);

  const strategy = useMemo(() => {
    return deriveVariantSelectionStrategy(variants);
  }, [variants]);

  if (!selectedVariant) {
    return null;
  }

  // Fixed dimensions rendered as calm specification metadata
  const fixedDimensionsHeader =
    strategy.fixedDimensions && strategy.fixedDimensions.length > 0 ? (
      <View className="flex-row flex-wrap gap-x-6 gap-y-2 pb-2">
        {strategy.fixedDimensions.map((fixed) => (
          <View key={fixed.typeId} className="gap-0.5">
            <Text variant="caption" tone="muted" className="font-semibold uppercase tracking-wider">
              {fixed.typeName}
            </Text>
            <Text variant="body" className="font-semibold text-foreground">
              {fixed.value}
            </Text>
          </View>
        ))}
      </View>
    ) : null;

  // 1. Single variant: show specification summary
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

  // 2. Clean single dimension with high cardinality (7+ values): searchable tablet picker sheet
  if (strategy.type === "clean-single-dimension-picker" && strategy.primaryDimension) {
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
        {fixedDimensionsHeader}

        <View className="flex-row items-center justify-between">
          <Text variant="label" tone="primary">
            {dim.typeName}
          </Text>
          <Text variant="caption" tone="muted">
            {dim.values.length} choices
          </Text>
        </View>

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
            className="min-h-touch shrink-0 gap-1.5"
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

  // 3. Clean single dimension with low cardinality (2-6 values): inline toggle group
  if (strategy.type === "clean-single-dimension-inline" && strategy.primaryDimension) {
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
        {fixedDimensionsHeader}

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
              className="h-touch min-h-touch flex-col items-center justify-center px-4 py-2"
              accessibilityLabel={`${val.value}, ${val.isAvailable ? "Available" : "Currently unavailable"}`}
            >
              <Text className="font-semibold">{val.value}</Text>
              {!val.isAvailable ? (
                <Text
                  variant="caption"
                  tone="destructive"
                  className="text-[11px] font-medium leading-none"
                >
                  Unavailable
                </Text>
              ) : null}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </View>
    );
  }

  // 4. Clean multi-dimension matrix: progressive selector with per-dimension adaptivity
  if (strategy.type === "clean-multi-dimension" && strategy.dimensions) {
    const currentSelections: Record<string, string> = {};
    for (const opt of selectedVariant.options) {
      currentSelections[opt.type.id] = opt.value.id;
    }

    return (
      <View className={cn("gap-5 border-t border-border/60 pt-5", className)}>
        {fixedDimensionsHeader}

        {strategy.dimensions.map((dim) => {
          const selectedValueId = currentSelections[dim.typeId] ?? "";

          const handleDimensionChange = (newValueId: string | undefined) => {
            if (!newValueId) return;
            const updated = { ...currentSelections, [dim.typeId]: newValueId };

            const matchResult = resolveVariantByOptionValues(variants, updated);
            if (matchResult.type === "resolved") {
              onSelectVariant(matchResult.variant.id);
            }
          };

          // Per-dimension adaptivity: 7+ values opens searchable sheet
          if (dim.values.length > 6) {
            const selectedVal = dim.values.find((v) => v.valueId === selectedValueId);

            return (
              <View key={dim.typeId} className="gap-2.5">
                <Text variant="label" tone="primary">
                  {dim.typeName}
                </Text>

                <Card className="flex-row items-center justify-between gap-4 border-border/80 bg-card p-3.5">
                  <View className="flex-1 gap-0.5">
                    <Text variant="caption" tone="muted">
                      Selected {dim.typeName}
                    </Text>
                    <Text variant="body" className="font-bold text-foreground">
                      {selectedVal?.value ?? "Choose an option"}
                    </Text>
                  </View>

                  <Button
                    variant="outline"
                    onPress={() => setActiveDimensionPicker(dim)}
                    className="min-h-touch shrink-0 gap-1.5"
                    accessibilityLabel={`Change ${dim.typeName}`}
                  >
                    <Text>Change</Text>
                    <Icon as={ChevronRight} size={16} />
                  </Button>
                </Card>
              </View>
            );
          }

          // Inline toggle group for <= 6 values with contextual availability & compatibility
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
                  const contextual = resolveContextualOptionState(
                    variants,
                    dim.typeId,
                    val.valueId,
                    currentSelections,
                  );
                  const isCompatible = contextual.isCompatible;
                  const isAvailable = contextual.isAvailable;

                  let a11yStatus = "Available";
                  if (!isCompatible) {
                    a11yStatus = "Not available with current selection";
                  } else if (!isAvailable) {
                    a11yStatus = "Currently unavailable";
                  }

                  return (
                    <ToggleGroupItem
                      key={val.valueId}
                      value={val.valueId}
                      disabled={!isCompatible}
                      className={cn(
                        "h-touch min-h-touch flex-col items-center justify-center px-4 py-2",
                        !isCompatible && "opacity-30",
                      )}
                      accessibilityLabel={`${val.value}, ${a11yStatus}`}
                    >
                      <Text className="font-semibold">{val.value}</Text>
                      {isCompatible && !isAvailable ? (
                        <Text
                          variant="caption"
                          tone="destructive"
                          className="text-[11px] font-medium leading-none"
                        >
                          Unavailable
                        </Text>
                      ) : null}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </View>
          );
        })}

        {/* Dynamic dimension picker sheet if a large dimension is opened */}
        {activeDimensionPicker ? (
          <LargeOptionPickerSheet
            open={Boolean(activeDimensionPicker)}
            onOpenChange={(open) => {
              if (!open) setActiveDimensionPicker(null);
            }}
            title={`Choose ${activeDimensionPicker.typeName}`}
            items={activeDimensionPicker.values.map((v) => {
              const contextual = resolveContextualOptionState(
                variants,
                activeDimensionPicker.typeId,
                v.valueId,
                currentSelections,
              );
              return {
                id: v.valueId,
                label: v.value,
                isAvailable: contextual.isAvailable,
                disabled: !contextual.isCompatible,
                description: !contextual.isCompatible
                  ? "Not available with current selection"
                  : !contextual.isAvailable
                    ? "Currently unavailable"
                    : undefined,
              };
            })}
            selectedId={currentSelections[activeDimensionPicker.typeId] ?? ""}
            onSelect={(valId) => {
              const updated = { ...currentSelections, [activeDimensionPicker.typeId]: valId };
              const matchResult = resolveVariantByOptionValues(variants, updated);
              if (matchResult.type === "resolved") {
                onSelectVariant(matchResult.variant.id);
              }
              setActiveDimensionPicker(null);
            }}
          />
        ) : null}
      </View>
    );
  }

  // 5. Large concrete set (5+ variants without clean taxonomy or sparse matrix): searchable picker
  if (strategy.type === "large-concrete-picker" || variants.length > 4) {
    const pickerItems: OptionPickerItem[] = variants.map((v) => {
      const details = formatVariantDetails(v);
      return {
        id: v.id,
        label: v.label,
        description: details ?? undefined,
        isAvailable: v.is_available,
      };
    });

    const selectedDetails = formatVariantDetails(selectedVariant);

    return (
      <View className={cn("gap-3 border-t border-border/60 pt-5", className)}>
        {fixedDimensionsHeader}

        <View className="flex-row items-center justify-between">
          <Text variant="label" tone="primary">
            Option Selection
          </Text>
          <Text variant="caption" tone="muted">
            {variants.length} options
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
            {selectedDetails ? (
              <Text variant="caption" tone="muted">
                {selectedDetails}
              </Text>
            ) : null}
            <View className="pt-1">
              <AvailabilityBadge isAvailable={selectedVariant.is_available} type="variant" />
            </View>
          </View>

          <Button
            variant="outline"
            onPress={() => setPickerOpen(true)}
            className="min-h-touch shrink-0 gap-1.5"
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
      {fixedDimensionsHeader}

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
          const details = formatVariantDetails(variant);

          return (
            <RadioGroupItem
              key={variant.id}
              value={variant.id}
              role="button"
              accessibilityRole="button"
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
                {details ? (
                  <Text variant="caption" tone="muted">
                    {details}
                  </Text>
                ) : null}
                <View className="pt-0.5" aria-hidden>
                  <AvailabilityBadge
                    isAvailable={variant.is_available}
                    type="variant"
                    aria-hidden={true}
                  />
                </View>
              </View>
            </RadioGroupItem>
          );
        })}
      </RadioGroup>
    </View>
  );
}
