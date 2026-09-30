import { useCallback, useState } from "react";
import { ArrowRight } from "lucide-react-native";
import { View } from "react-native";

import { Button, Icon, Text } from "@/design-system";
import { FullCartScreen, getCartSnapshot, useCart, type CartLine } from "@/features/cart";

import { MAX_NORMALIZED_ITEMS } from "../../model/normalized-request";
import { useCheckoutStore } from "../../state/checkout-store";

/**
 * The cart is the order review: Checkout adds the confirm action, the
 * one-order limit, and — after a stock conflict — what the store has left
 * next to each affected line.
 */
export function CartOrderScreen() {
  const cart = useCart();
  const ready = useCheckoutStore((state) => state.ready);
  const phase = useCheckoutStore((state) => state.phase);
  const conflicts = useCheckoutStore((state) => state.conflicts);
  const [sending, setSending] = useState(false);

  const variantCount = new Set(cart.lines.map((line) => line.variantId.toLowerCase())).size;
  const overLimit = variantCount > MAX_NORMALIZED_ITEMS;
  const canConfirm =
    ready && phase === "idle" && cart.hydrated && !cart.locked && cart.lines.length > 0;

  const confirm = async () => {
    if (sending || !canConfirm || overLimit) return;
    setSending(true);
    try {
      await useCheckoutStore.getState().submit(getCartSnapshot().lines);
    } finally {
      setSending(false);
    }
  };

  const lineNote = useCallback(
    (line: CartLine) => {
      const conflict = conflicts?.find(
        (entry) => entry.variant_id.toLowerCase() === line.variantId.toLowerCase(),
      );
      if (!conflict) return null;
      // Once the customer has brought the variant within what is left, the note goes.
      const inCart = cart.lines.reduce(
        (sum, entry) =>
          entry.variantId.toLowerCase() === line.variantId.toLowerCase()
            ? sum + entry.quantity
            : sum,
        0,
      );
      if (inCart <= conflict.available_quantity) return null;
      return (
        <Text variant="meta" tone="warning" className="font-sans-semibold">
          {conflict.available_quantity === 0
            ? "Sold out right now — please remove it"
            : `Only ${conflict.available_quantity} available for this option`}
        </Text>
      );
    },
    [conflicts, cart.lines],
  );

  return (
    <FullCartScreen
      interactionDisabled={!ready || sending}
      lineNote={conflicts ? lineNote : undefined}
      notice={
        overLimit ? (
          <View className="rounded-xl bg-warning/15 p-3">
            <Text variant="meta" className="text-warning-text">
              {`One order can hold up to ${MAX_NORMALIZED_ITEMS} different options. Remove ${variantCount - MAX_NORMALIZED_ITEMS} to continue.`}
            </Text>
          </View>
        ) : null
      }
      finalAction={
        <Button
          size="large"
          block
          disabled={!canConfirm || overLimit || sending}
          onPress={() => void confirm()}
        >
          <Text>{sending ? "Sending…" : "Confirm order"}</Text>
          {sending ? null : <Icon as={ArrowRight} size={20} className="text-primary-foreground" />}
        </Button>
      }
    />
  );
}
