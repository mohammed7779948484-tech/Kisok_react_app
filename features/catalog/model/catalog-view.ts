import type {
  CatalogBrand,
  CatalogCategory,
  CatalogOptionType,
  CatalogOptionValue,
  CatalogProduct,
  CatalogSnapshot,
  CatalogVariant,
  CatalogVariantMedia,
  CatalogVariantOptionValue,
} from "./catalog-snapshot.schema";

const HOME_BRAND_LIMIT = 6;
const HOME_CATEGORY_LIMIT = 6;
const HOME_FEATURED_PRODUCT_LIMIT = 8;
const MINIMUM_SEARCH_LENGTH = 2;

export type CatalogMedia = {
  mediaAssetId: string;
  publicId: string;
  secureUrl: string;
};

export type CatalogBrandView = CatalogBrand & {
  image: CatalogMedia | null;
  productCount: number;
};

export type CatalogCategoryView = CatalogCategory & {
  image: CatalogMedia | null;
  parent: CatalogCategory | null;
  children: CatalogCategoryView[];
  productCount: number;
};

export type CatalogVariantOptionView = {
  type: CatalogOptionType;
  value: CatalogOptionValue;
  label: string;
};

export type CatalogVariantView = CatalogVariant & {
  label: string;
  options: CatalogVariantOptionView[];
  media: CatalogMedia[];
  primaryMedia: CatalogMedia | null;
  mediaSource: "variant" | "product" | "none";
};

export type CatalogProductView = CatalogProduct & {
  brand: CatalogBrandView | null;
  categories: CatalogCategoryView[];
  variants: CatalogVariantView[];
  coverMedia: CatalogMedia | null;
  isAvailable: boolean;
  searchText: string;
};

export type CatalogSearchResult = {
  state: "idle" | "too-short" | "no-match" | "results";
  query: string;
  normalizedQuery: string;
  products: CatalogProductView[];
};

export type CatalogView = {
  settings: CatalogSnapshot["settings"];
  brands: CatalogBrandView[];
  categories: CatalogCategoryView[];
  rootCategories: CatalogCategoryView[];
  products: CatalogProductView[];
  home: {
    brands: CatalogBrandView[];
    categories: CatalogCategoryView[];
    featuredProducts: CatalogProductView[];
  };
  resolveProduct: (productId: string) => CatalogProductView | undefined;
  resolveBrand: (brandId: string) => CatalogBrandView | undefined;
  resolveCategory: (categoryId: string) => CatalogCategoryView | undefined;
  productsForBrand: (brandId: string) => CatalogProductView[];
  productsForCategory: (categoryId: string, brandId?: string | null) => CatalogProductView[];
  brandsForCategory: (categoryId: string) => CatalogBrandView[];
  search: (query: string) => CatalogSearchResult;
};

function appendIndexValue<Key, Value>(index: Map<Key, Value[]>, key: Key, value: Value): void {
  const values = index.get(key);
  if (values === undefined) {
    index.set(key, [value]);
    return;
  }

  values.push(value);
}

function addIndexSetValue<Key, Value>(index: Map<Key, Set<Value>>, key: Key, value: Value): void {
  const values = index.get(key);
  if (values === undefined) {
    index.set(key, new Set([value]));
    return;
  }

  values.add(value);
}

function nullableMedia(
  mediaAssetId: string | null,
  publicId: string | null,
  secureUrl: string | null,
): CatalogMedia | null {
  if (mediaAssetId === null || publicId === null || secureUrl === null) {
    return null;
  }

  return { mediaAssetId, publicId, secureUrl };
}

function cloneKeywords(keywords: string[] | null): string[] | null {
  return keywords === null ? null : [...keywords];
}

