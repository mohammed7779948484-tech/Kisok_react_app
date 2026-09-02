/**
 * Public API of the `kiosk-runtime` feature.
 *
 * This file is the ONLY thing other features and routes may import from here.
 * ESLint blocks `@/features/kiosk-runtime/screens/...` and friends from outside this
 * directory. Inside the feature, use relative imports.
 *
 * Export the minimum another feature genuinely needs. A small public surface is
 * what lets several agents work in parallel without conflicting.
 *
 * A screen is feature-PRIVATE by default. It appears here only when something
 * outside the feature renders it — which, from the generator, means a route.
 * `pnpm generate screen` alone does not widen this file.
 *
 * The three runtime exports (`useRootTarget`, `useDevicePolicySync`,
 * `KioskMaintenanceOverlay`) exist because `app/**` may not import Zustand
 * (eslint + `.claude/rules/routes.md`: "Own the store inside the feature and
 * expose a hook") — `useRootTarget()` is the sanctioned channel through which
 * the root routing consumes the device policy, `useDevicePolicySync()` and the
 * overlay are the root's one-time mounts. The raw store stays feature-private.
 */
export { KioskMismatchScreen } from "./screens/kiosk-mismatch/kiosk-mismatch-screen";
export { useDevicePolicySync } from "./native/use-device-policy-sync";
export { useRootTarget } from "./state/use-root-target";
export { KioskMaintenanceOverlay } from "./components/kiosk-maintenance-overlay";
