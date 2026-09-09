/**
 * Public API of the `catalog` feature.
 *
 * This file is the ONLY thing other features and routes may import from here.
 * ESLint blocks `@/features/catalog/screens/...` and friends from outside this
 * directory. Inside the feature, use relative imports.
 *
 * Export the minimum another feature genuinely needs. A small public surface is
 * what lets several agents work in parallel without conflicting.
 *
 * A screen is feature-PRIVATE by default. It appears here only when something
 * outside the feature renders it — which, from the generator, means a route.
 * `pnpm generate screen` alone does not widen this file.
 *
 * `useCustomerCatalogSettings` (checkout plan D6) is the narrow settings read
 * over the existing catalog query cache — the Checkout success countdown
 * reads the cached `customer_success_reset_seconds` with no second fetch.
 */
export { CatalogHomeScreen } from "./screens/catalog-home/catalog-home-screen";
export { ProductsScreen } from "./screens/products/products-screen";
export { SearchScreen } from "./screens/search/search-screen";
export { BrandsScreen } from "./screens/brands/brands-screen";
export { BrandDetailScreen } from "./screens/brand-detail/brand-detail-screen";
export { CategoriesScreen } from "./screens/categories/categories-screen";
export { CategoryDetailScreen } from "./screens/category-detail/category-detail-screen";
export { ProductDetailScreen } from "./screens/product-detail/product-detail-screen";
export { useCustomerCatalogSettings } from "./queries/use-customer-settings";
