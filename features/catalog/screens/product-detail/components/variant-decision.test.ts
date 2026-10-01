import { createCatalogView } from "../../../model/catalog-view";
import {
  catalogFixtureIds,
  createCatalogSnapshotFixture,
} from "../../../model/catalog-snapshot.fixture";
import { deriveVariantDecision } from "./variant-decision";

function decisionFor(productId: string) {
  const product = createCatalogView(createCatalogSnapshotFixture()).resolveProduct(productId);
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
