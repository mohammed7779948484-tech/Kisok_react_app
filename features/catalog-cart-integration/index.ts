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
 *
 * The public surface is the plan-named narrow trio (Lead Planning Review
 * correction to plan decision 2): the provider the customer layout mounts,
 * the Add action the Catalog Product Detail screen renders, and the
 * structural source type that screen derives. The mapper stays
 * feature-internal. T05 pins this exact surface by key equality.
 *
 * NOTE (T03 implementer): these exports were wired in T03, not T05, because
 * the plan-mandated PUBLIC import — Product Detail rendering
 * `<AddToCartButton />` from `@/features/catalog-cart-integration`, and the
 * screen tests wrapping the real `CatalogCartProvider` from the same index —
 * cannot resolve against an empty index. This is the minimal set T03's
 * contract requires; T05 still owns pinning and any final surface decisions.
 */
export { AddToCartButton } from "./components/add-to-cart-button";
export { CatalogCartProvider } from "./components/catalog-cart-provider";
export type { CatalogCartSource } from "./model/add-to-cart-mapping";
