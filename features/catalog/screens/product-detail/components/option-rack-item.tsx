import { memo } from "react";
import { Pressable, View } from "react-native";
import { ArrowRight, Check, X } from "lucide-react-native";

import { AppImage, cloudinaryImageUrl, Icon, Text } from "@/design-system";
import { cn } from "@/core/utils";

import type { OptionChoice } from "./variant-decision";

/**
 * One choice in the Option Rack: its picture, its name, what else
 * distinguishes it, and its state. The picture is the point — customers pick
 * a flavour by its packaging — so it is large and fills its square. An
 * unavailable choice stays selectable so it can be inspected; the Order Bar is
 * what refuses to add it.
 */
export const OptionRackItem = memo(function OptionRackItem({
  choice,
  selected,
  onSelect,
  compact,
  lowStockThreshold,
}: {
  choice: OptionChoice;
  selected: boolean;
  onSelect: (id: string) => void;
  /** Variation choices carry two lines of details. */
  compact: boolean;
  /** The store's low-stock threshold; at or below it the choice says how few are left. */
  lowStockThreshold: number;
}) {
  const unavailable = !choice.isAvailable;
  const markIcon = selected ? Check : unavailable ? X : ArrowRight;
  const lowStock = !unavailable && choice.availableQuantity <= lowStockThreshold;
  const thumbUri = cloudinaryImageUrl(choice.thumb, "row");

  return (
    <Pressable
      testID={`catalog-option-${unavailable ? "unavailable" : "available"}-${choice.id}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${choice.label}${choice.details ? `, ${choice.details}` : ""}${unavailable ? ", currently unavailable" : lowStock ? `, only ${choice.availableQuantity} left` : ""}`}
      onPress={() => onSelect(choice.id)}
      className={cn(
        "flex-1 flex-row items-center gap-3 rounded-lg border p-2 pr-2.5",
        compact ? "min-h-[92px]" : "min-h-[88px]",
        selected
          ? "border-primary/45 bg-secondary"
          : unavailable
            ? "border-border bg-muted/70"
            : "border-border bg-card active:bg-card/70",
      )}
    >
      <View
        className={cn(
          "h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-md border p-1",
          selected ? "border-primary/40" : "border-border",
          thumbUri ? "bg-card" : "bg-secondary/70",
          unavailable && "opacity-55",
        )}
      >
        {thumbUri ? (
          <AppImage
            uri={thumbUri}
            alt=""
            contentFit="contain"
            fallbackLabel={choice.initials}
            className="h-full w-full"
          />
        ) : (
          <Text className="font-display-semibold text-title-lg text-primary/55">
            {choice.initials}
          </Text>
        )}
      </View>

      <View className={cn("min-w-0 flex-1 gap-1", unavailable && "opacity-75")}>
        <Text numberOfLines={3} className="font-sans-bold text-body leading-[19px] text-foreground">
          {choice.label}
        </Text>
        {choice.details ? (
          <Text
            numberOfLines={compact ? 2 : 1}
            className="text-caption leading-[15px] text-muted-foreground"
          >
            {choice.details}
          </Text>
        ) : null}
        {unavailable ? (
          <Text className="font-sans-extrabold text-eyebrow uppercase tracking-[0.8px] text-unavailable">
            Unavailable
          </Text>
        ) : lowStock ? (
          <Text className="font-sans-bold text-caption text-warning-text">
            {`Only ${choice.availableQuantity} left`}
          </Text>
        ) : null}
      </View>

      <View
        aria-hidden
        className={cn(
          "h-[22px] w-[22px] items-center justify-center rounded-full",
          selected && (unavailable ? "bg-muted-foreground" : "bg-primary"),
        )}
      >
        <Icon
          as={markIcon}
          size={13}
          strokeWidth={selected ? 3 : 2}
          className={selected ? "text-primary-foreground" : "text-primary"}
        />
      </View>
    </Pressable>
  );
});
