import * as RadioGroupPrimitive from "@rn-primitives/radio-group";
import { createContext, useContext } from "react";
import { View } from "react-native";

import { cn } from "@/core/utils";

import { TextClassContext } from "./text";

const RadioGroupValueContext = createContext<string | undefined>(undefined);

function RadioGroup({
  className,
  value,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupValueContext.Provider value={value}>
      <RadioGroupPrimitive.Root value={value} className={cn("gap-3", className)} {...props} />
    </RadioGroupValueContext.Provider>
  );
}

type RadioGroupItemProps = Omit<
  React.ComponentProps<typeof RadioGroupPrimitive.Item>,
  "children"
> & { children?: React.ReactNode };

function RadioGroupItem({ className, children, ...props }: RadioGroupItemProps) {
  const selected = useContext(RadioGroupValueContext) === props.value;
  return (
    <TextClassContext.Provider value={selected ? "text-primary-foreground" : "text-foreground"}>
      <RadioGroupPrimitive.Item
        className={cn(
          "min-h-control flex-row items-center gap-4 rounded-md border bg-card p-4 active:scale-[0.99]",
          selected ? "border-primary bg-primary" : "border-border active:bg-secondary/60",
          props.disabled && "opacity-40",
          className,
        )}
        {...props}
      >
        <View
          aria-hidden
          className={cn(
            "h-6 w-6 items-center justify-center rounded-full border-2",
            selected ? "border-primary-foreground" : "border-input",
          )}
        >
          <RadioGroupPrimitive.Indicator className="h-3 w-3 rounded-full bg-primary-foreground" />
        </View>
        {children}
      </RadioGroupPrimitive.Item>
    </TextClassContext.Provider>
  );
}

export { RadioGroup, RadioGroupItem };
