/**
 * Public API of the `cart` feature.
 *
 * This file is the ONLY thing other features and routes may import from here.
 * ESLint blocks `@/features/cart/screens/...` and friends from outside this
 * directory. Inside the feature, use relative imports.
 *
 * What the cart exposes, and why each thing is public (plan decision 11):
 *
 * - Components for composition: `QuantityStepper` and `CartItemRow` (the
 *   shared line UI) and `QuickCartSheet` (the adaptive quick-cart surface a
 *   future catalog shell opens after "Add to cart").
 * - `useCart()`, the consumer hook: the narrow cart view plus bound actions
 *   for React surfaces. It also owns durable hydration — it hydrates the
 *   single store from `useActiveProfile()` and re-hydrates when the profile
 *   id changes (the T09 carry-forward: nothing else hydrates).
 * - Plain action functions — `addItem`, `setLineQuantity`, `removeLine`,
 *   `clearCart`, `lockCart`, `unlockCart`, `hydrateCart`, `getCartSnapshot` —
 *   for non-React callers. The future Checkout feature drives the same single
 *   store through these without a hook.
 * - Types for contracts at the boundary: `CartLine`, `AddToCartInput`,
 *   `PersistenceStatus`, re-exported from `state/use-cart` so there is ONE
 *   public types source. Types only: the store itself deliberately stays an
 *   implementation detail — exporting `useCartStore` would freeze the whole
 *   state shape as public contract (the rejected alternative, plan decision
 *   11), and `clearCartForSignOut` is a test-only export that must never be
 *   re-exported (R-T05-05).
 * - A screen is feature-PRIVATE by default. `FullCartScreen` appears here
 *   only because the thin `/cart` route renders it; `pnpm generate screen`
 *   alone does not widen this file.
 *
 * The sign-out cleanup registration (plan decision 10) is a deliberate module
 * side-effect of this public entry: importing this file loads
 * `state/sign-out-cleanup`, which registers the cart's destructive cleanup
 * with core/auth's public registry — features register from their own
 * modules, and the route module load at startup makes the registration live.
 */

// Plan decision 10: the registration side-effect, not a value the index needs.
import "./state/sign-out-cleanup";

export { CartItemRow } from "./components/cart-item-row";
export { QuantityStepper } from "./components/quantity-stepper";
export { QuickCartSheet } from "./components/quick-cart-sheet";
export {
  addItem,
  clearCart,
  getCartSnapshot,
  hydrateCart,
  lockCart,
  removeLine,
  setLineQuantity,
  unlockCart,
  useCart,
} from "./state/use-cart";
export type { AddToCartInput, CartLine, PersistenceStatus } from "./state/use-cart";
export { FullCartScreen } from "./screens/full-cart/full-cart-screen";
