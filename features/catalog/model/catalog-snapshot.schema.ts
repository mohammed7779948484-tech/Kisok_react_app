import { z } from "zod";

function postgresBtrim(value: string): string {
  return value.replace(/^ +| +$/g, "");
}

const nonBlankStringSchema = z.string().refine((value) => postgresBtrim(value).length > 0, {
  message: "Expected a non-blank string",
});
const secureUrlSchema = z.string().refine((value) => value.startsWith("https://"), {
  message: "Expected an HTTPS URL",
});
const mediaPublicIdSchema = z.string().refine(
  (value) => {
    const length = [...postgresBtrim(value)].length;
    return length >= 1 && length <= 255;
  },
  { message: "Expected a PostgreSQL-btrimmed length between 1 and 255 characters" },
);
const postgresUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: "Expected canonical PostgreSQL UUID text",
  });
const displayOrderSchema = z.number().int();
const nullableKeywordsSchema = z
  .array(z.string().nullable())
  .nullable()
  .transform((keywords) =>
    keywords === null ? null : keywords.filter((keyword): keyword is string => keyword !== null),
  );

const fullCatalogSettingsSchema = z.strictObject({
  store_name: nonBlankStringSchema,
  global_low_stock_threshold: z.number().int().nonnegative(),
  customer_success_reset_seconds: z.number().int().positive(),
  store_timezone: nonBlankStringSchema,
  logo_media_asset_id: postgresUuidSchema.nullable(),
  logo_public_id: mediaPublicIdSchema.nullable(),
  logo_secure_url: secureUrlSchema.nullable(),
});

export type CatalogFullSettings = z.infer<typeof fullCatalogSettingsSchema>;
export type EmptyCatalogSettings = Record<string, never>;
export type CatalogSettings = EmptyCatalogSettings | CatalogFullSettings;

const catalogSettingsSchema: z.ZodType<CatalogSettings> = z.union([
  z.strictObject({}),
  fullCatalogSettingsSchema,
]);

const catalogBrandSchema = z.strictObject({
  id: postgresUuidSchema,
  name: nonBlankStringSchema,
  image_media_asset_id: postgresUuidSchema.nullable(),
  image_public_id: mediaPublicIdSchema.nullable(),
  image_secure_url: secureUrlSchema.nullable(),
  display_order: displayOrderSchema,
});

const catalogCategorySchema = z.strictObject({
  id: postgresUuidSchema,
  name: nonBlankStringSchema,
  parent_id: postgresUuidSchema.nullable(),
  image_media_asset_id: postgresUuidSchema.nullable(),
  image_public_id: mediaPublicIdSchema.nullable(),
  image_secure_url: secureUrlSchema.nullable(),
  display_order: displayOrderSchema,
});

const catalogProductSchema = z.strictObject({
  id: postgresUuidSchema,
  name: nonBlankStringSchema,
  brand_id: postgresUuidSchema.nullable(),
  cover_media_asset_id: postgresUuidSchema.nullable(),
  cover_public_id: mediaPublicIdSchema.nullable(),
  cover_secure_url: secureUrlSchema.nullable(),
  short_description: nonBlankStringSchema.nullable(),
  search_keywords: nullableKeywordsSchema,
  display_order: displayOrderSchema,
  is_featured: z.boolean(),
});

const catalogProductCategorySchema = z.strictObject({
  product_id: postgresUuidSchema,
  category_id: postgresUuidSchema,
});

const catalogOptionTypeSchema = z.strictObject({
  id: postgresUuidSchema,
  name: nonBlankStringSchema,
  display_order: displayOrderSchema,
});

const catalogOptionValueSchema = z.strictObject({
  id: postgresUuidSchema,
  option_type_id: postgresUuidSchema,
  value: nonBlankStringSchema,
  display_order: displayOrderSchema,
});

const catalogVariantSchema = z.strictObject({
  id: postgresUuidSchema,
  product_id: postgresUuidSchema,
  sku: z.string(),
  barcode: nonBlankStringSchema.nullable(),
  title_override: nonBlankStringSchema.nullable(),
  search_keywords: nullableKeywordsSchema,
  display_order: displayOrderSchema,
  is_available: z.boolean(),
});

const catalogVariantOptionValueSchema = z.strictObject({
  variant_id: postgresUuidSchema,
  option_type_id: postgresUuidSchema,
  option_value_id: postgresUuidSchema,
});

const catalogVariantMediaSchema = z.strictObject({
  variant_id: postgresUuidSchema,
  media_asset_id: postgresUuidSchema,
  public_id: mediaPublicIdSchema,
  secure_url: secureUrlSchema,
  display_order: displayOrderSchema,
  is_primary: z.boolean(),
});

