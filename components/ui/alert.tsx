import { cva, type VariantProps } from "class-variance-authority";
import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react-native";
import { View } from "react-native";

import { cn } from "@/core/utils";

import { Icon } from "./icon";
import { Text } from "./text";

const alertVariants = cva("w-full flex-row gap-3 rounded-md border p-4 md:p-5", {
  variants: {
    variant: {
      info: "border-primary/25 bg-primary/10",
      success: "border-success/30 bg-success/10",
      warning: "border-warning/35 bg-warning/10",
      destructive: "border-destructive/30 bg-destructive/10",
    },
  },
  defaultVariants: { variant: "info" },
});

const alertIcon: Record<NonNullable<VariantProps<typeof alertVariants>["variant"]>, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  destructive: CircleAlert,
};

const alertTone = {
  info: "text-primary",
  success: "text-success",
  warning: "text-warning-text",
  destructive: "text-destructive",
} as const;

type AlertContentProps =
  | { title: string; description?: string; children?: React.ReactNode }
  | { title?: string; description?: string; children: React.ReactNode };

export type AlertProps = Omit<React.ComponentProps<typeof View>, "children"> &
  VariantProps<typeof alertVariants> & {
    icon?: LucideIcon;
  } & AlertContentProps;

export function Alert({
  className,
  variant = "info",
  title,
  description,
  icon,
  children,
  ...props
}: AlertProps) {
  const resolvedVariant = variant ?? "info";
  const AlertIcon = icon ?? alertIcon[resolvedVariant];
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={cn(alertVariants({ variant: resolvedVariant }), className)}
      {...props}
    >
      <Icon
        as={AlertIcon}
        size={22}
        className={cn("mt-0.5 shrink-0", alertTone[resolvedVariant])}
      />
      <View className="min-w-0 flex-1 gap-1">
        {title ? <AlertTitle>{title}</AlertTitle> : null}
        {description ? <AlertDescription>{description}</AlertDescription> : null}
        {children}
      </View>
    </View>
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text variant="label" className={className} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text variant="caption" tone="muted" className={className} {...props} />;
}

export { alertVariants };
