import { Stack } from "expo-router";

import { CatalogCartProvider } from "@/features/catalog-cart-integration";

/**
 * Customer / kiosk experience.
 *
 * Feature agents add screens here as thin routes that render a screen from
 * their feature (catalog, cart, checkout, …). Keep this layout free of data
 * loading — shared customer chrome belongs in a component, not in the layout's
 * logic.
 *
 * T04: the customer Stack is wrapped in the catalog-cart integration's
 * provider — the session-wide cart hydration, the Quick Cart surface and the
 * persistent cart affordance all live in there, not here.
 */
export default function CustomerLayout() {
  return (
    <CatalogCartProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </CatalogCartProvider>
  );
}
