import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Text,
} from "@/design-system";
import { cn } from "@/core/utils";

/** Common reasons, one tap each. Optional: the server accepts no reason. */
const REASONS = ["Out of stock", "Customer left", "Duplicate order", "Damaged item"] as const;

export type CancelOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: { display_number: string } | null;
  onCancelOrder: (reason?: string) => void;
  busy?: boolean;
};

/**
 * Cancelling returns the items to stock and cannot be undone, so it always
 * asks first — and offers a quick reason for the day's history.
 */
export function CancelOrderDialog({
  open,
  onOpenChange,
  order,
  onCancelOrder,
  busy = false,
}: CancelOrderDialogProps) {
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (open) setReason(null);
  }, [open]);

  if (!open || !order) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Cancel order ${order.display_number}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            Its items go back to stock. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <View className="gap-2">
          <Text variant="label" tone="muted">
            Reason (optional)
          </Text>
          <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
            {REASONS.map((option) => {
              const chosen = reason === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: chosen, disabled: busy }}
                  disabled={busy}
                  onPress={() => setReason(chosen ? null : option)}
                  className={cn(
                    "min-h-touch justify-center rounded-full border px-4",
                    chosen
                      ? "border-primary bg-secondary"
                      : "border-border bg-card active:bg-muted",
                  )}
                >
                  <Text
                    className={cn(
                      "text-body",
                      chosen ? "font-sans-bold text-primary" : "text-foreground",
                    )}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            <Text>Keep order</Text>
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy}
            onPress={() => onCancelOrder(reason ?? undefined)}
          >
            <Text>{busy ? "Cancelling…" : "Cancel order"}</Text>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
