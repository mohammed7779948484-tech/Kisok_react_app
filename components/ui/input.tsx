import { TextInput, View, type TextInputProps } from "react-native";

import { cn } from "@/core/utils";

import { Text } from "./text";

export type InputProps = TextInputProps & {
  className?: string;
  label?: string;
  /** Rendered below the field in destructive tone and announced to screen readers. */
  errorMessage?: string;
  hint?: string;
};

/**
 * Text field with a built-in label/error slot so features do not each invent
 * their own arrangement. Always pass `label` (or an `accessibilityLabel`) —
 * a placeholder alone is not an accessible name.
 */
export function Input({
  className,
  label,
  errorMessage,
  hint,
  editable = true,
  ...props
}: InputProps) {
  const invalid = Boolean(errorMessage);

  return (
    <View className="w-full gap-1.5">
      {label ? <Text variant="label">{label}</Text> : null}
      <TextInput
        editable={editable}
        accessibilityLabel={props.accessibilityLabel ?? label}
        className={cn(
          "h-touch rounded-lg border bg-background px-4 text-base text-foreground",
          "placeholder:text-muted-foreground",
          invalid ? "border-destructive" : "border-input",
          !editable && "opacity-50",
          className,
        )}
        {...props}
      />
      {errorMessage ? (
        <Text variant="caption" tone="destructive" accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      ) : hint ? (
        <Text variant="caption">{hint}</Text>
      ) : null}
    </View>
  );
}
