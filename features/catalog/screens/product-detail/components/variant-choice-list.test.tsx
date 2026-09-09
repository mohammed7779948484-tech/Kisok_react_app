import { renderWithProviders, screen, userEvent } from "@/core/testing";

import {
  catalogFixtureIds,
  createCatalogSnapshotFixture,
} from "../../../model/catalog-snapshot.fixture";
import type {
  CatalogProduct,
  CatalogSnapshot,
  CatalogVariant,
} from "../../../model/catalog-snapshot.schema";
import { createCatalogView, type CatalogVariantView } from "../../../model/catalog-view";

import { VariantChoiceList } from "./variant-choice-list";

/**
 * Behaviour for the screen-local Variant Choice List (AC-07, Design decision 9).
 *
 * The component is PRESENTATIONAL: it receives the model's derived variants,
 * the selected id and its callback as props and reports interactions upward —
 * no fetching, no store, no router. That is what these tests pin: everything on
 * screen comes from the view model's derived `label`/`options` (consumed
 * as-is, never re-derived), and every interaction is reported through the
 * callback.
 *
 * The fixtures come from the REAL projection (`createCatalogView` over a
 * snapshot), not hand-built literals, so the labels tested here are exactly
 * what the model derives: title_override, ordered "Type: value" pairs, and the
 * neutral ordered fallback. One appended product carries all three forms —
 * including a variant with BOTH a `title_override` and ordered options, which
 * is the only case where the ordered option detail line is supplementary
 * rather than the label itself.
 *
 * It renders plain buttons (no FlashList, no images), so it needs neither the
 * API-seam mock, nor the router mock, nor fake timers — which is itself part of
 * the presentational-purity proof: nothing else is required to render it.
 */
const productId = "6b6b6b6b-6b6b-46b6-8b6b-6b6b6b6b6b6b";

const variantIds = {
  /** title_override AND ordered options — the supplementary-detail case. */
  giftSet: "8b8b8b8b-8b8b-48b8-88b8-8b8b8b8b8b8b",
  /** ordered options only — the label IS the options. */
  optionsOnly: "8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d",
  /** neither — the neutral ordered fallback, unavailable. */
  neutral: "8f8f8f8f-8f8f-48f8-88f8-8f8f8f8f8f8f",
} as const;

function fixtureVariants(): CatalogVariantView[] {
  const base = createCatalogSnapshotFixture();
  const product: CatalogProduct = {
    id: productId,
    name: "Choice Fixture Product",
    brand_id: null,
    cover_media_asset_id: null,
    cover_public_id: null,
    cover_secure_url: null,
    short_description: null,
    search_keywords: null,
    display_order: 90,
    is_featured: false,
  };
  const variants: CatalogVariant[] = [
    {
      id: variantIds.giftSet,
      product_id: productId,
      sku: "SECRET-SKU-CHOICE-1",
      barcode: null,
      title_override: "Gift Set Edition",
      search_keywords: null,
      display_order: 10,
      is_available: true,
    },
    {
      id: variantIds.optionsOnly,
      product_id: productId,
      sku: "SECRET-SKU-CHOICE-2",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 20,
      is_available: false,
    },
    {
      id: variantIds.neutral,
      product_id: productId,
      sku: "SECRET-SKU-CHOICE-3",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 30,
      is_available: false,
    },
  ];
  const snapshot: CatalogSnapshot = createCatalogSnapshotFixture({
    products: [...base.products, product],
    variants: [...base.variants, ...variants],
    variant_option_values: [
      ...base.variant_option_values,
      {
        variant_id: variantIds.giftSet,
        option_type_id: catalogFixtureIds.optionTypes.color,
        option_value_id: catalogFixtureIds.optionValues.rouge,
      },
      {
        variant_id: variantIds.giftSet,
        option_type_id: catalogFixtureIds.optionTypes.size,
        option_value_id: catalogFixtureIds.optionValues.large,
      },
      {
        variant_id: variantIds.optionsOnly,
        option_type_id: catalogFixtureIds.optionTypes.color,
        option_value_id: catalogFixtureIds.optionValues.rouge,
      },
      {
        variant_id: variantIds.optionsOnly,
        option_type_id: catalogFixtureIds.optionTypes.size,
        option_value_id: catalogFixtureIds.optionValues.large,
      },
    ],
  });

  const view = createCatalogView(snapshot);
  const resolved = view.resolveProduct(productId);
  if (resolved === undefined) {
    throw new Error("fixture product was not projected into the view");
  }

  return resolved.variants;
}

