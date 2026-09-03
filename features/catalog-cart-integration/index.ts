/**
 * Public API of the `catalog-cart-integration` feature.
 *
 * This file is the ONLY thing other features and routes may import from here.
 * ESLint blocks `@/features/catalog-cart-integration/screens/...` and friends from outside this
 * directory. Inside the feature, use relative imports.
 *
 * Export the minimum another feature genuinely needs. A small public surface is
 * what lets several agents work in parallel without conflicting.
 *
 * A screen is feature-PRIVATE by default. It appears here only when something
 * outside the feature renders it — which, from the generator, means a route.
 * `pnpm generate screen` alone does not widen this file.
 */
export {};
