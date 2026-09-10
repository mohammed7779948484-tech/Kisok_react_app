import { createContext, useContext, useId } from "react";
import { Platform, TextInput, View, type TextInputProps } from "react-native";

import { cn } from "@/core/utils";

import { Label } from "./label";
import { Text } from "./text";

export type InputProps = TextInputProps & {
  className?: string;
  label?: string;
  errorMessage?: string;
  hint?: string;
};

type FormFieldContextValue = {
  inputId: string;
  labelId: string;
  messageId?: string;
  invalid: boolean;
};

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

function InputControl({
  className,
  editable = true,
  invalid = false,
  ...props
}: TextInputProps & { invalid?: boolean }) {
  const field = useContext(FormFieldContext);
  const resolvedInvalid = invalid || field?.invalid || false;
  return (
    <TextInput
      editable={editable}
      nativeID={props.nativeID ?? field?.inputId}
      aria-labelledby={field?.labelId}
      aria-describedby={field?.messageId}
      aria-invalid={resolvedInvalid || undefined}
      className={cn(
        "h-control w-full rounded-md border border-input bg-card px-4 text-lg leading-6 text-foreground",
        "placeholder:text-muted-foreground/70",
        Platform.select({
          web: "outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
        }),
        resolvedInvalid && "border-destructive",
        !editable && "opacity-45",
        className,
      )}
      {...props}
    />
  );
}

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
  const field = {
    inputId,
    labelId: `${inputId}-label`,
    messageId: errorMessage || hint ? `${inputId}-message` : undefined,
    invalid: Boolean(errorMessage),
  };

  return (
    <FormFieldContext.Provider value={field}>
      <View className={cn("w-full gap-2", className)}>
        {label ? (
          <Label nativeID={field.labelId} htmlFor={field.inputId}>
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

export { InputControl };
