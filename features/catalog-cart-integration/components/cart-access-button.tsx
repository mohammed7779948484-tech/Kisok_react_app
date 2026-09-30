import { ShoppingCart } from "lucide-react-native";
import { View } from "react-native";

import { Button, Icon, Text } from "@/design-system";
import { useCart } from "@/features/cart";
import { useQuickCart } from "./quick-cart-context";

/** Placement-free browsing action. The integration provider owns route visibility and layout. */
export function CartAccessButton() {
  const { totalQuantity } = useCart();
  const { openQuickCart } = useQuickCart();
  const label = `Open cart${totalQuantity > 0 ? `, ${totalQuantity} items` : ""}`;
  return (
    <Button accessibilityLabel={label} onPress={() => openQuickCart()} className="px-5">
      <Icon as={ShoppingCart} size={20} className="text-primary-foreground" />
      <Text>Cart</Text>
      {totalQuantity > 0 ? (
        <View className="min-w-[22px] items-center justify-center rounded-full bg-accent-soft px-1.5 py-0.5">
          <Text className="font-sans-extrabold text-caption text-primary">{totalQuantity}</Text>
        </View>
      ) : null}
    </Button>
  );
}
