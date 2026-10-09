/**
 * Public API of the `device-mode` feature.
 *
 * This file is the ONLY thing other features and routes may import from here.
 * ESLint blocks `@/features/device-mode/screens/...` and friends from outside this
 * directory. Inside the feature, use relative imports.
 *
 * Exposes descriptive device context, the account-role routing decision and
 * the retained legacy mismatch screen. Valid tablet roles always pass that
 * decision. Native reads, schemas and derivation stay private.
 */
export { DeviceMismatchScreen } from "./screens/device-mismatch/device-mismatch-screen";
export { DeviceModeProvider, useDeviceMode } from "./state/device-mode-context";
export { deviceRoleAccess } from "./model/device-mode.schema";
export type { DeviceMode, DeviceRoleAccess } from "./model/device-mode.schema";
