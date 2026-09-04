/**
 * Public API of the `checkout` feature.
 *
 * This file is the ONLY thing other features and routes may import from here.
 * ESLint blocks `@/features/checkout/screens/...` and friends from outside this
 * directory. Inside the feature, use relative imports.
 *
 * Export the minimum another feature genuinely needs. A small public surface is
 * what lets several agents work in parallel without conflicting.
 *
 * A screen is feature-PRIVATE by default. It appears here only when something
 * outside the feature renders it — which, from the generator, means a route.
 * `pnpm generate screen` alone does not widen this file.
 */

// Plan decision 10 (the cart index precedent): the registration side-effect,
// not a value the index needs. Importing this file loads
// `state/sign-out-cleanup`, which registers checkout's sign-out guard and
// destructive cleanup with core/auth's public registry — features register
// from their own modules, and the layout/route module loads make the
// registration live (D7: the customer layout imports this entry).
import "./state/sign-out-cleanup";

export {};
