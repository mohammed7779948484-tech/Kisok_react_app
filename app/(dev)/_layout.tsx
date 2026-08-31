import { Stack } from "expo-router";

/**
 * Development-only routes.
 *
 * The root navigator wraps this group in `<Stack.Protected guard={__DEV__}>`,
 * so it is unreachable in a production build. Nothing customer-facing may live
 * here, and nothing here may be linked to from a customer screen.
 */
export default function DevLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
