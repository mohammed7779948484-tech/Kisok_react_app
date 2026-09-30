import { useCallback, useEffect, type ReactNode } from "react";
import { BackHandler, View } from "react-native";
import { usePathname, useRouter } from "expo-router";

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
 */
export function CheckoutGate({ children }: { children: ReactNode }) {
  const profile = useActiveProfile();
  const router = useRouter();
  const pathname = usePathname();
  const { lines } = useCart();
  const phase = useCheckoutStore((state) => state.phase);
  const pending = useCheckoutStore((state) => state.pending);
  const conflicts = useCheckoutStore((state) => state.conflicts);
  const failure = useCheckoutStore((state) => state.failure);

  useEffect(() => {
    void useCheckoutStore.getState().recover(profile.id);
  }, [profile.id]);

  useEffect(() => {
    if (phase === "confirmed" && pathname !== SUCCESS_PATH) router.replace(SUCCESS_PATH);
  }, [phase, pathname, router]);

  const covering =
    phase === "submitting" || phase === "unknown" || phase === "conflict" || phase === "failure";

  useEffect(() => {
    if (!covering) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [covering]);

  const checkAgain = useCallback(() => void useCheckoutStore.getState().retry(), []);
  const tryAgain = useCallback(
    () => void useCheckoutStore.getState().submit(getCartSnapshot().lines),
    [],
  );
  const backToCart = useCallback(() => {
    useCheckoutStore.getState().backToCart();
    if (pathname !== "/cart") router.navigate("/cart");
  }, [pathname, router]);

  let statusLines = pending?.lineSnapshots ?? lines;
  if (phase === "conflict" && conflicts) {
    const affected = new Set(conflicts.map((entry) => entry.variant_id.toLowerCase()));
    const matching = lines.filter((line) => affected.has(line.variantId.toLowerCase()));
    if (matching.length > 0) statusLines = matching;
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
