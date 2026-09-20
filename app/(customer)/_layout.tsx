import { Stack } from "expo-router";

import { CatalogCartProvider } from "@/features/catalog-cart-integration";
import { RecoveryGate } from "@/features/checkout";
import { WhatsNewGate } from "@/features/release-notes";

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
 *
 * T12 (plan D7): the checkout feature's RecoveryGate wraps the Stack INSIDE
 * that provider (the cart hydration owner stays unique). It runs recover()
 * for the active profile at MOUNT — before any checkout surface is reachable,
 * which is what closes the sign-out guard's restart window — and owns the
 * recovery surfaces for the outcomes that need one. Importing
 * `@/features/checkout` here is also the module load that makes checkout's
 * sign-out guard registration live.
 *
 * WhatsNewGate is mounted HERE, not at the root: it is a CUSTOMER message, and
 * this layout renders only under the customer guard — after auth and routing
 * have settled. Mounting it at the root would put it in front of sign-in, the
 * unauthorized screen, the device-mismatch screen and Preparation.
 */
export default function CustomerLayout() {
  return (
    <CatalogCartProvider>
      <RecoveryGate>
        <WhatsNewGate />
        <Stack screenOptions={{ headerShown: false }} />
      </RecoveryGate>
    </CatalogCartProvider>
  );
}
