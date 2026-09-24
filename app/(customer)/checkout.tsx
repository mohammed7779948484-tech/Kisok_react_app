import { Redirect } from "expo-router";

/** Compatibility entry only. Opening a route must never submit an order. */
export default function CheckoutRoute() {
  return <Redirect href="/cart" />;
}
