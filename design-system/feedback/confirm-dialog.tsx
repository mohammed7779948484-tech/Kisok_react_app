import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../composites/alert-dialog";
import { Button } from "../primitives/button";
import { Text } from "../primitives/text";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* AlertDialogCancel already calls the root's onOpenChange(false)
              internally (@rn-primitives/alert-dialog's Cancel) — an explicit
              onPress here would fire it a second time for the same press. */}
          <AlertDialogCancel disabled={busy}>
            <Text>{cancelLabel}</Text>
          </AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "primary"}
            disabled={busy}
            onPress={onConfirm}
          >
            <Text>{busy ? "Working…" : confirmLabel}</Text>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
