import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { renderWithProviders, screen, userEvent } from "@/core/testing";

/**
 * Behaviour and accessibility, not styling. Asserting NativeWind's resolved
 * styles is brittle — see docs/testing.md.
 */
describe("Button", () => {
  it("exposes itself as a button with its label as the accessible name", async () => {
    await renderWithProviders(
      <Button>
        <Text>Add to cart</Text>
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Add to cart" })).toBeOnTheScreen();
  });

  it("reports the disabled state to assistive technology, not just visually", async () => {
    await renderWithProviders(
      <Button disabled>
        <Text>Confirm order</Text>
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Confirm order" })).toBeDisabled();
  });

  it("does not fire while disabled", async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <Button disabled onPress={onPress}>
        <Text>Confirm order</Text>
      </Button>,
    );

    await user.press(screen.getByRole("button", { name: "Confirm order" }));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("uses the provided label when the content is an icon only", async () => {
    await renderWithProviders(<Button size="icon" accessibilityLabel="Open cart" />);

    expect(screen.getByRole("button", { name: "Open cart" })).toBeOnTheScreen();
  });
});