const catalogSnapshotShapeSchema = z.strictObject({
  schema_version: z.literal("kiosk.catalog.lean.v1"),
  settings: catalogSettingsSchema,
  brands: z.array(catalogBrandSchema),
  categories: z.array(catalogCategorySchema),
  products: z.array(catalogProductSchema),
  product_categories: z.array(catalogProductCategorySchema),
  option_types: z.array(catalogOptionTypeSchema),
  option_values: z.array(catalogOptionValueSchema),
  variants: z.array(catalogVariantSchema),
  variant_option_values: z.array(catalogVariantOptionValueSchema),
  variant_media: z.array(catalogVariantMediaSchema),
});

function hasCompleteNullableTuple(values: readonly unknown[]): boolean {
  const nullCount = values.filter((value) => value === null).length;
  return nullCount === 0 || nullCount === values.length;
}

/** Runtime contract of the customer-safe `get_customer_catalog()` JSON snapshot. */
export const catalogSnapshotSchema = catalogSnapshotShapeSchema.superRefine((snapshot, context) => {
  const addIssue = (path: (string | number)[], message: string): void => {
    context.addIssue({ code: "custom", path, message });
  };

  const buildEntityMap = <Entity extends { id: string }>(
    entities: Entity[],
    collection: string,
  ): Map<string, Entity> => {
    const entityById = new Map<string, Entity>();
    entities.forEach((entity, index) => {
      if (entityById.has(entity.id)) {
        addIssue([collection, index, "id"], `Duplicate ${collection} id.`);
        return;
      }
      entityById.set(entity.id, entity);
    });
    return entityById;
  };

  const rejectDuplicateKeys = <Relationship>(
    relationships: Relationship[],
    collection: string,
    keyFor: (relationship: Relationship) => string,
  ): void => {
    const keys = new Set<string>();
    relationships.forEach((relationship, index) => {
      const key = keyFor(relationship);
      if (keys.has(key)) {
        addIssue([collection, index], `Duplicate ${collection} relationship.`);
        return;
      }
      keys.add(key);
    });
  };

  const brandById = buildEntityMap(snapshot.brands, "brands");
  const categoryById = buildEntityMap(snapshot.categories, "categories");
  const productById = buildEntityMap(snapshot.products, "products");
  const optionTypeById = buildEntityMap(snapshot.option_types, "option_types");
  const optionValueById = buildEntityMap(snapshot.option_values, "option_values");
  const variantById = buildEntityMap(snapshot.variants, "variants");

  rejectDuplicateKeys(
    snapshot.product_categories,
    "product_categories",
    (membership) => `${membership.product_id}:${membership.category_id}`,
  );
  rejectDuplicateKeys(
    snapshot.variant_option_values,
    "variant_option_values",
    (link) => `${link.variant_id}:${link.option_type_id}`,
  );
  rejectDuplicateKeys(
    snapshot.variant_media,
    "variant_media",
    (media) => `${media.variant_id}:${media.media_asset_id}`,
  );

  const variantCountByProductId = new Map<string, number>();
  snapshot.variants.forEach((variant, index) => {
    if (!productById.has(variant.product_id)) {
      addIssue(
        ["variants", index, "product_id"],
        "Variant product_id must resolve to a returned product.",
      );
      return;
    }
    variantCountByProductId.set(
      variant.product_id,
      (variantCountByProductId.get(variant.product_id) ?? 0) + 1,
    );
  });

  snapshot.products.forEach((product, index) => {
    if (product.brand_id !== null && !brandById.has(product.brand_id)) {
      addIssue(
        ["products", index, "brand_id"],
        "Product brand_id must resolve to a returned brand.",
      );
    }
    if ((variantCountByProductId.get(product.id) ?? 0) === 0) {
      addIssue(["products", index, "id"], "Every returned product must have a returned variant.");
    }
    if (
      !hasCompleteNullableTuple([
        product.cover_media_asset_id,
        product.cover_public_id,
        product.cover_secure_url,
      ])
    ) {
      addIssue(
        ["products", index, "cover_media_asset_id"],
        "Product cover media fields must be all null or all present.",
      );
    }
  });

  const categoryIdsWithDirectProducts = new Set<string>(
    snapshot.product_categories.map((membership) => membership.category_id),
  );
  const categoryIdsUsedThroughChildren = new Set<string>();
  snapshot.categories.forEach((category) => {
    if (category.parent_id !== null && categoryIdsWithDirectProducts.has(category.id)) {
      categoryIdsUsedThroughChildren.add(category.parent_id);
    }
  });

  snapshot.categories.forEach((category, index) => {
    if (
      !categoryIdsWithDirectProducts.has(category.id) &&
      !categoryIdsUsedThroughChildren.has(category.id)
    ) {
      addIssue(
        ["categories", index, "id"],
        "Every returned category must have a direct product membership or a direct child with one under the used_categories contract.",
      );
    }
    if (category.parent_id !== null) {
      if (category.parent_id === category.id) {
        addIssue(["categories", index, "parent_id"], "Category cannot reference itself as parent.");
      } else {
        const parent = categoryById.get(category.parent_id);
        if (parent === undefined) {
          addIssue(
            ["categories", index, "parent_id"],
            "Category parent_id must resolve to a returned category.",
          );
        } else if (parent.parent_id !== null) {
          addIssue(["categories", index, "parent_id"], "Category parent must be a root category.");
        }
      }
    }
    if (
      !hasCompleteNullableTuple([
        category.image_media_asset_id,
        category.image_public_id,
        category.image_secure_url,
      ])
    ) {
      addIssue(
        ["categories", index, "image_media_asset_id"],
        "Category image fields must be all null or all present.",
      );
    }
  });

  const brandIdsWithProducts = new Set<string>();
  snapshot.products.forEach((product) => {
    if (product.brand_id !== null) {
      brandIdsWithProducts.add(product.brand_id);
    }
  });

  snapshot.brands.forEach((brand, index) => {
    if (!brandIdsWithProducts.has(brand.id)) {
      addIssue(
        ["brands", index, "id"],
        "Every returned brand must have a returned product under the used_brands contract.",
      );
    }
    if (
      !hasCompleteNullableTuple([
        brand.image_media_asset_id,
        brand.image_public_id,
        brand.image_secure_url,
      ])
    ) {
      addIssue(
        ["brands", index, "image_media_asset_id"],
        "Brand image fields must be all null or all present.",
      );
    }
  });

  if (Object.keys(snapshot.settings).length > 0) {
    const settings = snapshot.settings as CatalogFullSettings;
    if (
      !hasCompleteNullableTuple([
        settings.logo_media_asset_id,
        settings.logo_public_id,
        settings.logo_secure_url,
      ])
    ) {
      addIssue(
        ["settings", "logo_media_asset_id"],
        "Settings logo fields must be all null or all present.",
      );
    }
  }

  snapshot.product_categories.forEach((membership, index) => {
    if (!productById.has(membership.product_id)) {
      addIssue(
        ["product_categories", index, "product_id"],
        "Product-category product_id must resolve.",
      );
    }
    if (!categoryById.has(membership.category_id)) {
      addIssue(
        ["product_categories", index, "category_id"],
        "Product-category category_id must resolve.",
      );
    }
  });

  snapshot.option_values.forEach((value, index) => {
    if (!optionTypeById.has(value.option_type_id)) {
      addIssue(["option_values", index, "option_type_id"], "Option value type must resolve.");
    }
  });

  snapshot.variant_option_values.forEach((link, index) => {
    if (!variantById.has(link.variant_id)) {
      addIssue(
        ["variant_option_values", index, "variant_id"],
        "Variant option variant_id must resolve.",
      );
    }
    const optionType = optionTypeById.get(link.option_type_id);
    if (optionType === undefined) {
      addIssue(
        ["variant_option_values", index, "option_type_id"],
        "Variant option type must resolve.",
      );
    }
    const optionValue = optionValueById.get(link.option_value_id);
    if (optionValue === undefined) {
      addIssue(
        ["variant_option_values", index, "option_value_id"],
        "Variant option value must resolve.",
      );
    } else if (optionType !== undefined && optionValue.option_type_id !== optionType.id) {
      addIssue(
        ["variant_option_values", index, "option_value_id"],
        "Variant option value must belong to the linked option type.",
      );
    }
  });

  const variantIdsWithPrimaryMedia = new Set<string>();
  snapshot.variant_media.forEach((media, index) => {
    if (!variantById.has(media.variant_id)) {
      addIssue(["variant_media", index, "variant_id"], "Variant media variant_id must resolve.");
    }
    if (media.is_primary) {
      if (variantIdsWithPrimaryMedia.has(media.variant_id)) {
        addIssue(
          ["variant_media", index, "is_primary"],
          "Variant cannot have more than one primary media row.",
        );
      } else {
        variantIdsWithPrimaryMedia.add(media.variant_id);
      }
    }
  });
});

export type CatalogBrand = z.infer<typeof catalogBrandSchema>;
export type CatalogCategory = z.infer<typeof catalogCategorySchema>;
export type CatalogProduct = z.infer<typeof catalogProductSchema>;
export type CatalogProductCategory = z.infer<typeof catalogProductCategorySchema>;
export type CatalogOptionType = z.infer<typeof catalogOptionTypeSchema>;
export type CatalogOptionValue = z.infer<typeof catalogOptionValueSchema>;
export type CatalogVariant = z.infer<typeof catalogVariantSchema>;
export type CatalogVariantOptionValue = z.infer<typeof catalogVariantOptionValueSchema>;
export type CatalogVariantMedia = z.infer<typeof catalogVariantMediaSchema>;
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
