import { useState } from "react";
import { View } from "react-native";
import { ShoppingCart } from "lucide-react-native";

import { Button, Icon, StatusMessage, Text } from "@/design-system";
import { getCartSnapshot, QuantityStepper, useCart } from "@/features/cart";

import { buildAddToCartInput, type CatalogCartSource } from "../model/add-to-cart-mapping";
import { useQuickCart } from "./quick-cart-context";

export type AddToCartButtonProps = {
  /**
   * The structural selection Product Detail derives from its own resolved
   * product/variant view — the boundary-legal contract between the features
   * (plan decision 2). Catalog owns the shapes; this component owns the
   * translation into the cart's `AddToCartInput`.
   */
  source: CatalogCartSource;
  /**
   * Show a quantity stepper beside the action ("Add 2 to cart"). The stepper
   * uses the cart's own line bounds — the only limit the client can state
   * truthfully today. When the catalog contract carries an authoritative
   * sellable quantity, it becomes this stepper's `max` (net of what is
   * already in the cart); until then no stock figure is shown or implied.
   */
  withQuantity?: boolean;
  /** `inverse` draws the action for an evergreen panel. */
  tone?: "default" | "inverse";
};

/**
 * The integration's Add-to-cart action (plan decisions 2/6/7; brief AC-02,
 * AC-03, AC-05).
 *
 * Rendered by the CATALOG-owned Product Detail screen — inside the
 * `CatalogCartProvider` tree, so the T02 context and the session-wide
 * `useCart()` hydration are already in place. The button is the ONLY thing
 * on the screen that talks to the cart: it maps the structural source
 * through the T01 pure mapper, calls the cart's public `addItem`, and opens
 * the Quick Cart through the integration context. Product Detail itself
 * never imports `@/features/cart`.
 *
 * Disabled honestly — as an accessibility state, never as ignored taps or a
 * colour change (plan decision 7, reconciled for F-R1-1) — when the selected
 * variant is unavailable, the cart is locked, OR the cart is not yet
 * hydrated: that last window is real (the durable read is async; a press in
 * it would be a logged no-op), and disabling is safe because `hydrate()`
 * terminates with `hydrated: true` on every path — there is no
 * permanent-disable risk.
 *
 * On press (enabled only): `addItem(buildAddToCartInput(source, quantity))`
 * FIRST, then `openQuickCart()` — the order matters, so the sheet that
 * appears already shows the fresh line. Without `withQuantity` one press adds
 * exactly one unit (plan decision 6) and the label is the stable "Add to
 * cart". The handler ALSO guards on the enabled state itself: the store
 * no-ops while locked or un-hydrated, and the mapper deliberately ignores
 * availability, so this guard is the only thing keeping an unavailable
 * variant out of the cart when a press bypasses the disabled control
 * (defense in depth).
 *
 * It must not import the Supabase client (the cart is client-owned local
 * state with no backend) and reaches the cart only through its public index.
 */
export function AddToCartButton({
  source,
  withQuantity = false,
  tone = "default",
}: AddToCartButtonProps) {
  const cart = useCart();
  const { openQuickCart } = useQuickCart();
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Units of this variant already in the cart, across every line that holds it.
  const inCart = cart.lines.reduce(
    (total, line) => (line.variantId === source.variant.id ? total + line.quantity : total),
    0,
  );
  const stock = source.variant.availableQuantity;
  // What can still be added: the snapshot's stock net of the cart. Unknown
  // stock (an older snapshot) leaves only the cart's own line bound.
  const remaining = stock === undefined ? undefined : Math.max(0, stock - inCart);
  const stockExhausted = remaining === 0;

  // Plan decision 7 (reconciled for F-R1-1): available AND hydrated AND
  // unlocked — and, when stock is known, something left to add. `hydrated` is
  // the provider-mounted session hydration's live store state, so the
  // pre-hydration window disables the press that would otherwise be a silent
  // logged no-op.
  const canAdd = source.variant.isAvailable && cart.hydrated && !cart.locked && !stockExhausted;
  const selected = remaining === undefined ? quantity : Math.min(quantity, Math.max(1, remaining));
  const requested = withQuantity ? selected : 1;

  const handleAdd = () => {
    // Defense in depth: the disabled state already blocks normal presses;
    // this guard keeps an unavailable selection un-addable even if a press
    // bypasses it (the store would otherwise happily add it — it cannot know
    // about catalog availability or stock).
    if (!canAdd) return;

    // Add FIRST, then open: the Quick Cart that appears must already show
    // the fresh line (AC-05).
    const before = getCartSnapshot();
    if (!before.hydrated || before.locked) return;
    const previousQuantities = new Map(before.lines.map((line) => [line.lineId, line.quantity]));
    cart.addItem(buildAddToCartInput(source, requested));
    const added = getCartSnapshot().lines.find(
      (line) => previousQuantities.get(line.lineId) !== line.quantity,
    );

    if (withQuantity) {
      // What actually changed, not what was asked for: the cart clamps each
      // line to its own bound, and the message must say so when it does.
      const delta = added ? added.quantity - (previousQuantities.get(added.lineId) ?? 0) : 0;
      setFeedback(
        delta === 0
          ? "This option is already at the cart's limit."
          : delta < requested
            ? `Added ${delta} — this option has reached the cart's limit.`
            : `Added ${delta} to your cart.`,
      );
      setQuantity(1);
    }
    openQuickCart(added?.lineId);
  };

  if (!withQuantity) {
    return (
      <Button
        size="large"
        block
        variant={tone === "inverse" ? "inverse" : "primary"}
        disabled={!canAdd}
        onPress={handleAdd}
        testID="catalog-add-to-cart"
      >
        <Icon
          as={ShoppingCart}
          size={20}
          className={tone === "inverse" ? "text-primary" : "text-primary-foreground"}
        />
        <Text>Add to cart</Text>
      </Button>
    );
  }

  const inverse = tone === "inverse";
  const stockLine =
    stock === undefined || inCart === 0
      ? null
      : stockExhausted
        ? `All ${stock} available ${stock === 1 ? "is" : "are"} already in your cart.`
        : `${inCart} in your cart · ${remaining} more can be added.`;

  return (
    <View className="gap-2">
      <View className="flex-row gap-2.5">
        <QuantityStepper
          value={selected}
          // The stepper never offers more than can still be added.
          max={remaining === undefined ? undefined : Math.max(1, remaining)}
          reserved={inCart}
          onValueChange={(next) => {
            setQuantity(next);
            setFeedback(null);
          }}
          disabled={!canAdd}
          tone={inverse ? "inverse" : "default"}
          className="w-[136px]"
        />
        <Button
          variant={inverse ? "inverse" : "primary"}
          disabled={!canAdd}
          onPress={handleAdd}
          testID="catalog-add-to-cart"
          className="flex-1 rounded-md"
        >
          <Icon
            as={ShoppingCart}
            size={18}
            className={inverse ? "text-primary" : "text-primary-foreground"}
          />
          <Text>{`Add ${selected} to cart`}</Text>
        </Button>
      </View>
      <StatusMessage
        message={feedback ?? stockLine}
        tone={feedback === null && stockExhausted ? "warning" : "success"}
        inverse={inverse}
      />
    </View>
  );
}