describe("VariantChoiceList", () => {
  it("renders one entry per variant with the model's labels and textual availability", async () => {
    await renderWithProviders(
      <VariantChoiceList
        variants={fixtureVariants()}
        selectedVariantId={variantIds.giftSet}
        onSelectVariant={jest.fn()}
      />,
    );

    expect(screen.getByText("Choose a variant")).toBeOnTheScreen();

    // Every entry is a named, touch-sized button whose accessible name pairs
    // the model's derived label with the variant's words-only availability —
    // and, on a title_override variant, with the ordered option pairs the
    // visible detail line shows, so the name matches what is on screen.
    const entries = screen.getAllByRole("button", {
      name: /^(Gift Set Edition|Color: Rouge, Size: Lárge|Option 3),/,
    });
    expect(entries.map((entry) => entry.props.accessibilityLabel)).toEqual([
      "Gift Set Edition, Color: Rouge · Size: Lárge, Available",
      "Color: Rouge, Size: Lárge, Out of stock",
      "Option 3, Out of stock",
    ]);

    // The words themselves are visible — availability is never colour alone.
    expect(screen.getByText("Available")).toBeOnTheScreen();
    expect(screen.getAllByText("Out of stock")).toHaveLength(2);
  });

  it("renders the ordered option detail for a title-override variant and only there", async () => {
    await renderWithProviders(
      <VariantChoiceList
        variants={fixtureVariants()}
        selectedVariantId={variantIds.giftSet}
        onSelectVariant={jest.fn()}
      />,
    );

    // A title_override hides the options behind its label, so the ordered
    // option pairs render as a detail line: "Type: value" labels in backend
    // order, joined readably.
    expect(screen.getByText("Color: Rouge · Size: Lárge")).toBeOnTheScreen();

    // For the options-only variant the label ALREADY IS the ordered option
    // pairs ("Color: Rouge, Size: Lárge" — asserted in the first test), so no
    // duplicated detail line renders: getAllByText would find two if the
    // component repeated the pairs beneath the options-derived label.
    expect(screen.getAllByText("Color: Rouge · Size: Lárge")).toHaveLength(1);
  });

  it("marks the selected variant and only it", async () => {
    await renderWithProviders(
      <VariantChoiceList
        variants={fixtureVariants()}
        selectedVariantId={variantIds.optionsOnly}
        onSelectVariant={jest.fn()}
      />,
    );

    // Selection is announced on the entry (aria-selected) and mirrored
    // visually by the primary/ghost variants — never colour alone. The
    // override entry's name carries its ordered pairs; the options-only and
    // neutral entries do not (their labels are the whole composition).
    expect(
      screen.getByRole("button", {
        name: "Color: Rouge, Size: Lárge, Out of stock",
        selected: true,
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", {
        name: "Gift Set Edition, Color: Rouge · Size: Lárge, Available",
        selected: false,
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Option 3, Out of stock", selected: false }),
    ).toBeOnTheScreen();
  });

  it("reports the chosen variant id when an entry is pressed", async () => {
    const onSelectVariant = jest.fn();
    const user = userEvent.setup();

    await renderWithProviders(
      <VariantChoiceList
        variants={fixtureVariants()}
        selectedVariantId={variantIds.giftSet}
        onSelectVariant={onSelectVariant}
      />,
    );

    // Pressing the already-selected entry reports the same id again — the
    // owning screen owns what that means (an idempotent re-selection).
    await user.press(
      screen.getByRole("button", {
        name: "Gift Set Edition, Color: Rouge · Size: Lárge, Available",
      }),
    );

    expect(onSelectVariant).toHaveBeenCalledTimes(1);
    expect(onSelectVariant).toHaveBeenCalledWith(variantIds.giftSet);
  });

  it("keeps unavailable variants selectable for inspection", async () => {
    const onSelectVariant = jest.fn();
    const user = userEvent.setup();

    await renderWithProviders(
      <VariantChoiceList
        variants={fixtureVariants()}
        selectedVariantId={variantIds.giftSet}
        onSelectVariant={onSelectVariant}
      />,
    );

    // Inspection only (Design decision 9): unavailable entries stay pressable
    // and still report their id — never disabled, never a Cart action.
    await user.press(
      screen.getByRole("button", { name: "Color: Rouge, Size: Lárge, Out of stock" }),
    );
    await user.press(screen.getByRole("button", { name: "Option 3, Out of stock" }));

    expect(onSelectVariant).toHaveBeenCalledTimes(2);
    expect(onSelectVariant).toHaveBeenNthCalledWith(1, variantIds.optionsOnly);
    expect(onSelectVariant).toHaveBeenNthCalledWith(2, variantIds.neutral);
  });

  it("follows new props on re-render — presentational, never its own data source", async () => {
    // A controlled component: the entries on screen are a projection of the
    // props, so different props must produce a different entry set and a
    // different selection, without any internal fetching or caching.
    const firstVariants = fixtureVariants();

    await renderWithProviders(
      <VariantChoiceList
        variants={firstVariants}
        selectedVariantId={variantIds.giftSet}
        onSelectVariant={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Gift Set Edition, Color: Rouge · Size: Lárge, Available",
      }),
    ).toBeOnTheScreen();

    // A single-variant product — the "Standard option" neutral fallback shape.
    const neutralVariant = firstVariants.find((variant) => variant.id === variantIds.neutral);
    if (neutralVariant === undefined) {
      throw new Error("fixture variants were not projected into the view");
    }
    const singleVariantId = "91919191-9191-4919-8919-919191919191";
    const singleVariant: CatalogVariantView[] = [
      {
        ...neutralVariant,
        id: singleVariantId,
        label: "Standard option",
        title_override: null,
        options: [],
      },
    ];

    await renderWithProviders(
      <VariantChoiceList
        variants={singleVariant}
        selectedVariantId={singleVariantId}
        onSelectVariant={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Standard option, Out of stock", selected: true }),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", {
        name: "Gift Set Edition, Color: Rouge · Size: Lárge, Available",
      }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Color: Rouge/ })).toBeNull();
  });
});
