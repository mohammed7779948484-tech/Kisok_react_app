import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { QuantityStepper } from "./quantity-stepper";

/**
 * Behaviour and accessibility, not styling: the stepper is used on shared
 * kiosk surfaces, so the contract that matters is what assistive technology
 * and a person standing at the tablet perceive — labelled increment and
 * decrement controls, an announced value, and bounds expressed as disabled
 * states rather than ignored taps.
 */
describe("QuantityStepper", () => {
  it("renders increment and decrement controls with accessible names", async () => {
    await renderWithProviders(<QuantityStepper value={3} onValueChange={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeOnTheScreen();
  });

  it("renders the value and labels it politely for screen readers", async () => {
    await renderWithProviders(<QuantityStepper value={3} onValueChange={jest.fn()} />);

    expect(screen.getByText("3")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 3")).toBeOnTheScreen();
    // AC-12: changes are announced politely, not assertively.
    expect(screen.getByLabelText("Quantity: 3").props.accessibilityLiveRegion).toBe("polite");
  });

  it("disables decrement at the default minimum of 1, and does not fire", async () => {
    const onValueChange = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(<QuantityStepper value={1} onValueChange={onValueChange} />);

    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase quantity" })).not.toBeDisabled();

    await user.press(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("disables increment at max — the default guard of 99 and a caller override", async () => {
    await renderWithProviders(<QuantityStepper value={99} onValueChange={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).not.toBeDisabled();

    await renderWithProviders(<QuantityStepper value={5} max={5} onValueChange={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).not.toBeDisabled();
  });

  it("disables both controls while the disabled prop is set, and neither fires", async () => {
    const onValueChange = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(<QuantityStepper value={3} disabled onValueChange={onValueChange} />);

    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();

    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    await user.press(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("fires onValueChange with the next value from each enabled button", async () => {
    const onValueChange = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(<QuantityStepper value={3} onValueChange={onValueChange} />);

    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    expect(onValueChange).toHaveBeenCalledWith(4);

    await user.press(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(onValueChange).toHaveBeenCalledWith(2);
  });

  it("respects a custom min: decrement is enabled at 1 and can reach 0", async () => {
    const onValueChange = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(<QuantityStepper value={1} min={0} onValueChange={onValueChange} />);

    expect(screen.getByRole("button", { name: "Decrease quantity" })).not.toBeDisabled();

    await user.press(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(onValueChange).toHaveBeenCalledWith(0);
  });

  it("fails safe on a non-finite value: renders the min, disables decrement, emits only in-bounds values (R-T06-01)", async () => {
    const onValueChange = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(<QuantityStepper value={Number.NaN} onValueChange={onValueChange} />);

    // NaN must not reach the display or the buttons: the control behaves as
    // though the value were the min, mirroring the domain layer's fail-safe.
    expect(screen.getByText("1")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();

    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(2);
  });

  it("leaves room only for the rest of the line cap when units are already reserved", async () => {
    await renderWithProviders(
      <QuantityStepper value={9} reserved={90} onValueChange={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();

    await renderWithProviders(
      <QuantityStepper value={9} reserved={90} max={50} onValueChange={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
  });
});
