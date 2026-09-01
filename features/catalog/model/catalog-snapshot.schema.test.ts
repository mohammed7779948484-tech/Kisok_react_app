import { catalogFixtureIds, createCatalogSnapshotFixture } from "./catalog-snapshot.fixture";
import { catalogSnapshotSchema } from "./catalog-snapshot.schema";

function expectRejectedAt(payload: unknown, path: string): void {
  const result = catalogSnapshotSchema.safeParse(payload);

  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }

  expect(result.error.issues.some((issue) => issue.path.join(".") === path)).toBe(true);
}

describe("catalog-snapshot schema", () => {
  it("accepts the complete migration-derived payload and preserves nullable media", () => {
    const result = catalogSnapshotSchema.safeParse(createCatalogSnapshotFixture());

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.brands[1]).toMatchObject({
      image_media_asset_id: null,
      image_public_id: null,
      image_secure_url: null,
    });
    expect(result.data.products[1]).toMatchObject({
      brand_id: null,
      cover_media_asset_id: null,
      short_description: null,
      search_keywords: null,
    });
  });

  it("accepts and preserves canonical PostgreSQL UUIDs without version restrictions", () => {
    const payload = createCatalogSnapshotFixture();
    const productId = "55555555-5555-9555-8555-555555555555";
    const result = catalogSnapshotSchema.safeParse({
      ...payload,
      products: payload.products.map((product) =>
        product.id === catalogFixtureIds.products.coffee ? { ...product, id: productId } : product,
      ),
      product_categories: payload.product_categories.map((membership) =>
        membership.product_id === catalogFixtureIds.products.coffee
          ? { ...membership, product_id: productId }
          : membership,
      ),
      variants: payload.variants.map((variant) =>
        variant.product_id === catalogFixtureIds.products.coffee
          ? { ...variant, product_id: productId }
          : variant,
      ),
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.products[0]?.id).toBe(productId);
    expect(result.data.product_categories[0]?.product_id).toBe(productId);
    expect(result.data.product_categories[1]?.product_id).toBe(productId);
    expect(result.data.variants[0]?.product_id).toBe(productId);
    expect(result.data.variants[1]?.product_id).toBe(productId);
  });

  it("accepts empty settings but rejects an incomplete full settings object", () => {
    expect(
      catalogSnapshotSchema.safeParse(createCatalogSnapshotFixture({ settings: {} })).success,
    ).toBe(true);

    const payload = createCatalogSnapshotFixture();
    if (!("store_timezone" in payload.settings)) {
      throw new Error("The default fixture must include full settings.");
    }
    const { store_timezone: _storeTimezone, ...incompleteSettings } = payload.settings;

    expectRejectedAt(
      {
        ...payload,
        settings: incompleteSettings,
      },
      "settings",
    );
  });

  it("rejects the wrong schema version exactly", () => {
    expectRejectedAt(
      {
        ...createCatalogSnapshotFixture(),
        schema_version: "kiosk.catalog.lean.v2",
      },
      "schema_version",
    );
  });

  it.each([
    [
      "malformed entity uuid",
      { brands: [{ ...createCatalogSnapshotFixture().brands[0], id: "nope" }] },
      "brands.0.id",
    ],
    ["missing required collection", { variants: undefined }, "variants"],
    [
      "invalid availability boolean",
      {
        variants: [
          {
            ...createCatalogSnapshotFixture().variants[0],
            is_available: "yes",
          },
        ],
      },
      "variants.0.is_available",
    ],
    [
      "nullable-only media field omitted",
      {
        brands: [
          {
            id: catalogFixtureIds.brands.elite,
            name: "Maison Élite",
            image_media_asset_id: null,
            image_public_id: null,
            display_order: 10,
          },
        ],
      },
      "brands.0.image_secure_url",
    ],
  ])("rejects a malformed payload: %s", (_caseName, overrides, path) => {
    expectRejectedAt(
      {
        ...createCatalogSnapshotFixture(),
        ...overrides,
      },
      path,
    );
  });

  it("accepts and preserves a raw media public ID over 255 due only to surrounding spaces", () => {
    const payload = createCatalogSnapshotFixture();
    const rawPublicId = `   ${"x".repeat(255)}   `;
    const result = catalogSnapshotSchema.safeParse({
      ...payload,
      products: payload.products.map((product, index) =>
        index === 0 ? { ...product, cover_public_id: rawPublicId } : product,
      ),
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.products[0]?.cover_public_id).toBe(rawPublicId);
  });

  it("treats non-space whitespace as content like PostgreSQL default btrim", () => {
    const payload = createCatalogSnapshotFixture();
    const result = catalogSnapshotSchema.safeParse({
      ...payload,
      settings: {
        ...payload.settings,
        store_name: "\t",
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect("store_name" in result.data.settings && result.data.settings.store_name).toBe("\t");
  });

  it("rejects a media public ID whose PostgreSQL-btrimmed length exceeds 255", () => {
    const payload = createCatalogSnapshotFixture();

    expectRejectedAt(
      {
        ...payload,
        products: payload.products.map((product, index) =>
          index === 0 ? { ...product, cover_public_id: ` ${"x".repeat(256)} ` } : product,
        ),
      },
      "products.0.cover_public_id",
    );
  });

  it("accepts and preserves 255 supplementary Unicode code points with surrounding spaces", () => {
    const payload = createCatalogSnapshotFixture();
    const rawPublicId = `   ${"😀".repeat(255)}   `;
    const result = catalogSnapshotSchema.safeParse({
      ...payload,
      products: payload.products.map((product, index) =>
        index === 0 ? { ...product, cover_public_id: rawPublicId } : product,
      ),
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.products[0]?.cover_public_id).toBe(rawPublicId);
  });

  it("rejects 256 supplementary Unicode code points after PostgreSQL btrim", () => {
    const payload = createCatalogSnapshotFixture();

    expectRejectedAt(
      {
        ...payload,
        products: payload.products.map((product, index) =>
          index === 0 ? { ...product, cover_public_id: ` ${"😀".repeat(256)} ` } : product,
        ),
      },
      "products.0.cover_public_id",
    );
  });

  it("normalizes null product and variant keyword elements at the boundary", () => {
    const payload = createCatalogSnapshotFixture();
    const result = catalogSnapshotSchema.safeParse({
      ...payload,
      products: payload.products.map((product, index) =>
        index === 0 ? { ...product, search_keywords: ["dessért", null, "coffee"] } : product,
      ),
      variants: payload.variants.map((variant, index) =>
        index === 0 ? { ...variant, search_keywords: [null, "velvety", null] } : variant,
      ),
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.products[0]?.search_keywords).toEqual(["dessért", "coffee"]);
    expect(result.data.variants[0]?.search_keywords).toEqual(["velvety"]);
  });

  it.each([
    [
      "a product without a returned variant",
      (payload: ReturnType<typeof createCatalogSnapshotFixture>) => ({
        ...payload,
        variants: payload.variants.filter(
          (variant) => variant.product_id !== catalogFixtureIds.products.tote,
        ),
      }),
      "products.1.id",
    ],
    [
      "an unresolved product brand",
      (payload: ReturnType<typeof createCatalogSnapshotFixture>) => ({
        ...payload,
        products: payload.products.map((product, index) =>
          index === 0
            ? {
                ...product,
                brand_id: "18181818-1818-4818-8818-181818181818",
              }
            : product,
        ),
      }),
      "products.0.brand_id",
    ],
    [
      "a self-referencing category",
      (payload: ReturnType<typeof createCatalogSnapshotFixture>) => ({
        ...payload,
        categories: payload.categories.map((category, index) =>
          index === 1 ? { ...category, parent_id: category.id } : category,
        ),
      }),
      "categories.1.parent_id",
    ],
    [
      "an unresolved product-category relationship",
      (payload: ReturnType<typeof createCatalogSnapshotFixture>) => ({
        ...payload,
        product_categories: payload.product_categories.map((membership, index) =>
          index === 0
            ? {
                ...membership,
                category_id: "18181818-1818-4818-8818-181818181818",
              }
            : membership,
        ),
      }),
      "product_categories.0.category_id",
    ],
    [
      "a variant option whose value belongs to another type",
      (payload: ReturnType<typeof createCatalogSnapshotFixture>) => ({
        ...payload,
        variant_option_values: payload.variant_option_values.map((link, index) =>
          index === 0 ? { ...link, option_value_id: catalogFixtureIds.optionValues.large } : link,
        ),
      }),
      "variant_option_values.0.option_value_id",
    ],
    [
      "a duplicate relationship key",
      (payload: ReturnType<typeof createCatalogSnapshotFixture>) => ({
        ...payload,
        product_categories: [...payload.product_categories, { ...payload.product_categories[0]! }],
      }),
      "product_categories.3",
    ],
    [
      "a partially-null product media tuple",
      (payload: ReturnType<typeof createCatalogSnapshotFixture>) => ({
        ...payload,
        products: payload.products.map((product, index) =>
          index === 0 ? { ...product, cover_media_asset_id: null } : product,
        ),
      }),
      "products.0.cover_media_asset_id",
    ],
    [
      "a second primary media row for one variant",
      (payload: ReturnType<typeof createCatalogSnapshotFixture>) => ({
        ...payload,
        variant_media: [
          ...payload.variant_media,
          {
            ...payload.variant_media[0]!,
            media_asset_id: "18181818-1818-4818-8818-181818181818",
            public_id: "products/signature-roast-alternate",
            secure_url:
              "https://res.cloudinary.com/kisok/image/upload/signature-roast-alternate.png",
          },
        ],
      }),
      "variant_media.1.is_primary",
    ],
  ])("rejects semantic contract violations: %s", (_caseName, mutate, path) => {
    expectRejectedAt(mutate(createCatalogSnapshotFixture()), path);
  });

  it("rejects unknown root and entity fields", () => {
    const payload = createCatalogSnapshotFixture();

    expect(catalogSnapshotSchema.safeParse({ ...payload, unexpected: true }).success).toBe(false);
    expect(
      catalogSnapshotSchema.safeParse({
        ...payload,
        products: [{ ...payload.products[0], price: 99 }],
      }).success,
    ).toBe(false);
  });
});
