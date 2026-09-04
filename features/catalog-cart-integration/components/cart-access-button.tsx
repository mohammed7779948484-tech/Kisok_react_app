import { ShoppingCart } from "lucide-react-native";

import { Badge, Button, Icon, Text } from "@/components/ui";
import { useCart } from "@/features/cart";

import { useQuickCart } from "./quick-cart-context";

/**
 * The persistent cart affordance (plan decision 5; brief AC-06).
 *
 * Self-contained inside the `CatalogCartProvider` tree — no props, because the
 * provider both supplies everything this consumes and decides where (and
 * whether) it appears: it renders the affordance on every customer browsing
 * surface and removes it exactly on `/cart`, so this component carries no
 * pathname knowledge, no positioning of its own, and no screen wiring.
 *
 * Two consumers, both through public surfaces:
 * - `useCart()` — the cart feature's public hook — supplies `totalQuantity`
 *   straight from the single cart model's own selector. The badge is never a
 *   mirrored count: a second truth would drift.
 * - `useQuickCart()` — the integration's own context — supplies the ONE
 *   intent: `openQuickCart()`. A press is browsing movement, never a cart
 *   mutation; what the customer may change is the open sheet's own contract
 *   (its rows disable while the cart is locked).
 *
 * Accessible name — the one deliberate approach, pinned by test: the label
 * carries the live count ("Open cart" when empty, "Open cart, 5 items" with a
 * badge), so assistive technology announces the whole state in one stop and
 * the count is never carried by colour or position alone. The icon is
 * decorative (aria-hidden via the `Icon` primitive) and the badge's text is
 * the same number the label already announced.
 *
 * Design-system composition: the shared `Button` with `size="icon"` (the 48dp
 * `h-touch w-touch` target), the `ShoppingCart` lucide icon (the same icon
 * the cart feature's own surfaces use), and the shared `Badge` (primary
 * variant) carrying the count as TEXT whenever it is > 0 — no badge at 0,
 * where the button alone already signals the honest empty case. The badge
 * hangs off the button's top-end corner (negative inset on the `relative`
 * target), so the touch target stays the button's full 48×48 and the count
 * stays legible against the page, not squeezed inside the square.
 *
 * It must not fetch, must not import the Supabase client (the cart is
 * client-owned local state with no backend), and reaches the cart only
 * through its public index. Semantic token classes only — never a raw hex
 * colour or an inline dimension that should be a token.
 */
export function CartAccessButton() {
  const { totalQuantity } = useCart();
  const { openQuickCart } = useQuickCart();

  // The deliberate naming approach: the count rides the label, so the affordance's
  // name is its whole state in one announcement.
  const label = `Open cart${totalQuantity > 0 ? `, ${totalQuantity} items` : ""}`;

  return (
    <Button size="icon" className="relative" accessibilityLabel={label} onPress={openQuickCart}>
      <Icon as={ShoppingCart} size={24} className="text-primary-foreground" />
      {totalQuantity > 0 ? (
        <Badge variant="primary" className="absolute -right-2 -top-2">
          <Text>{totalQuantity}</Text>
        </Badge>
      ) : null}
    </Button>
  );
}
