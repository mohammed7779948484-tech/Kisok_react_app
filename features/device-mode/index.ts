/**
 * Public API of the `device-mode` feature.
 *
 * This file is the ONLY thing other features and routes may import from here.
 * ESLint blocks `@/features/device-mode/screens/...` and friends from outside this
 * directory. Inside the feature, use relative imports.
 *
 * The surface is deliberately four items: the provider the root layout mounts,
 * the hook that reads the current device mode, the one pure decision the root
 * routing makes with it, and the screen its route renders. Everything else —
 * the native module boundary, the Zod schema, the derivation — stays private,
 * because nothing outside this feature should reason about device policy.
 */
export { DeviceMismatchScreen } from "./screens/device-mismatch/device-mismatch-screen";
export { DeviceModeProvider, useDeviceMode } from "./state/device-mode-context";
export { deviceRoleAccess } from "./model/device-mode.schema";
export type { DeviceMode, DeviceRoleAccess } from "./model/device-mode.schema";
