import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { QuickCartSheet, useCart } from "@/features/cart";

import { QuickCartContext, type QuickCartContextValue } from "./quick-cart-context";

export type CatalogCartProviderProps = {
  children: React.ReactNode;
};

/**
 * The customer experience's cart composition point (plan decision 1).
 *
 * Mounted ONCE at the customer-experience level (the customer layout — T04),
 * it makes the whole session cart-ready and owns the Quick Cart surface:
 *
 * - `useCart()` — the cart feature's public consumer hook — is the ONE
 *   session-wide hydration owner: it mounts `useActiveProfile()` and hydrates
 *   the single cart store when the profile id changes (AC-01). Nothing else
 *   here hydrates, and the subscription stays REAL — the hook must remain
 *   mounted for the session, so this component deliberately keeps rendering
 *   it even though no field of the view is read directly here.
 * - Importing `@/features/cart` here is also the module-load that brings in
 *   the cart feature's sign-out cleanup registration for the whole session —
 *   the R-FR-05 carry-forward closed by import structure, not new code (plan
 *   decision 9).
 * - The ephemeral Quick Cart open state lives in the `QuickCartContext` this
 *   provider supplies (plain React composition, never a second store).
 * - The Quick Cart surface is the cart feature's PUBLIC `QuickCartSheet` —
 *   controlled `open`/`onOpenChange`, never reimplemented here.
 * - `onViewFullCart` is this provider's routing intent (plan decision 8): a
 *   public `router.push("/cart")` to the cart feature's existing route. The
 *   sheet's own contract forbids it importing a router — the caller owns
 *   navigation, and this component is the caller.
 *
 * NOT here (deliberately, later tasks): the persistent cart affordance
 * (T04 renders it inside this provider) and the Add-to-cart action (T03).
 *
 * It must not import the Supabase client (the cart is client-owned local
 * state with no backend) and reaches the cart only through its public index.
 * The wrapper `View` is layout only (`flex-1` so the routed Stack it will
 * wrap keeps filling the screen) — no visual chrome, no raw colours.
 */
export function CatalogCartProvider({ children }: CatalogCartProviderProps) {
  // The session-wide hydration owner, kept mounted for the whole customer
  // experience. Its view is consumed by the sheet's own store subscription
  // and future affordance (T04); the mount itself is the behavior.
  useCart();

  // Ephemeral open state — plain React state, supplied to consumers through
  // the context below.
  const [open, setOpen] = useState(false);

  // The public router for the View Full Cart intent.
  const router = useRouter();

  const openQuickCart = useCallback(() => {
    setOpen(true);
  }, []);
  const closeQuickCart = useCallback(() => {
    setOpen(false);
  }, []);

  const contextValue = useMemo<QuickCartContextValue>(
    () => ({ open, openQuickCart, closeQuickCart }),
    [open, openQuickCart, closeQuickCart],
  );

  // The sheet's View Full Cart intent (plan decision 8): navigate to the
  // cart feature's route and close the quick surface on the way out.
  const handleViewFullCart = useCallback(() => {
    router.push("/cart");
    setOpen(false);
  }, [router]);

  return (
    <QuickCartContext.Provider value={contextValue}>
      <View className="flex-1">{children}</View>
      <QuickCartSheet open={open} onOpenChange={setOpen} onViewFullCart={handleViewFullCart} />
    </QuickCartContext.Provider>
  );
}
