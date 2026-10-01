import { renderWithProviders, screen } from "@/core/testing";

import { Text } from "@/design-system";
import type { CartLine } from "@/features/cart";

import { OrderLineRow } from "./order-line-row";

const sizeSelection = {
  optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
  optionValueId: "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
  optionValueLabel: "Large",
};

const milkSelection = {
  optionTypeId: "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d",
  optionValueId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  optionValueLabel: "Oat Milk",
};

/**
 * A populated line with an image and two ordered option selections. The lineId
 * is the identity the cart rules derive for this selection (variantId plus the
 * sorted optionValueIds), so the fixture is a CartLine a real cart would hold.
 */
const cappuccinoLine: CartLine = {
  lineId:
    "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f|1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d|e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
  variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Hot",
  optionSelections: [sizeSelection, milkSelection],
  imageUri: "https://images.example.com/products/cappuccino.jpg",
  quantity: 2,
};

/** A plain line: no options, no image — exercises AppImage's fallback. */
const waterLine: CartLine = {
  lineId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  variantId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 1,
};

/**
 * Behaviour and accessibility, not styling: the row is the read-only line
 * presentation the Checkout surfaces share (the conflict/failure status, the
 * success summary), so the contract that matters is what the line snapshot
 * renders and what assistive technology perceives — plus what it
 * deliberately does NOT render: no controls, no prices.
 */
describe("OrderLineRow", () => {
  it("renders the line snapshot read-only: product name, variant/options caption, and no controls at all", async () => {
    await renderWithProviders(<OrderLineRow line={cappuccinoLine} />);

    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    // The caption is composed exactly as the cart composes it, so the order
    // and the cart can never disagree about what a line is called:
    // variantLabel, then each selected option value label, dot-separated.
    expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
    // Read-only: nothing interactive in the row.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the product image decorative — the title beside it already names the line", async () => {
    await renderWithProviders(<OrderLineRow line={cappuccinoLine} />);

    // A labelled image would make a screen reader announce the product twice.
    expect(screen.queryByRole("image", { name: "Cappuccino" })).toBeNull();
    expect(screen.queryByLabelText("Cappuccino")).toBeNull();
  });

  it("announces the quantity through an explicit 'Quantity N' label", async () => {
    await renderWithProviders(<OrderLineRow line={cappuccinoLine} />);

    // A screen reader says what the number is, not just a bare "×2".
    expect(screen.getByLabelText("Quantity 2")).toBeOnTheScreen();
  });

  it("renders the image fallback for a null imageUri and a bare variant caption", async () => {
    await renderWithProviders(<OrderLineRow line={waterLine} />);

    // The fallback tile captions itself with the product name, and the row
    // title repeats it; the caption degenerates to the bare variantLabel.
    expect(screen.getAllByText("Sparkling Water")).toHaveLength(2);
    expect(screen.getByText("500 ml Bottle")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity 1")).toBeOnTheScreen();
  });

  it("replaces the quantity figure with the trailing content when given", async () => {
    await renderWithProviders(
      <OrderLineRow line={cappuccinoLine} trailing={<Text>1 available</Text>} />,
    );

    expect(screen.getByText("1 available")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Quantity 2")).toBeNull();
  });
});
