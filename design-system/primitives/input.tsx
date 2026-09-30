import { createContext, useContext } from "react";
import { Platform, TextInput, type TextInputProps } from "react-native";

import { cn } from "@/core/utils";

export type FormFieldContextValue = {
  inputId: string;
  labelId?: string;
  messageId?: string;
  invalid: boolean;
};

/**
 * Supplied by `FormField` (composites) so a control inside it is wired to its
 * label and message without the caller passing ids around.
 */
export const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/** The bare text field. Use `Input` or `FormField` when it needs a label. */
export function InputControl({
  className,
  editable = true,
  invalid = false,
  ...props
}: TextInputProps & { invalid?: boolean; className?: string }) {
  const field = useContext(FormFieldContext);
  const resolvedInvalid = invalid || field?.invalid || false;
  return (
    <TextInput
      editable={editable}
      nativeID={props.nativeID ?? field?.inputId}
      aria-labelledby={props["aria-labelledby"] ?? field?.labelId}
      aria-describedby={field?.messageId}
      aria-invalid={resolvedInvalid || undefined}
      className={cn(
        "h-control w-full rounded-md border border-input bg-card px-4 font-sans text-body-lg text-foreground",
        "placeholder:text-muted-foreground",
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
