import { createCatalogView } from "../../../model/catalog-view";
import {
  catalogFixtureIds,
  createCatalogSnapshotFixture,
} from "../../../model/catalog-snapshot.fixture";
import { browseOrder, deriveVariantDecision, type OptionChoice } from "./variant-decision";

function decisionFor(productId: string, snapshot = createCatalogSnapshotFixture()) {
  const product = createCatalogView(snapshot).resolveProduct(productId);
  if (!product) throw new Error(`fixture product ${productId} is missing`);
  return deriveVariantDecision(product.variants);
}

describe("deriveVariantDecision", () => {
  it("offers every variation as a choice when several things vary", () => {
    const decision = decisionFor(catalogFixtureIds.products.coffee);

    expect(decision.mode).toBe("variations");
    expect(decision.choices.map((choice) => choice.label)).toEqual([
      "Signature roast",
      "Color: Rouge · Size: Lárge",
    ]);
  });

  it("never repeats a choice's label as its details line", () => {
    // A variant without a title override is labelled by its option pairs; the
    // details line would say exactly the same thing again, on screen and to a
    // screen reader.
    const decision = decisionFor(catalogFixtureIds.products.coffee);

    for (const choice of decision.choices) {
      expect(choice.details).not.toBe(choice.label);
    }
  });

  it("treats a single variant as already chosen", () => {
    const decision = decisionFor(catalogFixtureIds.products.tote);

    expect(decision.mode).toBe("single");
    expect(decision.choices).toHaveLength(1);
  });
});

const FLAVOR_PRODUCT = "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0";
const FLAVOR_TYPE = "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3";
const idFor = (prefix: string, index: number) =>
  `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;

/** One Flavor dimension with `count` values — the real catalog's dominant shape. */
function flavorSnapshot(count: number) {
  const base = createCatalogSnapshotFixture();
  const indexes = Array.from({ length: count }, (_, index) => index);
  return createCatalogSnapshotFixture({
    products: [
      ...base.products,
      {
        id: FLAVOR_PRODUCT,
        name: "Cloud Vape",
        brand_id: null,
        cover_media_asset_id: null,
        cover_public_id: null,
        cover_secure_url: null,
        short_description: null,
        search_keywords: null,
        display_order: 50,
        is_featured: false,
      },
    ],
    option_types: [...base.option_types, { id: FLAVOR_TYPE, name: "Flavor", display_order: 30 }],
    option_values: [
      ...base.option_values,
      ...indexes.map((index) => ({
        id: idFor("f2000000", index),
        option_type_id: FLAVOR_TYPE,
        value: `Flavor ${index + 1}`,
        display_order: index + 1,
      })),
    ],
    variants: [
      ...base.variants,
      ...indexes.map((index) => ({
        id: idFor("f1000000", index),
        product_id: FLAVOR_PRODUCT,
        sku: `SKU-${index}`,
        barcode: null,
        title_override: null,
        search_keywords: null,
        display_order: index + 1,
        is_available: true,
        available_quantity: 20,
      })),
    ],
    variant_option_values: [
      ...base.variant_option_values,
      ...indexes.map((index) => ({
        variant_id: idFor("f1000000", index),
        option_type_id: FLAVOR_TYPE,
        option_value_id: idFor("f2000000", index),
      })),
    ],
  });
}

describe("deriveVariantDecision — large sets", () => {
  it.each([
    [8, false],
    [30, true],
  ])(
    "invites browsing all %i flavors beyond the six-choice preview (searchable: %s)",
    (count, searchable) => {
      const decision = decisionFor(FLAVOR_PRODUCT, flavorSnapshot(count));

      expect(decision.mode).toBe("dimension");
      expect(decision.hasMore).toBe(true);
      expect(decision.searchable).toBe(searchable);
      expect(decision.context).toBe(`Start with 6 visible flavors, or browse all ${count}.`);
    },
  );

  it("still says every choice is shown when there are six or fewer", () => {
    const decision = decisionFor(FLAVOR_PRODUCT, flavorSnapshot(5));

    expect(decision.hasMore).toBe(false);
    expect(decision.context).toBe("All 5 flavors are shown here.");
  });
});

describe("browseOrder", () => {
  const choice = (id: string, isAvailable: boolean) => ({ id, isAvailable }) as OptionChoice;

  it("lists available choices first, otherwise keeping the store's order", () => {
    const choices = [
      choice("a", false),
      choice("b", true),
      choice("c", false),
      choice("d", true),
      choice("e", true),
    ];

    expect(browseOrder(choices).map((item) => item.id)).toEqual(["b", "d", "e", "a", "c"]);
    // A pure ordering: the input is untouched.
    expect(choices.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});
