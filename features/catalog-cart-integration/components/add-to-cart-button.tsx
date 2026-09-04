import { ShoppingCart } from "lucide-react-native";

import { Button, Icon, Text } from "@/components/ui";
import { useCart } from "@/features/cart";

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
 * permanent-disable risk. The label never changes with the disabled state:
 * the affordance's existence and wording stay stable while unavailable
 * variants remain fully inspectable.
 *
 * On press (enabled only): `addItem(buildAddToCartInput(source))` FIRST,
 * then `openQuickCart()` — the order matters, so the sheet that appears
 * already shows the fresh line. One press adds exactly one unit (plan
 * decision 6); quantity control stays in the cart. The handler ALSO guards
 * on the enabled state itself: the store no-ops while locked or
 * un-hydrated, and the mapper deliberately ignores availability, so this
 * guard is the only thing keeping an unavailable variant out of the cart
 * when a press bypasses the disabled control (defense in depth).
 *
 * It must not import the Supabase client (the cart is client-owned local
 * state with no backend) and reaches the cart only through its public index.
 * Design-system composition: the shared `Button` (primary, block width —
 * reads well under the variant list — and the 48dp `h-touch` target), the
 * `ShoppingCart` icon (lucide, as the cart feature uses; decorative, so the
 * text label stays the sole accessible name), and the stable "Add to cart"
 * label, which is also the button's unique accessible name.
 */
export function AddToCartButton({ source }: AddToCartButtonProps) {
  const cart = useCart();
  const { openQuickCart } = useQuickCart();

  // Plan decision 7 (reconciled for F-R1-1): available AND hydrated AND
  // unlocked. `hydrated` here is the provider-mounted session hydration's
  // live store state, so the pre-hydration window disables the press that
  // would otherwise be a silent logged no-op.
  const canAdd = source.variant.isAvailable && cart.hydrated && !cart.locked;

  const handleAdd = () => {
    // Defense in depth: the disabled state already blocks normal presses;
    // this guard keeps an unavailable selection un-addable even if a press
    // bypasses it (the store would otherwise happily add it — it cannot know
    // about catalog availability).
    if (!canAdd) return;

    // Add FIRST, then open: the Quick Cart that appears must already show
    // the fresh line (AC-05).
    cart.addItem(buildAddToCartInput(source));
    openQuickCart();
  };

  return (
    <Button block disabled={!canAdd} onPress={handleAdd}>
      <Icon as={ShoppingCart} size={20} className="text-primary-foreground" />
      <Text>Add to cart</Text>
    </Button>
  );
}
