/**
 * Public API of the `cart` feature.
 *
 * This file is the ONLY thing other features and routes may import from here.
 * ESLint blocks `@/features/cart/screens/...` and friends from outside this
 * directory. Inside the feature, use relative imports.
 *
 * - Components: `QuantityStepper` (with the cart's line bounds),
 *   `CartLineCard` and `QuickCartSheet`.
 * - `useCart()`: the cart view plus actions for React surfaces; it also
 *   restores the active customer's cart.
 * - Plain functions for Checkout and event handlers: `getCartSnapshot`,
 *   `hydrateCart`, `lockCart`/`unlockCart` around an order submission, and
 *   `clearCartAfterOrder` once the store confirms it.
 * - `cartLineSchema` and the line types, because a submitted order keeps the
 *   lines it was placed with.
 * - `FullCartScreen`, which Checkout composes with its confirm action.
 *
 * The Zustand store itself stays private.
 */
export { CartLineCard } from "./components/cart-line-card";
export { QuantityStepper } from "./components/quantity-stepper";
export { QuickCartSheet } from "./components/quick-cart-sheet";
export { cartLineSchema, MAX_LINE_QUANTITY } from "./model/cart-line.schema";
export { customerLineIdentity } from "./model/customer-line-identity";
export {
  addItem,
  clearCart,
  clearCartAfterOrder,
  getCartSnapshot,
  hydrateCart,
  lockCart,
  removeLine,
  setLineQuantity,
  unlockCart,
  useCart,
} from "./state/use-cart";
export type { AddToCartInput, CartLine, CartSnapshot, CartView } from "./state/use-cart";
export { FullCartScreen } from "./screens/full-cart/full-cart-screen";
export type { FullCartScreenProps } from "./screens/full-cart/full-cart-screen";
