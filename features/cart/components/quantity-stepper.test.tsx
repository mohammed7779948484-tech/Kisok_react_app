import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { QuantityStepper } from "./quantity-stepper";

/**
 * lucide-react-native resolves (via the `react-native` condition) to an
 * untransformed ESM entry under jest-expo, so no test in this repo can
 * value-import it without a jest-config change. The icons are decorative
 * SVGs here — the stepper's accessible names come from the buttons'
 * `accessibilityLabel`s — so minimal stand-ins keep this a test of the
 * stepper contract, not of lucide's renderer.
 */
jest.mock("lucide-react-native", () => {
  // Null-rendering stand-ins need no import at all — a component returning
  // null references nothing from react or react-native — which keeps the
  // factory free of `require()` (tests lint with --max-warnings=0).
  const makeIcon = (name: string) => Object.assign(() => null, { displayName: name });
  return { Minus: makeIcon("Minus"), Plus: makeIcon("Plus") };
});

/**
 * Behaviour and accessibility, not styling: the stepper is used on shared
 * kiosk surfaces, so the contract that matters is what assistive technology
 * and a person standing at the tablet perceive — labelled increment and
 * decrement controls, an announced value, and bounds expressed as disabled
 * states rather than ignored taps.
 *
 * Conventions follow components/ui/__tests__/button.test.tsx.
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
});
