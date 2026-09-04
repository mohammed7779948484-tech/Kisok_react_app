import { Wrench } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Icon } from "@/components/ui";
import { cn } from "@/core/utils";

export type MaintenanceEntryProps = {
  /** Whether the affordance renders. The overlay decides this — kiosk only. */
  visible: boolean;
  /** A deliberate long press (never a tap) requests the maintenance sheet. */
  onLongPress: () => void;
  className?: string;
};

const ACCESSIBLE_NAME = "Maintenance";
const ACCESSIBLE_HINT = "Press and hold to open store maintenance";

/**
 * The small corner affordance that opens the maintenance sheet (AC-05).
 *
 * Presentational only: the OVERLAY decides whether it exists (customer-kiosk
 * devices only) and what a long press does — this component renders an
 * affordance and reports the gesture upward. It reads no store and holds no
 * state of its own.
 *
 * Deliberately hard to trigger: there is no `onPress` at all, only
 * `onLongPress`, so a customer tapping the corner does nothing. The visible
 * content is a single muted icon; the accessible name says what the control
 * is without advertising it more than the small corner affordance already
 * implies. Touch target is the 48dp Button floor.
 */
export function MaintenanceEntry({ visible, onLongPress, className }: MaintenanceEntryProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      accessibilityLabel={ACCESSIBLE_NAME}
      accessibilityHint={ACCESSIBLE_HINT}
      onLongPress={onLongPress}
      className={cn("absolute right-4", className)}
      style={{ top: insets.top + 8 }}
    >
      <Icon as={Wrench} size={20} className="text-muted-foreground" />
    </Button>
  );
}
