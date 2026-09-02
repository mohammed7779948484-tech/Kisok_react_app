import { ShoppingCart } from "lucide-react-native";
import { ScrollView } from "react-native";

import { EmptyState } from "@/components/feedback";
import {
  AdaptiveSheet,
  AdaptiveSheetClose,
  AdaptiveSheetContent,
  AdaptiveSheetFooter,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
  Alert,
  Button,
  Text,
} from "@/components/ui";

import { selectTotalQuantity, useCartStore } from "../state/cart-store";
import { CartItemRow } from "./cart-item-row";

/**
 * The cart's quick surface — the feature's STATEFUL public adaptive sheet
 * (plan decision 12). Unlike the row and the stepper, this component
 * deliberately reads the single cart store (`useCartStore`) and mutates it
 * through the store's own actions, so the sheet can never drift from the one
 * cart model. ESLint boundaries permit store reads in feature components;
 * only `app/**` routes are barred from Zustand.
 *
 * The shared `AdaptiveSheet` primitive owns the adaptivity — expanded
 * (landscape) → side panel, compact/portrait → bottom sheet — plus focus
 * handling and the dialog accessibility role; this component never branches
 * on layout itself. `open`/`onOpenChange` is the controlled-open contract:
 * the caller (the future customer shell, post "Add to cart") owns when the
 * sheet appears, and closing reports `onOpenChange(false)` through the
 * primitive's close. `onViewFullCart` is the caller's routing intent —
 * absent means the footer renders no View Full Cart button — and this
 * component never imports a router: the caller owns navigation.
 *
 * Persistence honesty (AC-06, plan decision 14): `memoryOnly` → warning
 * Alert; `clearFailed` → destructive Alert — a safety issue is never
 * undersold as a memory-only nuisance. While locked (AC-09), the rows'
 * controls render disabled (user mutations are no-ops at the store level
 * anyway); the navigation intents stay enabled, because the lock blocks
 * cart edits, not movement.
 *
 * Scope: the cart feature's quick-cart surface, INTENDED for the feature's
 * public index (the public-API task wires that export; until then the sheet
 * is reachable only inside the feature). It must not import the Supabase
 * client or the catalog — the cart is client-owned local state with no
 * backend. Use design-system components and semantic token classes — never a
 * raw hex colour or an inline dimension that should be a token.
 */
export type QuickCartSheetProps = {
  /** Controlled: the caller owns when the sheet is open. */
  open: boolean;
  /** Reports every open-state change, including the sheet's own close. */
  onOpenChange: (open: boolean) => void;
  /**
   * View Full Cart intent, owned by the caller. When absent, the footer
   * renders no View Full Cart button.
   */
  onViewFullCart?: () => void;
  /** Forwarded to the sheet's content surface (the visible panel). */
  className?: string;
};

export function QuickCartSheet({
  open,
  onOpenChange,
  onViewFullCart,
  className,
}: QuickCartSheetProps) {
  // The single cart model: subscriptions are per-slice, and totals come from
  // the T04 module-level selector — never a mirrored or recomputed duplicate.
  const lines = useCartStore((state) => state.lines);
  const persistence = useCartStore((state) => state.persistence);
  const locked = useCartStore((state) => state.locked);
  const totalQuantity = useCartStore(selectTotalQuantity);

  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange}>
      <AdaptiveSheetContent className={className}>
        <AdaptiveSheetHeader>
          <AdaptiveSheetTitle>{`Your Cart · ${totalQuantity}`}</AdaptiveSheetTitle>
        </AdaptiveSheetHeader>

        {persistence === "memoryOnly" ? (
          <Alert
            variant="warning"
            title="Saved in memory only"
            description="We couldn't save your cart to this tablet, so it may be lost if the app closes."
            className="mx-5 mb-3"
          />
        ) : null}

        {persistence === "clearFailed" ? (
          <Alert
            variant="destructive"
            title="Couldn't clear the saved cart"
            description="A previous cart may still be stored on this tablet. Please let store staff know."
            className="mx-5 mb-3"
          />
        ) : null}

        {lines.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Your cart is empty"
            description="Items you add while browsing will appear here."
          />
        ) : (
          // No virtualization: the cart is bounded at 100 lines by the
          // create_order contract, so plain ScrollView mounts every row.
          <ScrollView className="flex-1" contentContainerClassName="gap-4 px-5 py-3">
            {lines.map((line) => (
              <CartItemRow
                key={line.lineId}
                line={line}
                locked={locked}
                onSetQuantity={(next) => useCartStore.getState().setLineQuantity(line.lineId, next)}
                onRemove={() => useCartStore.getState().removeLine(line.lineId)}
              />
            ))}
          </ScrollView>
        )}

        <AdaptiveSheetFooter>
          <AdaptiveSheetClose asChild>
            <Button variant="outline" block>
              <Text>Continue Shopping</Text>
            </Button>
          </AdaptiveSheetClose>
          {onViewFullCart ? (
            <Button block onPress={onViewFullCart}>
              <Text>View Full Cart</Text>
            </Button>
          ) : null}
        </AdaptiveSheetFooter>
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}
