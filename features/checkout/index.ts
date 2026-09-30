/**
 * Public API of the `checkout` feature.
 *
 * This file is the ONLY thing other features and routes may import from here.
 * ESLint blocks `@/features/checkout/screens/...` and friends from outside this
 * directory. Inside the feature, use relative imports.
 *
 * - `CheckoutGate`: mounted once by the customer layout; resumes a saved
 *   order and shows its status while it is out of the customer's hands.
 * - The two screens the customer routes render.
 */
export { CheckoutGate } from "./components/checkout-gate";
export { CartOrderScreen } from "./screens/cart-order/cart-order-screen";
export { OrderSuccessScreen } from "./screens/order-success/order-success-screen";
