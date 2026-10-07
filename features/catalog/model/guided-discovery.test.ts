import { createCatalogSnapshotFixture } from "./catalog-snapshot.fixture";
import type { CatalogSnapshot } from "./catalog-snapshot.schema";
import { createCatalogView, type CatalogView } from "./catalog-view";
import {
  answerLabel,
  deriveGuidedResult,
  matchingVariantIds,
  parseMatch,
  questionForDimension,
  reconcileGuidedAnswers,
  removeAnswer,
  replaceAnswer,
  serializeMatch,
  type DimensionKey,
  type GuidedAnswer,
} from "./guided-discovery";

// A hand-built catalog with the real store's shape: four roots (two with
// children), single-dimension Flavor vapes with many mostly-unique values,
// pouches with a fixed Strength per product, title-only variants, and stock gaps.

type VariantSpec = {
  options?: Record<string, string>;
  title?: string;
  keywords?: string[];
  available?: boolean;
};
type ProductSpec = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  variants: VariantSpec[];
};
type CategorySpec = { id: string; name: string; parent?: string };
type CatalogSpec = {
  brands: { id: string; name: string }[];
  categories: CategorySpec[];
  optionTypes: string[];
  /** Values registered up front so display order differs from first appearance. */
  presetValues?: Record<string, string[]>;
  products: ProductSpec[];
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const typeId = (name: string): string => `type-${slug(name)}`;
const valueId = (type: string, value: string): string => `value-${slug(type)}-${slug(value)}`;

function buildView(spec: CatalogSpec): CatalogView {
  const optionValues: CatalogSnapshot["option_values"] = [];
  const registerValue = (type: string, value: string): string => {
    const id = valueId(type, value);
    if (!optionValues.some((existing) => existing.id === id)) {
      optionValues.push({
        id,
        option_type_id: typeId(type),
        value,
        display_order: (optionValues.length + 1) * 10,
      });
    }
    return id;
  };
  for (const [type, values] of Object.entries(spec.presetValues ?? {})) {
    values.forEach((value) => registerValue(type, value));
  }

  const variants: CatalogSnapshot["variants"] = [];
  const links: CatalogSnapshot["variant_option_values"] = [];
  for (const product of spec.products) {
    product.variants.forEach((variant, index) => {
      const id = `${product.id}-v${index + 1}`;
      variants.push({
        id,
        product_id: product.id,
        sku: `SKU-${id}`,
        barcode: null,
        title_override: variant.title ?? null,
        search_keywords: variant.keywords ?? null,
        display_order: (index + 1) * 10,
        is_available: variant.available ?? true,
        available_quantity: variant.available === false ? 0 : 10,
      });
      for (const [type, value] of Object.entries(variant.options ?? {})) {
        links.push({
          variant_id: id,
          option_type_id: typeId(type),
          option_value_id: registerValue(type, value),
        });
      }
    });
  }

  return createCatalogView(
    createCatalogSnapshotFixture({
      brands: spec.brands.map((brand, index) => ({
        id: brand.id,
        name: brand.name,
        image_media_asset_id: null,
        image_public_id: null,
        image_secure_url: null,
        display_order: (index + 1) * 10,
      })),
      categories: spec.categories.map((category, index) => ({
        id: category.id,
        name: category.name,
        parent_id: category.parent ?? null,
        image_media_asset_id: null,
        image_public_id: null,
        image_secure_url: null,
        display_order: (index + 1) * 10,
      })),
      products: spec.products.map((product, index) => ({
        id: product.id,
        name: product.name,
        brand_id: product.brand,
        cover_media_asset_id: null,
        cover_public_id: null,
        cover_secure_url: null,
        short_description: null,
        search_keywords: null,
        display_order: (index + 1) * 10,
        is_featured: false,
      })),
      product_categories: spec.products.map((product) => ({
        product_id: product.id,
        category_id: product.category,
      })),
      option_types: spec.optionTypes.map((name, index) => ({
        id: typeId(name),
        name,
        display_order: (index + 1) * 10,
      })),
      option_values: optionValues,
      variants,
      variant_option_values: links,
      variant_media: [],
    }),
  );
}

const flavorVariants = (prefix: string, count: number, shared: string[] = []): VariantSpec[] => [
  ...shared.map((flavor) => ({ options: { Flavor: flavor } })),
  ...Array.from({ length: count }, (_, index) => ({
    options: { Flavor: `${prefix} ${index + 1}` },
  })),
];

const ROOT = {
  vapes: "cat-vapes",
  pouches: "cat-pouches",
  botanical: "cat-botanical",
  liquid: "cat-liquid",
} as const;
const CHILD = {
  disposable: "cat-disposable",
  capsules: "cat-capsules",
  powders: "cat-powders",
} as const;
const BRAND = {
  cloud: "brand-cloud",
  puff: "brand-puff",
  zest: "brand-zest",
  velo: "brand-velo",
  zyn: "brand-zyn",
  nordic: "brand-nordic",
  herbal: "brand-herbal",
} as const;
const FLAVOR = typeId("Flavor");
const STRENGTH = typeId("Strength");

const vape = (
  index: number,
  brand: string,
  variants: VariantSpec[],
  name = `Vape ${index}`,
): ProductSpec => ({
  id: `vape-${index}`,
  name,
  brand,
  category: CHILD.disposable,
  variants,
});

function storeCatalog(): CatalogView {
  return buildView({
    brands: [
      { id: BRAND.cloud, name: "Cloud Co" },
      { id: BRAND.puff, name: "Puff Lab" },
      { id: BRAND.zest, name: "Zest" },
      { id: BRAND.velo, name: "Velo" },
      { id: BRAND.zyn, name: "Zyn" },
      { id: BRAND.nordic, name: "Nordic" },
      { id: BRAND.herbal, name: "Herbal Hub" },
    ],
    categories: [
      { id: ROOT.vapes, name: "Vape Products" },
      { id: CHILD.disposable, name: "Disposable Vapes", parent: ROOT.vapes },
      { id: ROOT.pouches, name: "Nicotine Pouches" },
      { id: ROOT.botanical, name: "Botanical Supplements" },
      { id: CHILD.capsules, name: "Capsules", parent: ROOT.botanical },
      { id: CHILD.powders, name: "Powders", parent: ROOT.botanical },
      { id: ROOT.liquid, name: "Liquid Supplements" },
    ],
    optionTypes: ["Flavor", "Strength"],
    presetValues: { Strength: ["3", "9", "15"] },
    products: [
      vape(1, BRAND.cloud, [
        ...flavorVariants("Cloud One", 8, ["Cool mint", "BLUE RAZZ ICY"]),
        { options: { Flavor: "Cloud One sold out" }, available: false },
      ]),
      vape(2, BRAND.cloud, flavorVariants("Cloud Two", 8, ["Cool mint", "Blue Razz Ice"])),
      vape(3, BRAND.puff, flavorVariants("Puff Three", 7, ["Cool mint", "Watermelon"])),
      vape(4, BRAND.puff, flavorVariants("Puff Four", 7, ["Cool mint"])),
      vape(5, BRAND.puff, flavorVariants("Puff Five", 7, ["Watermelon"])),
      vape(6, BRAND.zest, flavorVariants("Zest Six", 7, ["Cool mint"])),
      vape(7, BRAND.zest, flavorVariants("Zest Seven", 7, ["Cool mint", "Watermelon"])),
      vape(8, BRAND.zest, flavorVariants("Zest Eight", 7)),
      vape(9, BRAND.zest, [
        ...flavorVariants("Zest Nine", 7, ["Cool mint"]),
        { title: "Clear Green" },
      ]),
      vape(
        10,
        BRAND.zest,
        [
          { options: { Flavor: "Cool mint" }, available: false },
          { options: { Flavor: "Zest Ten 1" }, available: false },
        ],
        "Sold Out Stick",
      ),
      {
        id: "pouch-1",
        name: "Velo Pouch",
        brand: BRAND.velo,
        category: ROOT.pouches,
        variants: [
          { options: { Flavor: "Mint", Strength: "9" } },
          { options: { Flavor: "Berry", Strength: "9" }, keywords: ["fruity"] },
        ],
      },
      {
        id: "pouch-2",
        name: "Zyn Pouch",
        brand: BRAND.zyn,
        category: ROOT.pouches,
        variants: [
          { options: { Flavor: "Mint", Strength: "15" } },
          { options: { Flavor: "Berry", Strength: "15" } },
        ],
      },
      {
        id: "pouch-3",
        name: "Nordic Pouch",
        brand: BRAND.nordic,
        category: ROOT.pouches,
        variants: [
          { options: { Flavor: "Mint", Strength: "3" } },
          { options: { Flavor: "Citrus", Strength: "3" }, available: false },
        ],
      },
      {
        id: "calm-leaf",
        name: "Calm Leaf",
        brand: BRAND.herbal,
        category: CHILD.capsules,
        variants: [{ title: "Clear Green" }, { title: "Red Vein" }],
      },
      {
        id: "root-powder",
        name: "Root Powder",
        brand: null,
        category: CHILD.powders,
        variants: [{ options: { Flavor: "Unflavored" } }],
      },
      {
        id: "focus-drops",
        name: "Focus Drops",
        brand: BRAND.herbal,
        category: ROOT.liquid,
        variants: [{}],
      },
    ],
  });
}

const category = (categoryId: string): GuidedAnswer => ({ kind: "category", categoryId });
const brand = (brandId: string): GuidedAnswer => ({ kind: "brand", brandId });
const option = (type: string, value: string): GuidedAnswer => ({
  kind: "option",
  typeId: typeId(type),
  valueId: valueId(type, value),
});
const skip = (dimension: DimensionKey): GuidedAnswer => ({
  kind: "skip",
  dimension,
});

const productIds = (result: ReturnType<typeof deriveGuidedResult>): string[] =>
  result.products.map((item) => item.product.id);
const choicesOf = (question: ReturnType<typeof deriveGuidedResult>["question"]) =>
  question !== null && question.kind !== "text"
    ? question.choices.map((choice) => [choice.label, choice.productCount])
    : null;
const vapeIds = Array.from({ length: 9 }, (_, index) => `vape-${index + 1}`);

describe("guided discovery", () => {
  const view = storeCatalog();

  describe("questions", () => {
    it("asks for the root category first, counting only products with an available variant", () => {
      const result = deriveGuidedResult(view, [], "");

      expect(result.question).toMatchObject({
        kind: "category",
        key: "category",
        title: "What are you shopping for?",
        typeId: null,
      });
      expect(choicesOf(result.question)).toEqual([
        ["Vape Products", 9],
        ["Nicotine Pouches", 3],
        ["Botanical Supplements", 2],
        ["Liquid Supplements", 1],
      ]);
      expect(result.baseCount).toBe(15);
      expect(productIds(result)).not.toContain("vape-10");
      expect(result.termApplied).toBe(false);
      expect(result.noTextMatches).toBe(false);
    });

    it("splits vapes by brand because their flavours have too many values to tap", () => {
      const result = deriveGuidedResult(view, [category(ROOT.vapes)], "");

      expect(productIds(result)).toEqual(vapeIds);
      expect(result.question).toMatchObject({
        kind: "brand",
        key: "brand",
        title: "Which brand?",
        typeId: null,
      });
      // The sold-out Zest product does not inflate the Zest bucket.
      expect(choicesOf(result.question)).toEqual([
        ["Cloud Co", 2],
        ["Puff Lab", 3],
        ["Zest", 4],
      ]);
      expect(result.question?.kind !== "text" && result.question?.choices[0]?.id).toBe(BRAND.cloud);
    });

    it("splits pouches by their fixed per-product strength, in option display order", () => {
      const result = deriveGuidedResult(view, [category(ROOT.pouches)], "");

      // Brand ties strength (largest bucket 1); option types win the tie.
      // Flavor is not eligible: Mint is offered by every pouch.
      expect(result.question).toMatchObject({
        kind: "option",
        key: `option:${STRENGTH}`,
        title: "Which strength?",
        typeId: STRENGTH,
      });
      expect(choicesOf(result.question)).toEqual([
        ["3", 1],
        ["9", 1],
        ["15", 1],
      ]);
      expect(result.question?.kind !== "text" && result.question?.choices[0]?.id).toBe(
        valueId("Strength", "3"),
      );
    });

    it("chooses the tap dimension whose largest bucket is smallest", () => {
      const products = (brands: string[], sizes: string[]): ProductSpec[] =>
        brands.map((brandId, index) => ({
          id: `p-${index + 1}`,
          name: `P ${index + 1}`,
          brand: brandId,
          category: "cat-a",
          variants: [{ options: { Size: sizes[index] ?? "S" } }],
        }));
      const spec = (brands: string[], sizes: string[]): CatalogSpec => ({
        brands: [
          { id: "b-1", name: "One" },
          { id: "b-2", name: "Two" },
          { id: "b-3", name: "Three" },
          { id: "b-4", name: "Four" },
        ],
        categories: [{ id: "cat-a", name: "A" }],
        optionTypes: ["Size"],
        products: products(brands, sizes),
      });

      const sizeWins = buildView(spec(["b-1", "b-1", "b-1", "b-2"], ["S", "S", "L", "L"]));
      expect(deriveGuidedResult(sizeWins, [], "").question?.key).toBe(`option:${typeId("Size")}`);

      const brandWins = buildView(spec(["b-1", "b-2", "b-3", "b-4"], ["S", "S", "L", "L"]));
      expect(deriveGuidedResult(brandWins, [], "").question?.key).toBe("brand");
    });

    it("moves to the next dimension when one is skipped", () => {
      expect(deriveGuidedResult(view, [skip("category")], "").question?.key).toBe("brand");

      const pouchSkips = [category(ROOT.pouches), skip(`option:${STRENGTH}`)];
      const afterStrength = deriveGuidedResult(view, pouchSkips, "");
      expect(afterStrength.question?.key).toBe("brand");
      expect(choicesOf(afterStrength.question)).toEqual([
        ["Velo", 1],
        ["Zyn", 1],
        ["Nordic", 1],
      ]);

      const afterBrand = deriveGuidedResult(view, [...pouchSkips, skip("brand")], "");
      expect(afterBrand.question?.kind).toBe("text");
      expect(afterBrand.baseCount).toBe(3);
    });

    it("reaches the text step with suggestions when no tap dimension is eligible", () => {
      const result = deriveGuidedResult(view, [category(ROOT.vapes), brand(BRAND.zest)], "");

      expect(productIds(result)).toEqual(["vape-6", "vape-7", "vape-8", "vape-9"]);
      expect(result.question).toMatchObject({
        kind: "text",
        key: "text",
        title: "Anything specific?",
      });
      if (result.question?.kind !== "text") throw new Error("expected the text question");
      expect(result.question.suggestions[0]).toEqual({ label: "Cool mint", productCount: 3 });
      expect(result.question.suggestions[1]).toEqual({ label: "Watermelon", productCount: 1 });
      expect(result.question.suggestions).toHaveLength(8);
    });

    it("ranks suggestions by product count, then label, ignoring unavailable variants", () => {
      const result = deriveGuidedResult(
        view,
        [category(ROOT.pouches), skip(`option:${STRENGTH}`), skip("brand")],
        "",
      );

      if (result.question?.kind !== "text") throw new Error("expected the text question");
      expect(result.question.suggestions).toEqual([
        { label: "Mint", productCount: 3 },
        { label: "Berry", productCount: 2 },
        { label: "15", productCount: 1 },
        { label: "3", productCount: 1 },
        { label: "9", productCount: 1 },
      ]);
    });

    it("dedupes suggestion labels that differ only by case or accents", () => {
      const drift = buildView({
        brands: [],
        categories: [{ id: "cat-a", name: "A" }],
        optionTypes: ["Flavor", "Colour"],
        products: [
          {
            id: "p-1",
            name: "P1",
            brand: null,
            category: "cat-a",
            variants: [{ options: { Flavor: "Mint" } }],
          },
          {
            id: "p-2",
            name: "P2",
            brand: null,
            category: "cat-a",
            variants: [{ options: { Flavor: "MINT" } }],
          },
          {
            id: "p-3",
            name: "P3",
            brand: null,
            category: "cat-a",
            variants: [{ options: { Colour: "Mínt" } }],
          },
        ],
      });

      const result = deriveGuidedResult(drift, [skip(`option:${FLAVOR}`)], "");
      if (result.question?.kind !== "text") throw new Error("expected the text question");
      expect(result.question.suggestions).toEqual([{ label: "Mint", productCount: 3 }]);
    });

    it("asks nothing once a single candidate is left and no term is typed", () => {
      const result = deriveGuidedResult(view, [category(ROOT.liquid)], "");

      expect(productIds(result)).toEqual(["focus-drops"]);
      expect(result.question).toBeNull();
    });
  });

  describe("matching", () => {
    it("requires the same available variant to carry every option answer", () => {
      const trap = buildView({
        brands: [],
        categories: [{ id: "cat-a", name: "A" }],
        optionTypes: ["Flavor", "Strength"],
        products: [
          {
            id: "split",
            name: "Split",
            brand: null,
            category: "cat-a",
            variants: [
              { options: { Flavor: "Mint", Strength: "3mg" } },
              { options: { Flavor: "Berry", Strength: "6mg" } },
            ],
          },
          {
            id: "together",
            name: "Together",
            brand: null,
            category: "cat-a",
            variants: [
              { options: { Flavor: "Berry", Strength: "3mg" } },
              { options: { Flavor: "Mint", Strength: "6mg" } },
            ],
          },
        ],
      });

      const result = deriveGuidedResult(
        trap,
        [option("Flavor", "Mint"), option("Strength", "6mg")],
        "",
      );

      expect(result.products).toEqual([
        { product: trap.resolveProduct("together"), matchingVariantIds: ["together-v2"] },
      ]);
    });

    it("never counts unavailable variants", () => {
      const citrus = deriveGuidedResult(view, [option("Flavor", "Citrus")], "");
      expect(citrus.products).toEqual([]);
      expect(citrus.baseCount).toBe(0);

      const coolMint = deriveGuidedResult(view, [option("Flavor", "Cool mint")], "");
      expect(productIds(coolMint)).toEqual([
        "vape-1",
        "vape-2",
        "vape-3",
        "vape-4",
        "vape-6",
        "vape-7",
        "vape-9",
      ]);

      const vape1 = deriveGuidedResult(view, [category(ROOT.vapes)], "").products[0];
      expect(vape1?.matchingVariantIds).not.toContain("vape-1-v11");
      expect(vape1?.matchingVariantIds).toHaveLength(10);
    });

    it("matches a term against variant title overrides when a variant has no options", () => {
      const result = deriveGuidedResult(view, [], "clear green");

      expect(result.termApplied).toBe(true);
      expect(result.products).toEqual([
        { product: view.resolveProduct("vape-9"), matchingVariantIds: ["vape-9-v9"] },
        { product: view.resolveProduct("calm-leaf"), matchingVariantIds: ["calm-leaf-v1"] },
      ]);
      expect(result.baseCount).toBe(15);
      expect(result.question?.kind).toBe("text");
    });

    it("matches a term across spelling drift and against variant keywords", () => {
      const razz = deriveGuidedResult(view, [category(ROOT.vapes)], "Razz");
      expect(razz.products).toEqual([
        { product: view.resolveProduct("vape-1"), matchingVariantIds: ["vape-1-v2"] },
        { product: view.resolveProduct("vape-2"), matchingVariantIds: ["vape-2-v2"] },
      ]);
      expect(razz.baseCount).toBe(9);
      expect(razz.question?.kind).toBe("text");

      const fruity = deriveGuidedResult(view, [], "FRUITY");
      expect(fruity.products).toEqual([
        { product: view.resolveProduct("pouch-1"), matchingVariantIds: ["pouch-1-v2"] },
      ]);
    });

    it("applies the term to the same variant as the option answers", () => {
      const result = deriveGuidedResult(view, [option("Strength", "9")], "mint");

      expect(result.products).toEqual([
        { product: view.resolveProduct("pouch-1"), matchingVariantIds: ["pouch-1-v1"] },
      ]);
      expect(deriveGuidedResult(view, [option("Strength", "3")], "citrus").products).toEqual([]);
    });

    it("ignores a term shorter than two characters", () => {
      const result = deriveGuidedResult(view, [category(ROOT.pouches)], " z ");

      expect(result.termApplied).toBe(false);
      expect(productIds(result)).toEqual(["pouch-1", "pouch-2", "pouch-3"]);
      expect(result.question?.kind).toBe("option");
    });

    it("treats a term with no match as recoverable and keeps the text question", () => {
      const result = deriveGuidedResult(view, [category(ROOT.vapes)], "bubblegum");

      expect(result.products).toEqual([]);
      expect(result.baseCount).toBe(9);
      expect(result.termApplied).toBe(true);
      expect(result.noTextMatches).toBe(true);
      expect(result.question?.kind).toBe("text");

      expect(deriveGuidedResult(view, [option("Flavor", "Citrus")], "mint").noTextMatches).toBe(
        false,
      );
    });

    it("matches a term against the product and brand names, for every variant", () => {
      const byBrand = deriveGuidedResult(view, [category(ROOT.vapes)], "zest");
      expect(productIds(byBrand)).toEqual(["vape-6", "vape-7", "vape-8", "vape-9"]);

      const byName = deriveGuidedResult(view, [], "focus");
      expect(productIds(byName)).toEqual(["focus-drops"]);
      expect(byName.noTextMatches).toBe(false);
    });

    it("does not suggest values of an option type that is already answered", () => {
      const result = deriveGuidedResult(
        view,
        [category(ROOT.vapes), option("Flavor", "Cool mint"), skip("brand")],
        "",
      );
      expect(result.question?.kind).toBe("text");
      const labels =
        result.question?.kind === "text" ? result.question.suggestions.map((s) => s.label) : [];
      expect(labels).not.toContain("Cool mint");
    });

    it("keeps the text question while a term is applied even with one candidate", () => {
      const result = deriveGuidedResult(view, [category(ROOT.liquid)], "mint");

      expect(result.question?.kind).toBe("text");
      expect(result.products).toEqual([]);
      expect(result.noTextMatches).toBe(true);
    });
  });

  describe("changing answers", () => {
    it("widens the results when an answer is removed", () => {
      const answers = [category(ROOT.vapes), brand(BRAND.zest)];
      const narrowed = productIds(deriveGuidedResult(view, answers, ""));
      const remaining = removeAnswer(answers, 1);

      expect(remaining).toEqual([category(ROOT.vapes)]);
      expect(answers).toHaveLength(2);
      const widened = productIds(deriveGuidedResult(view, remaining, ""));
      expect(widened.length).toBeGreaterThan(narrowed.length);
      expect(widened).toEqual(expect.arrayContaining(narrowed));
    });

    it("offers a dimension's choices computed from the other answers", () => {
      const brandQuestion = questionForDimension(
        view,
        [category(ROOT.vapes), brand(BRAND.zest)],
        "brand",
      );
      expect(brandQuestion).toMatchObject({ kind: "brand", key: "brand", title: "Which brand?" });
      expect(choicesOf(brandQuestion)).toEqual([
        ["Cloud Co", 2],
        ["Puff Lab", 3],
        ["Zest", 4],
      ]);

      const strengthQuestion = questionForDimension(
        view,
        [category(ROOT.pouches), option("Strength", "9"), skip(`option:${STRENGTH}`)],
        `option:${STRENGTH}`,
      );
      expect(strengthQuestion).toMatchObject({ kind: "option", typeId: STRENGTH });
      expect(choicesOf(strengthQuestion)).toEqual([
        ["3", 1],
        ["9", 1],
        ["15", 1],
      ]);

      // Only one root still has a strength-9 product.
      expect(
        questionForDimension(view, [category(ROOT.pouches), option("Strength", "9")], "category"),
      ).toBeNull();
    });

    it("replaces an answer and drops only the later answers that would empty the results", () => {
      const answers = [
        category(ROOT.pouches),
        option("Strength", "9"),
        brand(BRAND.velo),
        option("Flavor", "Mint"),
        skip("brand"),
      ];

      const next = replaceAnswer(view, answers, 1, option("Strength", "15"));

      expect(next).toEqual([
        category(ROOT.pouches),
        option("Strength", "15"),
        option("Flavor", "Mint"),
        skip("brand"),
      ]);
      expect(next[0]).toBe(answers[0]);
      expect(productIds(deriveGuidedResult(view, next, ""))).toEqual(["pouch-2"]);
    });

    it("keeps earlier answers even when a replacement narrows to nothing", () => {
      const answers = [option("Flavor", "Berry"), category(ROOT.vapes)];

      expect(replaceAnswer(view, answers, 1, category(ROOT.pouches))).toEqual([
        option("Flavor", "Berry"),
        category(ROOT.pouches),
      ]);
    });

    it("labels answers from the current catalog", () => {
      expect(answerLabel(view, category(CHILD.disposable))).toBe("Disposable Vapes");
      expect(answerLabel(view, brand(BRAND.zyn))).toBe("Zyn");
      expect(answerLabel(view, option("Flavor", "BLUE RAZZ ICY"))).toBe("BLUE RAZZ ICY");
      expect(answerLabel(view, skip("brand"))).toBeNull();
      expect(answerLabel(view, brand("brand-gone"))).toBeNull();
    });
  });

  describe("catalog refresh", () => {
    it("leaves answers alone when they still lead to products", () => {
      const answers = [category(ROOT.pouches), skip("brand"), option("Strength", "9")];

      expect(reconcileGuidedAnswers(view, answers)).toEqual({ answers, changed: false });
    });

    it("drops unknown ids, then trailing answers until something matches", () => {
      const answers = [
        category(ROOT.pouches),
        brand("brand-gone"),
        { kind: "option", typeId: STRENGTH, valueId: "value-gone" } as const,
        skip("option:type-gone"),
        option("Flavor", "Berry"),
        skip("brand"),
        option("Strength", "3"),
      ];

      expect(reconcileGuidedAnswers(view, answers)).toEqual({
        answers: [category(ROOT.pouches), option("Flavor", "Berry"), skip("brand")],
        changed: true,
      });
    });

    it("drops an option value that moved to another type and an unknown category", () => {
      const answers: GuidedAnswer[] = [
        category("cat-gone"),
        { kind: "option", typeId: FLAVOR, valueId: valueId("Strength", "9") },
      ];

      expect(reconcileGuidedAnswers(view, answers)).toEqual({ answers: [], changed: true });
    });
  });

  describe("match hand-off", () => {
    it("round-trips option answers and a term with punctuation", () => {
      const term = "blue razz, ice. 50/50 %";
      const raw = serializeMatch(
        [
          category(ROOT.pouches),
          option("Flavor", "Mint"),
          skip("brand"),
          brand(BRAND.velo),
          option("Strength", "9"),
        ],
        term,
      );

      expect(raw).not.toBeNull();
      expect(raw?.split(",")).toHaveLength(3);
      expect(parseMatch(raw)).toEqual({
        options: [
          { typeId: FLAVOR, valueId: valueId("Flavor", "Mint") },
          { typeId: STRENGTH, valueId: valueId("Strength", "9") },
        ],
        term,
      });
    });

    it("passes nothing when there are no option answers or usable term", () => {
      expect(serializeMatch([category(ROOT.vapes), brand(BRAND.zest)], null)).toBeNull();
      expect(serializeMatch([category(ROOT.vapes)], " x ")).toBeNull();
      expect(parseMatch(serializeMatch([], "mint"))).toEqual({ options: [], term: "mint" });
    });

    it("ignores malformed entries", () => {
      expect(parseMatch(null)).toBeNull();
      expect(parseMatch(undefined)).toBeNull();
      expect(parseMatch("")).toBeNull();
      expect(parseMatch("garbage,o.,o.only,o..x,o.a.b.c,o.a b.c,t.%E0%A4%A,t.x,zz.q")).toBeNull();
      expect(parseMatch(`,,o.${FLAVOR}.value-flavor-mint,t.%E0%A4%A,t.mint`)).toEqual({
        options: [{ typeId: FLAVOR, valueId: "value-flavor-mint" }],
        term: "mint",
      });
    });

    it("lists a product's available variants matching the options and term, in order", () => {
      const vape1 = view.resolveProduct("vape-1");
      const pouch3 = view.resolveProduct("pouch-3");
      const calmLeaf = view.resolveProduct("calm-leaf");
      if (!vape1 || !pouch3 || !calmLeaf) throw new Error("fixture products missing");

      expect(
        matchingVariantIds(pouch3, {
          options: [{ typeId: FLAVOR, valueId: valueId("Flavor", "Citrus") }],
          term: null,
        }),
      ).toEqual([]);
      expect(matchingVariantIds(vape1, { options: [], term: "razz" })).toEqual(["vape-1-v2"]);
      expect(matchingVariantIds(vape1, { options: [], term: "sold out" })).toEqual([]);
      expect(matchingVariantIds(calmLeaf, { options: [], term: null })).toEqual([
        "calm-leaf-v1",
        "calm-leaf-v2",
      ]);
      expect(
        matchingVariantIds(pouch3, {
          options: [{ typeId: STRENGTH, valueId: valueId("Strength", "3") }],
          term: "MINT",
        }),
      ).toEqual(["pouch-3-v1"]);
    });
  });
});
