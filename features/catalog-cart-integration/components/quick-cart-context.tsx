import { createContext, useContext } from "react";

/**
 * The ephemeral Quick Cart open-state contract (plan decision 1).
 *
 * Pure ephemeral UI state: no store, no cart imports, nothing durable — the
 * Quick Cart's open/close is React composition, deliberately NOT a second
 * Zustand store (the cart model stays the one and only store; this context
 * owns nothing the customer could lose). Kept in its own module, separate
 * from the provider, so the import graph stays acyclic: provider → context
 * (here), and later the Add-to-cart button and the persistent affordance →
 * context, without any of them importing the provider.
 *
 * The provider (`catalog-cart-provider.tsx`) is the one component that
 * supplies the value; `useQuickCart()` is how the integration's own action
 * components consume it.
 */
export type QuickCartContextValue = {
  /** Whether the Quick Cart sheet is currently open. */
  open: boolean;
  /** Open the Quick Cart (e.g. after a successful Add to cart, or from the persistent affordance). */
  openQuickCart: () => void;
  /** Close the Quick Cart. */
  closeQuickCart: () => void;
};

/**
 * `null` default by design: a missing provider is a programmer error, and the
 * hook fails loudly instead of silently doing nothing — the same contract
 * core/auth's `useAuth()` uses.
 */
export const QuickCartContext = createContext<QuickCartContextValue | null>(null);

/** Consume the Quick Cart open state. Throws outside `<CatalogCartProvider>`. */
export function useQuickCart(): QuickCartContextValue {
  const value = useContext(QuickCartContext);
  if (value === null) {
    throw new Error("useQuickCart must be used inside <CatalogCartProvider>.");
  }
  return value;
}
