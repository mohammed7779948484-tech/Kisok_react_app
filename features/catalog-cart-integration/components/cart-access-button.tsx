import { ShoppingCart } from "lucide-react-native";

import { Badge, Button, Icon, Text } from "@/components/ui";
import { useCart } from "@/features/cart";
import { useQuickCart } from "./quick-cart-context";

/** Placement-free browsing action. The integration provider owns route visibility and layout. */
export function CartAccessButton() {
  const { totalQuantity } = useCart();
  const { openQuickCart } = useQuickCart();
  const label = `Open cart${totalQuantity > 0 ? `, ${totalQuantity} items` : ""}`;
  return (
    <Button
      size="large"
      className="px-6"
      accessibilityLabel={label}
      onPress={() => openQuickCart()}
    >
      <Icon as={ShoppingCart} size={24} className="text-primary-foreground" />
      <Text>Cart</Text>
      {totalQuantity > 0 ? (
        <Badge variant="primary">
          <Text>{totalQuantity}</Text>
        </Badge>
      ) : null}
    </Button>
  );
}
