export { AuthProvider, useAuth, useActiveProfile } from "./context";
export { fetchActiveProfile } from "./profile";
export {
  registerSignOutGuard,
  unregisterSignOutGuard,
  registerSignOutCleanup,
  unregisterSignOutCleanup,
  clearSignOutTasks,
  runSignOutGuards,
  runSignOutCleanup,
} from "./sign-out";
export type {
  SignOutGuard,
  SignOutGuardResult,
  SignOutCleanupTask,
  SignOutOutcome,
} from "./sign-out";
export {
  appRoleSchema,
  activeProfileSchema,
  activeProfileRowsSchema,
  isTabletRole,
  TABLET_ROLES,
} from "./types";
export type { ActiveProfile, AppRole, AuthStatus, TabletRole } from "./types";
export { useSignOutAction } from "./use-sign-out-action";
