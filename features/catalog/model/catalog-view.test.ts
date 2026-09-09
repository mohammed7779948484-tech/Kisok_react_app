import { catalogFixtureIds, createCatalogSnapshotFixture } from "./catalog-snapshot.fixture";
import { catalogSnapshotSchema, type CatalogSnapshot } from "./catalog-snapshot.schema";
import { createCatalogView } from "./catalog-view";

function makeUuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function resultProductIds(view: ReturnType<typeof createCatalogView>, query: string) {
  return view.search(query).products.map((product) => product.id);
}

describe("catalog view", () => {
  it("preserves backend product order, resolves IDs, and tolerates missing associations", () => {
    const view = createCatalogView(createCatalogSnapshotFixture());

    expect(view.products.map((product) => product.id)).toEqual([
      catalogFixtureIds.products.coffee,
      catalogFixtureIds.products.tote,
      catalogFixtureIds.products.notebook,
    ]);
    expect(view.resolveProduct(catalogFixtureIds.products.tote)).toBe(view.products[1]);
    expect(view.resolveBrand(catalogFixtureIds.brands.elite)).toBe(view.brands[0]);
    expect(view.resolveCategory(catalogFixtureIds.categories.specials)).toBe(view.categories[1]);
    expect(view.resolveProduct("00000000-0000-4000-8000-000000000099")).toBeUndefined();
    expect(view.resolveBrand("00000000-0000-4000-8000-000000000099")).toBeUndefined();
    expect(view.resolveCategory("00000000-0000-4000-8000-000000000099")).toBeUndefined();

    expect(view.products[1]?.brand).toBeNull();
    expect(view.products[2]?.categories).toEqual([]);
  });

  it("aggregates direct and direct-child root memberships once while children stay direct", () => {
    const view = createCatalogView(createCatalogSnapshotFixture());

    expect(
      view.productsForCategory(catalogFixtureIds.categories.drinks).map((product) => product.id),
    ).toEqual([catalogFixtureIds.products.coffee, catalogFixtureIds.products.tote]);
    expect(
      view.productsForCategory(catalogFixtureIds.categories.specials).map((product) => product.id),
    ).toEqual([catalogFixtureIds.products.coffee, catalogFixtureIds.products.tote]);
    expect(view.categories[0]?.productCount).toBe(2);
    expect(view.categories[1]?.productCount).toBe(2);
    expect(view.rootCategories.map((category) => category.id)).toEqual([
      catalogFixtureIds.categories.drinks,
    ]);
    expect(view.categories[0]?.children.map((category) => category.id)).toEqual([
      catalogFixtureIds.categories.specials,
    ]);
  });

  it("keeps category projections acyclic with parent context and ordered children", () => {
    const view = createCatalogView(createCatalogSnapshotFixture());
    const root = view.resolveCategory(catalogFixtureIds.categories.drinks);
    const child = view.resolveCategory(catalogFixtureIds.categories.specials);

    expect(() => JSON.stringify(view.categories)).not.toThrow();
    expect(child?.parent).toMatchObject({
      id: catalogFixtureIds.categories.drinks,
      name: "Drínks",
    });
    expect(child?.parent).not.toHaveProperty("children");
    expect(root?.children.map((category) => category.id)).toEqual([
      catalogFixtureIds.categories.specials,
    ]);
  });

  it("does not expose mutable aliases to parsed snapshot transport data", () => {
    const raw = createCatalogSnapshotFixture();
    const parsed = catalogSnapshotSchema.parse(raw);
    const view = createCatalogView(parsed);
    const product = view.resolveProduct(catalogFixtureIds.products.coffee);
    const child = view.resolveCategory(catalogFixtureIds.categories.specials);
    const configurable = product?.variants[1];

    if ("store_name" in view.settings) {
      view.settings.store_name = "Mutated view store";
    }
    product?.search_keywords?.push("mutated-product-keyword");
    product?.variants[0]?.search_keywords?.push("mutated-variant-keyword");
    if (child?.parent !== null && child?.parent !== undefined) {
      child.parent.name = "Mutated parent";
    }
    if (configurable?.options[0] !== undefined) {
      configurable.options[0].type.name = "Mutated type";
      configurable.options[0].value.value = "Mutated value";
    }

    expect("store_name" in parsed.settings && parsed.settings.store_name).toBe("KISOK Test Store");
    expect(parsed.products[0]?.search_keywords).toEqual(["dessért", "coffee"]);
    expect(parsed.variants[0]?.search_keywords).toEqual(["velvety"]);
    expect(parsed.categories[0]?.name).toBe("Drínks");
    expect(parsed.option_types[0]?.name).toBe("Color");
    expect(parsed.option_values[0]?.value).toBe("Rouge");

    expect("store_name" in raw.settings && raw.settings.store_name).toBe("KISOK Test Store");
    expect(raw.products[0]?.search_keywords).toEqual(["dessért", "coffee"]);
    expect(raw.variants[0]?.search_keywords).toEqual(["velvety"]);
  });

  it("derives product availability, brand counts, and brand/category projections", () => {
    const view = createCatalogView(createCatalogSnapshotFixture());

    expect(view.products.map((product) => product.isAvailable)).toEqual([true, false, false]);
    expect(view.brands.map((brand) => brand.productCount)).toEqual([1, 1]);
    expect(
      view.productsForBrand(catalogFixtureIds.brands.elite).map((product) => product.id),
    ).toEqual([catalogFixtureIds.products.coffee]);
    expect(
      view
        .productsForCategory(catalogFixtureIds.categories.drinks, catalogFixtureIds.brands.elite)
        .map((product) => product.id),
    ).toEqual([catalogFixtureIds.products.coffee]);
    expect(
      view.brandsForCategory(catalogFixtureIds.categories.drinks).map((brand) => brand.id),
    ).toEqual([catalogFixtureIds.brands.elite]);
    expect(view.productsForBrand("00000000-0000-4000-8000-000000000099")).toEqual([]);
    expect(view.productsForCategory("00000000-0000-4000-8000-000000000099")).toEqual([]);
  });

  it("labels variants in backend order and applies variant, product, then null media fallback", () => {
    const view = createCatalogView(createCatalogSnapshotFixture());
    const coffee = view.resolveProduct(catalogFixtureIds.products.coffee);
    const tote = view.resolveProduct(catalogFixtureIds.products.tote);
    const notebook = view.resolveProduct(catalogFixtureIds.products.notebook);

    expect(coffee?.variants.map((variant) => variant.label)).toEqual([
      "Signature roast",
      "Color: Rouge, Size: Lárge",
    ]);
    expect(tote?.variants.map((variant) => variant.label)).toEqual(["Standard option"]);
    expect(notebook?.variants.map((variant) => variant.label)).toEqual(["Option 1", "Option 2"]);

    expect(coffee?.variants[0]?.mediaSource).toBe("variant");
    expect(coffee?.variants[0]?.primaryMedia?.mediaAssetId).toBe(catalogFixtureIds.media.signature);
    expect(coffee?.variants[1]?.mediaSource).toBe("product");
    expect(coffee?.variants[1]?.primaryMedia?.mediaAssetId).toBe(
      catalogFixtureIds.media.coffeeCover,
    );
    expect(tote?.variants[0]).toMatchObject({
      media: [],
      mediaSource: "none",
      primaryMedia: null,
    });
  });

  it("normalizes two-character search across customer fields, preserves order, and excludes identifiers", () => {
    const view = createCatalogView(createCatalogSnapshotFixture());

    expect(view.search("   ")).toMatchObject({
      state: "idle",
      normalizedQuery: "",
      products: [],
    });
    expect(view.search(" é ")).toMatchObject({
      state: "too-short",
      normalizedQuery: "e",
      products: [],
    });

    expect(resultProductIds(view, "CA")).toEqual([catalogFixtureIds.products.coffee]);
    expect(resultProductIds(view, "elite")).toEqual([catalogFixtureIds.products.coffee]);
    expect(resultProductIds(view, "top")).toEqual([
      catalogFixtureIds.products.coffee,
      catalogFixtureIds.products.tote,
    ]);
    expect(resultProductIds(view, "drinks")).toEqual([
      catalogFixtureIds.products.coffee,
      catalogFixtureIds.products.tote,
    ]);
    expect(resultProductIds(view, "signature")).toEqual([catalogFixtureIds.products.coffee]);
    expect(resultProductIds(view, "velvety")).toEqual([catalogFixtureIds.products.coffee]);
    expect(resultProductIds(view, "size")).toEqual([catalogFixtureIds.products.coffee]);
    expect(resultProductIds(view, "large")).toEqual([catalogFixtureIds.products.coffee]);
    expect(resultProductIds(view, "journal")).toEqual([catalogFixtureIds.products.notebook]);
    expect(resultProductIds(view, "coffee")).toEqual([catalogFixtureIds.products.coffee]);

    expect(view.search("SECRET-SKU")).toMatchObject({ state: "no-match", products: [] });
    expect(view.search("990000000001")).toMatchObject({
      state: "no-match",
      products: [],
    });
  });

  it("caps Home projections without changing backend order", () => {
    const base = createCatalogSnapshotFixture();
    const brands = Array.from({ length: 7 }, (_, index) => ({
      ...base.brands[0]!,
      id: makeUuid(100 + index),
      name: `Brand ${index + 1}`,
      display_order: index + 1,
    }));
    const categories = Array.from({ length: 7 }, (_, index) => ({
      ...base.categories[0]!,
      id: makeUuid(200 + index),
      name: `Category ${index + 1}`,
      parent_id: null,
      display_order: index + 1,
    }));
    const products = Array.from({ length: 9 }, (_, index) => ({
      ...base.products[0]!,
      id: makeUuid(300 + index),
      name: `Featured ${index + 1}`,
      brand_id: brands[index % brands.length]!.id,
      display_order: index + 1,
      is_featured: true,
    }));
    const variants = products.map((product, index) => ({
      ...base.variants[2]!,
      id: makeUuid(400 + index),
      product_id: product.id,
      sku: `HOME-${index + 1}`,
      display_order: index + 1,
    }));
    const snapshot: CatalogSnapshot = {
      ...base,
      brands,
      categories,
      products,
      product_categories: [],
      variants,
      variant_option_values: [],
      variant_media: [],
    };

    const view = createCatalogView(snapshot);

    expect(view.home.brands.map((brand) => brand.id)).toEqual(
      brands.slice(0, 6).map((brand) => brand.id),
    );
    expect(view.home.categories.map((category) => category.id)).toEqual(
      categories.slice(0, 6).map((category) => category.id),
    );
    expect(view.home.featuredProducts.map((product) => product.id)).toEqual(
      products.slice(0, 8).map((product) => product.id),
    );
  });
});
