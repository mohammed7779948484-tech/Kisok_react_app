/**
 * Public API of the `demo-real` feature.
 *
 * This file is the ONLY thing other features and routes may import from here.
 * ESLint blocks `@/features/demo-real/api/...` and friends from outside this
 * directory. Inside the feature, use relative imports.
 *
 * Export the minimum another feature genuinely needs. A small public surface is
 * what lets several agents work in parallel without conflicting.
 */
export { DemoRealScreen } from "./screens/demo-real-screen";
export type { DemoRealItem } from "./schemas/demo-real-schema";
export { demoRealKeys } from "./queries/keys";
