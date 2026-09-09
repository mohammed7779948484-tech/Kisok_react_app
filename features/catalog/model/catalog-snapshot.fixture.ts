import type { CatalogSnapshot } from "./catalog-snapshot.schema";

export const catalogFixtureIds = {
  brands: {
    elite: "11111111-1111-4111-8111-111111111111",
    basics: "22222222-2222-4222-8222-222222222222",
  },
  categories: {
    drinks: "33333333-3333-4333-8333-333333333333",
    specials: "44444444-4444-4444-8444-444444444444",
  },
  products: {
    coffee: "55555555-5555-4555-8555-555555555555",
    tote: "66666666-6666-4666-8666-666666666666",
    notebook: "77777777-7777-4777-8777-777777777777",
  },
  optionTypes: {
    color: "88888888-8888-4888-8888-888888888888",
    size: "99999999-9999-4999-8999-999999999999",
  },
  optionValues: {
    rouge: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    large: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  },
  variants: {
    signature: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    configurable: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    tote: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    notebookFirst: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    notebookSecond: "12121212-1212-4212-8212-121212121212",
  },
  media: {
    logo: "13131313-1313-4313-8313-131313131313",
    brand: "14141414-1414-4414-8414-141414141414",
    category: "15151515-1515-4515-8515-151515151515",
    coffeeCover: "16161616-1616-4616-8616-161616161616",
    signature: "17171717-1717-4717-8717-171717171717",
  },
} as const;

export function createCatalogSnapshotFixture(
  overrides: Partial<CatalogSnapshot> = {},
): CatalogSnapshot {
  const ids = catalogFixtureIds;

  return {
    schema_version: "kiosk.catalog.lean.v1",
    settings: {
      store_name: "KISOK Test Store",
      global_low_stock_threshold: 5,
      customer_success_reset_seconds: 25,
      store_timezone: "Africa/Casablanca",
      logo_media_asset_id: ids.media.logo,
      logo_public_id: "catalog/logo",
      logo_secure_url: "https://res.cloudinary.com/kisok/image/upload/catalog-logo.png",
    },
    brands: [
      {
        id: ids.brands.elite,
        name: "Maison Élite",
        image_media_asset_id: ids.media.brand,
        image_public_id: "brands/elite",
        image_secure_url: "https://res.cloudinary.com/kisok/image/upload/elite.png",
        display_order: 10,
      },
      {
        id: ids.brands.basics,
        name: "KISOK Basics",
        image_media_asset_id: null,
        image_public_id: null,
        image_secure_url: null,
        display_order: 20,
      },
    ],
    categories: [
      {
        id: ids.categories.drinks,
        name: "Drínks",
        parent_id: null,
        image_media_asset_id: ids.media.category,
        image_public_id: "categories/drinks",
        image_secure_url: "https://res.cloudinary.com/kisok/image/upload/drinks.png",
        display_order: 10,
      },
      {
        id: ids.categories.specials,
        name: "Tóp Picks",
        parent_id: ids.categories.drinks,
        image_media_asset_id: null,
        image_public_id: null,
        image_secure_url: null,
        display_order: 20,
      },
    ],
    products: [
      {
        id: ids.products.coffee,
        name: "Café Crème",
        brand_id: ids.brands.elite,
        cover_media_asset_id: ids.media.coffeeCover,
        cover_public_id: "products/coffee-cover",
        cover_secure_url: "https://res.cloudinary.com/kisok/image/upload/coffee-cover.png",
        short_description: "A smooth customer favourite.",
        search_keywords: ["dessért", "coffee"],
        display_order: 10,
        is_featured: true,
      },
      {
        id: ids.products.tote,
        name: "Everyday Tote",
        brand_id: null,
        cover_media_asset_id: null,
        cover_public_id: null,
        cover_secure_url: null,
        short_description: null,
        search_keywords: null,
        display_order: 20,
        is_featured: false,
      },
      {
        id: ids.products.notebook,
        name: "Pocket Notebook",
        brand_id: ids.brands.basics,
        cover_media_asset_id: null,
        cover_public_id: null,
        cover_secure_url: null,
        short_description: null,
        search_keywords: ["stationery"],
        display_order: 30,
        is_featured: true,
      },
    ],
    product_categories: [
      {
        product_id: ids.products.coffee,
        category_id: ids.categories.drinks,
      },
      {
        product_id: ids.products.coffee,
        category_id: ids.categories.specials,
      },
      {
        product_id: ids.products.tote,
        category_id: ids.categories.specials,
      },
    ],
    option_types: [
      {
        id: ids.optionTypes.color,
        name: "Color",
        display_order: 10,
      },
      {
        id: ids.optionTypes.size,
        name: "Size",
        display_order: 20,
      },
    ],
    option_values: [
      {
        id: ids.optionValues.rouge,
        option_type_id: ids.optionTypes.color,
        value: "Rouge",
        display_order: 10,
      },
      {
        id: ids.optionValues.large,
        option_type_id: ids.optionTypes.size,
        value: "Lárge",
        display_order: 10,
      },
    ],
    variants: [
      {
        id: ids.variants.signature,
        product_id: ids.products.coffee,
        sku: "SECRET-SKU-COFFEE-1",
        barcode: "990000000001",
        title_override: "  Signature roast  ",
        search_keywords: ["velvety"],
        display_order: 10,
        is_available: false,
      },
      {
        id: ids.variants.configurable,
        product_id: ids.products.coffee,
        sku: "SECRET-SKU-COFFEE-2",
        barcode: null,
        title_override: null,
        search_keywords: null,
        display_order: 20,
        is_available: true,
      },
      {
        id: ids.variants.tote,
        product_id: ids.products.tote,
        sku: "SECRET-SKU-TOTE",
        barcode: null,
        title_override: null,
        search_keywords: null,
        display_order: 10,
        is_available: false,
      },
      {
        id: ids.variants.notebookFirst,
        product_id: ids.products.notebook,
        sku: "SECRET-SKU-NOTEBOOK-1",
        barcode: null,
        title_override: null,
        search_keywords: null,
        display_order: 10,
        is_available: false,
      },
      {
        id: ids.variants.notebookSecond,
        product_id: ids.products.notebook,
        sku: "SECRET-SKU-NOTEBOOK-2",
        barcode: "990000000005",
        title_override: null,
        search_keywords: ["journal"],
        display_order: 20,
        is_available: false,
      },
    ],
    variant_option_values: [
      {
        variant_id: ids.variants.configurable,
        option_type_id: ids.optionTypes.color,
        option_value_id: ids.optionValues.rouge,
      },
      {
        variant_id: ids.variants.configurable,
        option_type_id: ids.optionTypes.size,
        option_value_id: ids.optionValues.large,
      },
    ],
    variant_media: [
      {
        variant_id: ids.variants.signature,
        media_asset_id: ids.media.signature,
        public_id: "products/signature-roast",
        secure_url: "https://res.cloudinary.com/kisok/image/upload/signature-roast.png",
        display_order: 10,
        is_primary: true,
      },
    ],
    ...overrides,
  };
}