export function normalizeCatalogSearchText(value: string): string {
  return value.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function createCatalogView(snapshot: CatalogSnapshot): CatalogView {
  const settings = { ...snapshot.settings } as CatalogSnapshot["settings"];
  const variantsByProductId = new Map<string, CatalogVariant[]>();
  for (const variant of snapshot.variants) {
    appendIndexValue(variantsByProductId, variant.product_id, {
      ...variant,
      search_keywords: cloneKeywords(variant.search_keywords),
    });
  }

  const optionLinksByVariantId = new Map<string, CatalogVariantOptionValue[]>();
  for (const link of snapshot.variant_option_values) {
    appendIndexValue(optionLinksByVariantId, link.variant_id, link);
  }

  const mediaByVariantId = new Map<string, CatalogVariantMedia[]>();
  for (const media of snapshot.variant_media) {
    appendIndexValue(mediaByVariantId, media.variant_id, media);
  }

  const categorySummaries = snapshot.categories.map((category) => ({ ...category }));
  const rawCategoryById = new Map(categorySummaries.map((category) => [category.id, category]));
  const childCategoriesByParentId = new Map<string, CatalogCategory[]>();
  for (const category of categorySummaries) {
    if (category.parent_id !== null) {
      appendIndexValue(childCategoriesByParentId, category.parent_id, category);
    }
  }

  const categoryIdsByProductId = new Map<string, Set<string>>();
  const productIdsByCategoryId = new Map<string, Set<string>>();
  for (const membership of snapshot.product_categories) {
    addIndexSetValue(categoryIdsByProductId, membership.product_id, membership.category_id);
    addIndexSetValue(productIdsByCategoryId, membership.category_id, membership.product_id);
  }

  const productCountByBrandId = new Map<string, number>();
  for (const product of snapshot.products) {
    if (product.brand_id !== null) {
      productCountByBrandId.set(
        product.brand_id,
        (productCountByBrandId.get(product.brand_id) ?? 0) + 1,
      );
    }
  }

  const brandViews: CatalogBrandView[] = snapshot.brands.map((brand) => ({
    ...brand,
    image: nullableMedia(brand.image_media_asset_id, brand.image_public_id, brand.image_secure_url),
    productCount: productCountByBrandId.get(brand.id) ?? 0,
  }));
  const brandById = new Map(brandViews.map((brand) => [brand.id, brand]));
  const brandOrderById = new Map(brandViews.map((brand, index) => [brand.id, index]));

  const categoryViews: CatalogCategoryView[] = categorySummaries.map((category) => ({
    ...category,
    image: nullableMedia(
      category.image_media_asset_id,
      category.image_public_id,
      category.image_secure_url,
    ),
    parent: null,
    children: [],
    productCount: 0,
  }));
  const categoryById = new Map(categoryViews.map((category) => [category.id, category]));

  for (const category of categoryViews) {
    category.parent =
      category.parent_id === null ? null : (rawCategoryById.get(category.parent_id) ?? null);
    category.children = (childCategoriesByParentId.get(category.id) ?? []).flatMap((child) => {
      const childView = categoryById.get(child.id);
      return childView === undefined ? [] : [childView];
    });
  }

  const categoryViewsByProductId = new Map<string, CatalogCategoryView[]>();
  for (const category of categoryViews) {
    for (const productId of productIdsByCategoryId.get(category.id) ?? []) {
      appendIndexValue(categoryViewsByProductId, productId, category);
    }
  }

  const optionTypeById = new Map(
    snapshot.option_types.map((optionType) => [optionType.id, { ...optionType }]),
  );
  const optionValueById = new Map(
    snapshot.option_values.map((optionValue) => [optionValue.id, { ...optionValue }]),
  );

  const productViews: CatalogProductView[] = snapshot.products.map((product) => {
    const coverMedia = nullableMedia(
      product.cover_media_asset_id,
      product.cover_public_id,
      product.cover_secure_url,
    );
    const categories = categoryViewsByProductId.get(product.id) ?? [];
    const productVariants = variantsByProductId.get(product.id) ?? [];

    const variants: CatalogVariantView[] = productVariants.map((variant, variantIndex) => {
      const options = (optionLinksByVariantId.get(variant.id) ?? []).flatMap(
        (link): CatalogVariantOptionView[] => {
          const type = optionTypeById.get(link.option_type_id);
          const value = optionValueById.get(link.option_value_id);

          if (type === undefined || value === undefined || value.option_type_id !== type.id) {
            return [];
          }

          return [{ type, value, label: `${type.name}: ${value.value}` }];
        },
      );
      const titleOverride = variant.title_override?.trim();
      const label =
        titleOverride ||
        (options.length > 0
          ? options.map((option) => option.label).join(", ")
          : productVariants.length === 1
            ? "Standard option"
            : `Option ${variantIndex + 1}`);
      const variantMediaRecords = mediaByVariantId.get(variant.id) ?? [];
      const variantMedia = variantMediaRecords.map((media) => ({
        mediaAssetId: media.media_asset_id,
        publicId: media.public_id,
        secureUrl: media.secure_url,
      }));
      const primaryVariantMedia =
        variantMediaRecords.find((media) => media.is_primary) ?? variantMediaRecords[0];
      const primaryMedia = primaryVariantMedia
        ? {
            mediaAssetId: primaryVariantMedia.media_asset_id,
            publicId: primaryVariantMedia.public_id,
            secureUrl: primaryVariantMedia.secure_url,
          }
        : coverMedia;
      const media = variantMedia.length > 0 ? variantMedia : coverMedia ? [coverMedia] : [];

      return {
        ...variant,
        label,
        options,
        media,
        primaryMedia,
        mediaSource: variantMedia.length > 0 ? "variant" : coverMedia ? "product" : "none",
      };
    });

    const brand = product.brand_id ? (brandById.get(product.brand_id) ?? null) : null;
    const searchCategoryNames = new Set<string>();
    for (const category of categories) {
      searchCategoryNames.add(category.name);
      if (category.parent !== null) {
        searchCategoryNames.add(category.parent.name);
      }
    }
    const searchFields = [
      product.name,
      ...(product.search_keywords ?? []),
      ...(brand ? [brand.name] : []),
      ...searchCategoryNames,
      ...variants.flatMap((variant) => [
        ...(variant.title_override ? [variant.title_override] : []),
        ...(variant.search_keywords ?? []),
        ...variant.options.flatMap((option) => [option.type.name, option.value.value]),
      ]),
    ];

    return {
      ...product,
      search_keywords: cloneKeywords(product.search_keywords),
      brand,
      categories,
      variants,
      coverMedia,
      isAvailable: variants.some((variant) => variant.is_available),
      searchText: normalizeCatalogSearchText(searchFields.join(" ")),
    };
  });
  const productById = new Map(productViews.map((product) => [product.id, product]));

  const productsByBrandId = new Map<string, CatalogProductView[]>();
  const productsByCategoryId = new Map<string, CatalogProductView[]>();
  const indexedProductIdsByCategoryId = new Map<string, Set<string>>();
  for (const product of productViews) {
    if (product.brand_id !== null && brandById.has(product.brand_id)) {
      appendIndexValue(productsByBrandId, product.brand_id, product);
    }

    const projectedCategoryIds = new Set<string>();
    for (const categoryId of categoryIdsByProductId.get(product.id) ?? []) {
      const category = rawCategoryById.get(categoryId);
      if (category === undefined) {
        continue;
      }

      projectedCategoryIds.add(category.id);
      if (category.parent_id !== null) {
        projectedCategoryIds.add(category.parent_id);
      }
    }

    for (const categoryId of projectedCategoryIds) {
      if (!categoryById.has(categoryId)) {
        continue;
      }

      const indexedProductIds = indexedProductIdsByCategoryId.get(categoryId) ?? new Set<string>();
      if (indexedProductIds.has(product.id)) {
        continue;
      }

      indexedProductIds.add(product.id);
      indexedProductIdsByCategoryId.set(categoryId, indexedProductIds);
      appendIndexValue(productsByCategoryId, categoryId, product);
    }
  }

  for (const category of categoryViews) {
    category.productCount = productsByCategoryId.get(category.id)?.length ?? 0;
  }

  const brandsByCategoryId = new Map<string, CatalogBrandView[]>();
  for (const category of categoryViews) {
    const brandIds = new Set(
      (productsByCategoryId.get(category.id) ?? []).flatMap((product) =>
        product.brand === null ? [] : [product.brand.id],
      ),
    );
    const orderedBrands = [...brandIds]
      .flatMap((brandId) => {
        const brand = brandById.get(brandId);
        return brand === undefined ? [] : [brand];
      })
      .sort(
        (left, right) => (brandOrderById.get(left.id) ?? 0) - (brandOrderById.get(right.id) ?? 0),
      );
    brandsByCategoryId.set(category.id, orderedBrands);
  }

  const rootCategories = categoryViews.filter((category) => category.parent_id === null);
  const featuredProducts = productViews.filter((product) => product.is_featured);

  const productsForBrand = (brandId: string): CatalogProductView[] => [
    ...(productsByBrandId.get(brandId) ?? []),
  ];

  const productsForCategory = (
    categoryId: string,
    brandId?: string | null,
  ): CatalogProductView[] => {
    if (!categoryById.has(categoryId)) {
      return [];
    }

    const products = productsByCategoryId.get(categoryId) ?? [];
    if (brandId === undefined || brandId === null) {
      return [...products];
    }

    return products.filter((product) => product.brand_id === brandId);
  };

  const brandsForCategory = (categoryId: string): CatalogBrandView[] => [
    ...(brandsByCategoryId.get(categoryId) ?? []),
  ];

  const search = (query: string): CatalogSearchResult => {
    const trimmedQuery = query.trim();
    const normalizedQuery = normalizeCatalogSearchText(trimmedQuery);

    if (normalizedQuery.length === 0) {
      return { state: "idle", query: trimmedQuery, normalizedQuery, products: [] };
    }

    if ([...normalizedQuery].length < MINIMUM_SEARCH_LENGTH) {
      return {
        state: "too-short",
        query: trimmedQuery,
        normalizedQuery,
        products: [],
      };
    }

    const products = productViews.filter((product) => product.searchText.includes(normalizedQuery));

    return {
      state: products.length > 0 ? "results" : "no-match",
      query: trimmedQuery,
      normalizedQuery,
      products,
    };
  };

  return {
    settings,
    brands: brandViews,
    categories: categoryViews,
    rootCategories,
    products: productViews,
    home: {
      brands: brandViews.slice(0, HOME_BRAND_LIMIT),
      categories: rootCategories.slice(0, HOME_CATEGORY_LIMIT),
      featuredProducts: featuredProducts.slice(0, HOME_FEATURED_PRODUCT_LIMIT),
    },
    resolveProduct: (productId) => productById.get(productId),
    resolveBrand: (brandId) => brandById.get(brandId),
    resolveCategory: (categoryId) => categoryById.get(categoryId),
    productsForBrand,
    productsForCategory,
    brandsForCategory,
    search,
  };
}
