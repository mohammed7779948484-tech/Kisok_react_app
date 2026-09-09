import { renderWithProviders, screen } from "@/core/testing";

import type { CartLine } from "@/features/cart";

import { OrderLineRow } from "./order-line-row";

/**
 * lucide-react-native resolves (via the `react-native` condition) to an
 * untransformed ESM entry under jest-expo, so no test in this repo can
 * value-import it without a jest-config change. The row's runtime graph needs
 * exactly one lucide icon — ImageOff, AppImage's null-uri fallback — so one
 * stand-in keeps this a test of the row contract, not of lucide's renderer
 * (cart-item-row.test.tsx's precedent; the `CartLine` import above is
 * TYPE-ONLY, so the cart feature's own lucide graph never loads here).
 */
jest.mock("lucide-react-native", () => {
  // Null-rendering stand-ins need no import at all — a component returning
  // null references nothing from react or react-native — which keeps the
  // factory free of `require()` (tests lint with --max-warnings=0).
  const makeIcon = (name: string) => Object.assign(() => null, { displayName: name });
  return {
    ImageOff: makeIcon("ImageOff"),
  };
});

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
 * presentation the Checkout surfaces share (T08: the Order Review screen; the
 * success items and conflict join consume it later), so the contract that
 * matters is what the line snapshot renders (AC-02) and what assistive
 * technology perceives — plus what it deliberately does NOT render: no
 * controls, no prices (CartLine carries none, and the row keeps it that way).
 *
 * The real AppImage, Button-less layout, and Text are driven unmocked; only
 * lucide's icon renderer is stubbed (see the mock above). Conventions follow
 * cart-item-row.test.tsx — the editable row this one mirrors.
 */
describe("OrderLineRow", () => {
  it("renders the line snapshot read-only: image alt, product name, variant/options caption, and no controls at all", async () => {
    await renderWithProviders(<OrderLineRow line={cappuccinoLine} />);

    // AppImage renders the uri with the product name as its alt/label.
    expect(screen.getByLabelText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    // The caption is composed exactly as CartItemRow composes it, so the
    // review and the cart can never disagree about what a line is called:
    // variantLabel, then each selected option value label, dot-separated.
    expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
    // Read-only: no stepper, no remove, nothing interactive in the row — the
    // review must not grow a second editing surface next to the cart's.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("announces the quantity through the Quantity: N label convention", async () => {
    await renderWithProviders(<OrderLineRow line={cappuccinoLine} />);

    // The QuantityStepper precedent: an explicit `Quantity: N` label so a
    // screen reader says what the number is, not just a bare digit — the
    // review's rows stay as legible to assistive tech as the cart's.
    expect(screen.getByLabelText("Quantity: 2")).toBeOnTheScreen();
  });

  it("renders AppImage's fallback for a null imageUri: an accessible image labelled with the product name", async () => {
    await renderWithProviders(<OrderLineRow line={waterLine} />);

    // AppImage's documented null-uri behaviour: instead of the remote image
    // it renders a muted fallback tile with an explicit image role and the
    // alt as its label. The caption degenerates to the bare variantLabel.
    expect(screen.getByRole("image", { name: "Sparkling Water" })).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByText("500 ml Bottle")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
  });
});
