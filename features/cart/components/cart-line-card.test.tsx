import { Text } from "react-native";

import { renderWithProviders, screen, userEvent } from "@/core/testing";

import type { CartLine } from "../model/cart-line.schema";
import { CartLineCard } from "./cart-line-card";

const cappuccinoLine: CartLine = {
  lineId:
    "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f|1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d|e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
  variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Hot",
  optionSelections: [
    {
      optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
      optionValueId: "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
      optionValueLabel: "Large",
    },
    {
      optionTypeId: "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d",
      optionValueId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      optionValueLabel: "Oat Milk",
    },
  ],
  imageUri: "https://images.example.com/products/cappuccino.jpg",
  quantity: 2,
};

async function renderCard(props: Partial<React.ComponentProps<typeof CartLineCard>> = {}) {
  const onSetQuantity = jest.fn();
  const onRemove = jest.fn();
  await renderWithProviders(
    <CartLineCard
      line={cappuccinoLine}
      onSetQuantity={onSetQuantity}
      onRemove={onRemove}
      {...props}
    />,
  );
  return { onSetQuantity, onRemove };
}

/**
 * CartLineCard is presentational: it shows one selection and reports the two
 * things a customer does with it — change the quantity, take it out.
 */
describe("CartLineCard", () => {
  it("shows the product and its options, with accessible controls", async () => {
    await renderCard();

    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 2")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove Cappuccino" })).toBeOnTheScreen();
  });

  it("reports the next quantity for this line from each stepper button", async () => {
    const { onSetQuantity } = await renderCard();
    const user = userEvent.setup();

    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    expect(onSetQuantity).toHaveBeenLastCalledWith(cappuccinoLine.lineId, 3);

    await user.press(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(onSetQuantity).toHaveBeenLastCalledWith(cappuccinoLine.lineId, 1);
  });

  it("keeps the quantity inside the line bounds: no decrement at 1, no increment at 99", async () => {
    const atMin = await renderCard({ line: { ...cappuccinoLine, quantity: 1 } });
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase quantity" })).not.toBeDisabled();
    await userEvent.setup().press(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(atMin.onSetQuantity).not.toHaveBeenCalled();

    const atMax = await renderCard({ line: { ...cappuccinoLine, quantity: 99 } });
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).not.toBeDisabled();
    await userEvent.setup().press(screen.getByRole("button", { name: "Increase quantity" }));
    expect(atMax.onSetQuantity).not.toHaveBeenCalled();
  });

  it("reports the whole line on remove, so the caller can offer an undo", async () => {
    const { onRemove, onSetQuantity } = await renderCard();

    await userEvent.setup().press(screen.getByRole("button", { name: "Remove Cappuccino" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(cappuccinoLine);
    expect(onSetQuantity).not.toHaveBeenCalled();
  });

  it("disables every control while the cart is locked, and none of them reports", async () => {
    const { onRemove, onSetQuantity } = await renderCard({ disabled: true });
    const user = userEvent.setup();

    const controls = ["Increase quantity", "Decrease quantity", "Remove Cappuccino"];
    for (const name of controls) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
      await user.press(screen.getByRole("button", { name }));
    }
    expect(onSetQuantity).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("shows a caller's note under the name", async () => {
    await renderCard({ note: <Text>Only 1 left</Text>, compact: true });

    expect(screen.getByText("Only 1 left")).toBeOnTheScreen();
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
  });
});
