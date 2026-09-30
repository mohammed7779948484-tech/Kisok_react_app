import { useId } from "react";
import { View, type TextInputProps } from "react-native";

import { cn } from "@/core/utils";

import { FormFieldContext, InputControl } from "../primitives/input";
import { Label } from "../primitives/label";
import { Text } from "../primitives/text";

/**
 * A labelled control with an optional hint or error message. The control
 * inside picks up its label and message ids from context.
 */
export function FormField({
  label,
  hint,
  errorMessage,
  children,
  className,
  id,
}: {
  label?: string;
  hint?: string;
  errorMessage?: string;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? `field-${generatedId}`;
  const labelId = label ? `${inputId}-label` : undefined;
  const field = {
    inputId,
    labelId,
    messageId: errorMessage || hint ? `${inputId}-message` : undefined,
    invalid: Boolean(errorMessage),
  };

  return (
    <FormFieldContext.Provider value={field}>
      <View className={cn("w-full gap-2", className)}>
        {label && labelId ? (
          <Label nativeID={labelId} htmlFor={field.inputId}>
            {label}
          </Label>
        ) : null}
        {children}
        {errorMessage ? (
          <Text
            nativeID={field.messageId}
            variant="caption"
            tone="destructive"
            accessibilityLiveRegion="polite"
          >
            {errorMessage}
          </Text>
        ) : hint ? (
          <Text nativeID={field.messageId} variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
    </FormFieldContext.Provider>
  );
}

export type InputProps = TextInputProps & {
  className?: string;
  label?: string;
  errorMessage?: string;
  hint?: string;
};

/** A text field with its label and message — the common case of `FormField`. */
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
    <FormField id={props.nativeID} label={label} hint={hint} errorMessage={errorMessage}>
      <InputControl
        editable={editable}
        accessibilityLabel={props.accessibilityLabel ?? label}
        invalid={invalid}
        className={className}
        {...props}
      />
    </FormField>
  );
}
