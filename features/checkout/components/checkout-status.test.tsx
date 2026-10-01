import { act, renderWithProviders, screen, userEvent } from "@/core/testing";
import type { CartLine } from "@/features/cart";

import type { CheckoutStatusProps } from "./checkout-status";
import { AUTO_CHECK_SECONDS, CheckoutStatus } from "./checkout-status";

/**
 * CheckoutStatus is the whole screen while an order is out of the customer's
 * hands. It is presentational: every state names what happened and offers
 * exactly the next steps that are safe for that state. The store decides the
 * phase; this suite pins what each phase says and which actions it offers.
 */

const cappuccino: CartLine = {
  lineId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Hot",
  optionSelections: [],
  imageUri: "https://images.example.com/products/cappuccino.jpg",
  quantity: 2,
};

const water: CartLine = {
  lineId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  variantId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 3,
};

function props(overrides: Partial<CheckoutStatusProps>): CheckoutStatusProps {
  return {
    phase: "submitting",
    lines: [cappuccino],
    conflicts: null,
    failure: null,
    onCheckAgain: jest.fn(),
    onTryAgain: jest.fn(),
    onBackToCart: jest.fn(),
    ...overrides,
  };
}

describe("CheckoutStatus", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("while submitting: says the order is on its way, lists it, and offers no action", async () => {
    await renderWithProviders(<CheckoutStatus {...props({ phase: "submitting" })} />);

    expect(screen.getByText("Sending your order to the store")).toBeOnTheScreen();
    expect(screen.getByText("Waiting for the store…")).toBeOnTheScreen();
    expect(screen.getByText("Your order")).toBeOnTheScreen();
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity 2")).toBeOnTheScreen();
    // Nothing to press: leaving or re-sending mid-flight is never offered.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("while the result is unknown: promises the SAME order is checked, and Check now re-checks it", async () => {
    const user = userEvent.setup();
    const onCheckAgain = jest.fn();
    await renderWithProviders(<CheckoutStatus {...props({ phase: "unknown", onCheckAgain })} />);

    expect(screen.getByText("We’re checking on your order")).toBeOnTheScreen();
    expect(screen.getByText(/so it can’t be placed twice/)).toBeOnTheScreen();
    expect(
      screen.getByText(`Checking again automatically in ${AUTO_CHECK_SECONDS}s`),
    ).toBeOnTheScreen();
    // No way back to the cart while the order may exist.
    expect(screen.queryByRole("button", { name: "Back to my cart" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    await user.press(screen.getByRole("button", { name: "Check now" }));
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
  });

  it("while the result is unknown: re-checks on its own every interval", async () => {
    jest.useFakeTimers();
    const onCheckAgain = jest.fn();
    await renderWithProviders(<CheckoutStatus {...props({ phase: "unknown", onCheckAgain })} />);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(3_000);
    });
    expect(
      screen.getByText(`Checking again automatically in ${AUTO_CHECK_SECONDS - 3}s`),
    ).toBeOnTheScreen();
    expect(onCheckAgain).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync((AUTO_CHECK_SECONDS - 3) * 1_000);
    });
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
    // The countdown starts over for the next automatic check.
    expect(
      screen.getByText(`Checking again automatically in ${AUTO_CHECK_SECONDS}s`),
    ).toBeOnTheScreen();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTO_CHECK_SECONDS * 1_000);
    });
    expect(onCheckAgain).toHaveBeenCalledTimes(2);
  });

  it("never re-checks automatically outside the unknown state", async () => {
    jest.useFakeTimers();
    const onCheckAgain = jest.fn();
    await renderWithProviders(<CheckoutStatus {...props({ phase: "submitting", onCheckAgain })} />);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTO_CHECK_SECONDS * 3_000);
    });
    expect(onCheckAgain).not.toHaveBeenCalled();
  });

  it("on a stock conflict: says no order was placed, shows what is left per line, and leads back to the cart", async () => {
    const user = userEvent.setup();
    const onBackToCart = jest.fn();
    await renderWithProviders(
      <CheckoutStatus
        {...props({
          phase: "conflict",
          lines: [cappuccino, water],
          conflicts: [
            { variant_id: cappuccino.variantId, requested_quantity: 2, available_quantity: 1 },
            {
              variant_id: water.variantId.toUpperCase(),
              requested_quantity: 3,
              available_quantity: 0,
            },
          ],
          onBackToCart,
        })}
      />,
    );

    expect(screen.getByText("No order was placed")).toBeOnTheScreen();
    expect(screen.getByText("A few items just ran low")).toBeOnTheScreen();
    expect(screen.getByText("Items to adjust")).toBeOnTheScreen();
    expect(screen.getByText("1 available")).toBeOnTheScreen();
    expect(screen.getByText("You asked for 2")).toBeOnTheScreen();
    // Variant ids are matched case-insensitively.
    expect(screen.getByText("Sold out")).toBeOnTheScreen();
    expect(screen.getByText("You asked for 3")).toBeOnTheScreen();
    // The conflict figures replace the plain quantity badges.
    expect(screen.queryByLabelText(/^Quantity /)).toBeNull();

    await user.press(screen.getByRole("button", { name: "Review my cart" }));
    expect(onBackToCart).toHaveBeenCalledTimes(1);
  });

  it("on a retryable failure: shows the store's message and offers Try again and Back to my cart", async () => {
    const user = userEvent.setup();
    const onTryAgain = jest.fn();
    const onBackToCart = jest.fn();
    await renderWithProviders(
      <CheckoutStatus
        {...props({
          phase: "failure",
          failure: {
            title: "Your order wasn't sent",
            message: "The store is busy. Please try again.",
            retryable: true,
          },
          onTryAgain,
          onBackToCart,
        })}
      />,
    );

    expect(screen.getByText("No order was placed")).toBeOnTheScreen();
    expect(screen.getByText("Your order wasn't sent")).toBeOnTheScreen();
    expect(screen.getByText("The store is busy. Please try again.")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Try again" }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole("button", { name: "Back to my cart" }));
    expect(onBackToCart).toHaveBeenCalledTimes(1);
  });

  it("on a non-retryable failure: offers only the way back to the cart", async () => {
    await renderWithProviders(
      <CheckoutStatus
        {...props({
          phase: "failure",
          failure: {
            title: "Please check with staff",
            message: "This order may already have been placed.",
            retryable: false,
          },
        })}
      />,
    );

    expect(screen.getByText("Please check with staff")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back to my cart" })).toBeOnTheScreen();
  });
});
