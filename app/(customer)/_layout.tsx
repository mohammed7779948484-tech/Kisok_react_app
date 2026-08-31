import { Stack } from "expo-router";

/**
 * Customer / kiosk experience.
 *
 * Feature agents add screens here as thin routes that render a screen from
 * their feature (catalog, cart, checkout, …). Keep this layout free of data
 * loading — shared customer chrome belongs in a component, not in the layout's
 * logic.
 */
export default function CustomerLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
