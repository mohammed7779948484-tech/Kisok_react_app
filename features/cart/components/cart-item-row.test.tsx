import { renderWithProviders, screen, userEvent } from "@/core/testing";

import type { CartLine } from "../model/cart-line.schema";
import { CartItemRow } from "./cart-item-row";

/**
 * lucide-react-native resolves (via the `react-native` condition) to an
 * untransformed ESM entry under jest-expo, so no test in this repo can
 * value-import it without a jest-config change. The icons are decorative
 * SVGs here — the row's accessible names come from the buttons'
 * `accessibilityLabel`s — so minimal stand-ins keep this a test of the row
 * contract, not of lucide's renderer. ImageOff is AppImage's fallback icon.
 */
jest.mock("lucide-react-native", () => {
  // Null-rendering stand-ins need no import at all — a component returning
  // null references nothing from react or react-native — which keeps the
  // factory free of `require()` (tests lint with --max-warnings=0).
  const makeIcon = (name: string) => Object.assign(() => null, { displayName: name });
  return {
    Minus: makeIcon("Minus"),
    Plus: makeIcon("Plus"),
    Trash2: makeIcon("Trash2"),
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

/** A populated line with an image and two ordered option selections. */
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
 * Behaviour and accessibility, not styling: the row is the per-line surface
 * shared by the quick sheet and the Full Cart screen, so the contract that
 * matters is what the line snapshot renders (AC-03), what its controls report
 * (AC-04), and what assistive technology perceives (AC-12).
 *
 * The real ConfirmDialog, AppImage, Button and Text are driven unmocked; only
 * lucide's icon renderer is stubbed (see the mock above). Conventions follow
 * components/ui/__tests__/button.test.tsx.
 */
describe("CartItemRow", () => {
  it("renders the line snapshot: image alt, product name, variant/options caption", async () => {
    await renderWithProviders(
      <CartItemRow line={cappuccinoLine} onSetQuantity={jest.fn()} onRemove={jest.fn()} />,
    );

    // AppImage renders the uri with the product name as its alt/label.
    expect(screen.getByLabelText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    // The caption is derived from the snapshot: variantLabel · option labels.
    expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
  });

  it("wires the stepper to the line's quantity and reports the next value upward", async () => {
    const onSetQuantity = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <CartItemRow line={cappuccinoLine} onSetQuantity={onSetQuantity} onRemove={jest.fn()} />,
    );

    expect(screen.getByLabelText("Quantity: 2")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    expect(onSetQuantity).toHaveBeenCalledWith(3);
  });

  it("removes only after confirmation: the button's name names the product, and confirm fires onRemove", async () => {
    const onRemove = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <CartItemRow line={cappuccinoLine} onSetQuantity={jest.fn()} onRemove={onRemove} />,
    );

    const remove = screen.getByRole("button", { name: "Remove Cappuccino" });
    expect(remove).toBeOnTheScreen();
    expect(screen.queryByRole("heading", { name: "Remove Cappuccino?" })).toBeNull();

    await user.press(remove);
    // The real ConfirmDialog is open, destructive, and names the product.
    expect(screen.getByRole("heading", { name: "Remove Cappuccino?" })).toBeOnTheScreen();
    expect(screen.getByText("Cappuccino will be taken out of the cart.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove" })).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("does not remove when the confirm dialog is cancelled", async () => {
    const onRemove = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <CartItemRow line={cappuccinoLine} onSetQuantity={jest.fn()} onRemove={onRemove} />,
    );

    await user.press(screen.getByRole("button", { name: "Remove Cappuccino" }));
    await user.press(screen.getByRole("button", { name: "Cancel" }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("disables the stepper and the remove control while locked", async () => {
    const onSetQuantity = jest.fn();
    const onRemove = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <CartItemRow
        line={cappuccinoLine}
        onSetQuantity={onSetQuantity}
        onRemove={onRemove}
        locked
      />,
    );

    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Cappuccino" })).toBeDisabled();

    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    await user.press(screen.getByRole("button", { name: "Remove Cappuccino" }));
    expect(onSetQuantity).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("disables the stepper and the remove control while pending", async () => {
    await renderWithProviders(
      <CartItemRow line={cappuccinoLine} onSetQuantity={jest.fn()} onRemove={jest.fn()} pending />,
    );

    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Cappuccino" })).toBeDisabled();
  });

  it("renders AppImage's fallback for a null imageUri: an accessible image labelled with the product name", async () => {
    await renderWithProviders(
      <CartItemRow line={waterLine} onSetQuantity={jest.fn()} onRemove={jest.fn()} />,
    );

    // AppImage's documented null-uri behaviour: instead of the remote image it
    // renders a muted fallback tile with an explicit image role and the alt as
    // its label. The caption degenerates to the bare variantLabel.
    expect(screen.getByRole("image", { name: "Sparkling Water" })).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByText("500 ml Bottle")).toBeOnTheScreen();
  });
});
