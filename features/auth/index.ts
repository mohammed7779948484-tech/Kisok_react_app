/**
 * Public API of the `auth` feature.
 *
 * Everything else in this directory is feature-private — ESLint blocks
 * `@/features/auth/screens/...` style imports from outside. Add an export here
 * when another feature legitimately needs something.
 *
 * Session state itself lives in `@/core/auth` because routing, sign-out safety,
 * and role gating are cross-cutting concerns, not this feature's private state.
 */
export { SignInScreen } from "./screens/sign-in-screen";
export { StartupScreen } from "./screens/startup-screen";
export { UnauthorizedScreen } from "./screens/unauthorized-screen";
export { credentialsSchema } from "./schemas/credentials";
export type { Credentials } from "./schemas/credentials";
