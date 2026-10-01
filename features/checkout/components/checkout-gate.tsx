import { useCallback, useEffect, type ReactNode } from "react";
import { BackHandler, View } from "react-native";
import { usePathname, useRouter } from "expo-router";

import { Screen, Spinner, Text } from "@/design-system";
import { useActiveProfile } from "@/core/auth";
import { getCartSnapshot, useCart } from "@/features/cart";

import { useCheckoutStore } from "../state/checkout-store";
import { CheckoutStatus } from "./checkout-status";

const SUCCESS_PATH = "/checkout-success";

/**
 * Mounted once around the customer experience. It resumes this customer's
 * saved order on launch (re-sending a pending request with its original id),
 * covers the app while an order is out of the customer's hands, and hands a
 * confirmed order to the success screen. The navigation stack stays mounted
 * underneath, so returning to the cart keeps the customer's place.
 *
 * Checkout state is synchronously owner-scoped: while the active profile does
 * not own the loaded record, or recovery has not completed, no customer route
 * or previous owner's checkout state is rendered.
 */
export function CheckoutGate({ children }: { children: ReactNode }) {
  const profile = useActiveProfile();
  const router = useRouter();
  const pathname = usePathname();
  const { lines } = useCart();
  const ownerId = useCheckoutStore((state) => state.ownerId);
  const ready = useCheckoutStore((state) => state.ready);
  const phase = useCheckoutStore((state) => state.phase);
  const pending = useCheckoutStore((state) => state.pending);
  const conflicts = useCheckoutStore((state) => state.conflicts);
  const failure = useCheckoutStore((state) => state.failure);
  const owned = ownerId === profile.id;
  const recovering = !owned || !ready;

  useEffect(() => {
    void useCheckoutStore.getState().recover(profile.id);
  }, [profile.id]);

  useEffect(() => {
    if (owned && ready && phase === "confirmed" && pathname !== SUCCESS_PATH)
      router.replace(SUCCESS_PATH);
  }, [owned, ready, phase, pathname, router]);

  const covering =
    owned &&
    ready &&
    (phase === "submitting" || phase === "unknown" || phase === "conflict" || phase === "failure");
  const blocksBack = recovering || covering;

  useEffect(() => {
    if (!blocksBack) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [blocksBack]);

  const checkAgain = useCallback(() => {
    const state = useCheckoutStore.getState();
    if (state.ownerId !== profile.id || !state.ready) return;
    void state.retry();
  }, [profile.id]);
  const tryAgain = useCallback(() => {
    const checkout = useCheckoutStore.getState();
    const cart = getCartSnapshot();
    if (checkout.ownerId !== profile.id || !checkout.ready || cart.ownerId !== profile.id) return;
    void checkout.submit(cart.lines);
  }, [profile.id]);
  const backToCart = useCallback(() => {
    const state = useCheckoutStore.getState();
    if (state.ownerId !== profile.id || !state.ready) return;
    state.backToCart();
    if (pathname !== "/cart") router.navigate("/cart");
  }, [profile.id, pathname, router]);

  let statusLines = pending?.lineSnapshots ?? lines;
  if (phase === "conflict" && conflicts) {
    const affected = new Set(conflicts.map((entry) => entry.variant_id.toLowerCase()));
    const matching = lines.filter((line) => affected.has(line.variantId.toLowerCase()));
    if (matching.length > 0) statusLines = matching;
  }

  if (recovering) {
    return (
      <Screen edges={["top", "bottom", "left", "right"]}>
        <View
          className="flex-1 items-center justify-center gap-4 px-6"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Restoring this customer session"
        >
          <Spinner />
          <Text tone="muted">Restoring this session…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <View className="flex-1">
      <View
        className="flex-1"
        aria-hidden={covering}
        importantForAccessibility={covering ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {covering ? (
        <View className="absolute inset-0" accessibilityViewIsModal>
          <CheckoutStatus
            phase={phase}
            lines={statusLines}
            conflicts={conflicts}
            failure={failure}
            onCheckAgain={checkAgain}
            onTryAgain={tryAgain}
            onBackToCart={backToCart}
          />
        </View>
      ) : null}
    </View>
  );
}
