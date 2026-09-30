import { forwardRef } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { Search, X } from "lucide-react-native";

import { cn } from "@/core/utils";

import { Icon } from "../primitives/icon";
import { Text } from "../primitives/text";

export type SearchInputProps = Omit<TextInputProps, "onChangeText" | "value"> & {
  value: string;
  onChangeText: (next: string) => void;
  /** Shown at the trailing edge — a result count, or a hint such as "Enter". */
  trailing?: string | number;
  /**
   * `field` — a paper pill on the canvas. `inverse` — a translucent field on an
   * evergreen band. `rule` — a hairline-ruled row inside a panel.
   */
  appearance?: "field" | "inverse" | "rule";
  size?: "default" | "large";
  className?: string;
};

/**
 * A search field with a clear control. It filters as the person types; it does
 * not own what is searched or how matches are found.
 */
export const SearchInput = forwardRef<TextInput, SearchInputProps>(function SearchInput(
  {
    value,
    onChangeText,
    trailing,
    appearance = "field",
    size = "default",
    className,
    accessibilityLabel,
    placeholder,
    ...props
  },
  ref,
) {
  const inverse = appearance === "inverse";
  const hasValue = value.length > 0;

  return (
    <View
      className={cn(
        "flex-row items-center gap-3",
        size === "large" ? "h-[56px] px-5" : "h-control px-4",
        appearance === "field" && "rounded-full border border-border bg-card",
        appearance === "inverse" &&
          "rounded-full border border-primary-foreground/15 bg-primary-foreground/10",
        appearance === "rule" && "border-y border-border px-0.5",
        className,
      )}
    >
      <Icon
        as={Search}
        size={size === "large" ? 22 : 18}
        className={inverse ? "text-primary-foreground/80" : "text-primary"}
      />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        className={cn(
          "h-full flex-1 font-sans text-foreground web:outline-none",
          size === "large" ? "text-title" : "text-body",
          inverse
            ? "text-primary-foreground placeholder:text-primary-foreground/60"
            : "placeholder:text-muted-foreground",
        )}
        {...props}
      />
      {hasValue ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText("")}
          className={cn(
            "h-touch w-touch items-center justify-center rounded-full",
            inverse ? "active:bg-primary-foreground/10" : "active:bg-muted",
          )}
        >
          <Icon
            as={X}
            size={16}
            className={inverse ? "text-primary-foreground/80" : "text-muted-foreground"}
          />
        </Pressable>
      ) : null}
      {trailing !== undefined ? (
        <View
          className={cn(
            "min-w-8 items-center rounded-full px-2.5 py-1",
            inverse ? "bg-transparent" : "bg-secondary",
          )}
        >
          <Text
            className={cn(
              "font-sans-extrabold text-caption",
              inverse ? "text-primary-foreground/60" : "text-primary",
            )}
          >
            {trailing}
          </Text>
        </View>
      ) : null}
    </View>
  );
});
