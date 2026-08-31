/**
 * Public API of the `auth` feature.
 *
 * Everything else in this directory is feature-private — ESLint blocks
 * `@/features/auth/screens/...` style imports from outside. Add an export here
 * when another feature legitimately needs something.
 *
 * Session state itself lives in `@/core/auth` because routing, sign-out safety,
 * and role gating are cross-cutting concerns, not this feature's private state.
 *
 * FOUNDATION EXCEPTION — do not copy this directory's shape. It predates the
 * generator: `schemas/` instead of `model/`, flat `screens/*.tsx` instead of
 * one directory per screen, no `api/`, `queries/`, `state/`, or `docs/`. It
 * stays hand-shaped because it owns sensitive Foundation authentication UI and
 * migrating it is not worth the churn. Every new business feature uses
 * `pnpm generate feature <name>` and the anatomy in AGENTS.md — never this.
 */
export { SignInScreen } from "./screens/sign-in-screen";
export { StartupScreen } from "./screens/startup-screen";
export { UnauthorizedScreen } from "./screens/unauthorized-screen";
export { credentialsSchema } from "./schemas/credentials";
export type { Credentials } from "./schemas/credentials";
