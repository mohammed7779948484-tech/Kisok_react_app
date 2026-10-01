import { Dimensions } from "react-native";

import { resetLogging, setLogSink } from "@/core/logging";
import { renderWithProviders, screen, userEvent } from "@/core/testing";

import type { CartLine } from "../model/cart-line.schema";
import { useCartStore } from "../state/cart-store";
import { QuickCartSheet } from "./quick-cart-sheet";

/** Six selections, quantities 1..6 (21 items in all). */
const lines: CartLine[] = Array.from({ length: 6 }, (_, index) => ({
  lineId: `00000000-0000-4000-8000-00000000000${index}`,
  variantId: `00000000-0000-4000-8000-00000000000${index}`,
  productId: "11111111-2222-4333-8444-555555555555",
  productDisplayName: `Selection ${index + 1}`,
  variantLabel: "Large",
  optionSelections: [
    {
      optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
      optionValueId: "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
      optionValueLabel: "Large",
    },
  ],
  imageUri: null,
  quantity: index + 1,
}));

/**
 * The selection titles in the order shown. A line without an image also
 * prints its name as the media fallback, so each name is counted once.
 */
const shownSelections = () => [
  ...new Set(screen.getAllByText(/^Selection \d$/).map((node) => node.props.children as string)),
];

describe("QuickCartSheet read-only preview", () => {
  beforeEach(() => {
    setLogSink(() => {});
    Dimensions.set({
      window: { width: 1024, height: 768, scale: 1, fontScale: 1 },
      screen: { width: 1024, height: 768, scale: 1, fontScale: 1 },
    });
    useCartStore.setState({ lines, hydrated: true, locked: false, saveFailed: false });
  });
  afterEach(resetLogging);

  it("previews up to four selections with whole-cart context and no editing controls", async () => {
    await renderWithProviders(
      <QuickCartSheet open onOpenChange={jest.fn()} onViewFullCart={jest.fn()} />,
    );

    expect(screen.getByText("Your cart")).toBeOnTheScreen();
    expect(screen.getByText("21 items · 6 selections")).toBeOnTheScreen();
    expect(shownSelections()).toEqual(["Selection 1", "Selection 2", "Selection 3", "Selection 4"]);
    expect(screen.getByLabelText("Quantity 4")).toBeOnTheScreen();
    expect(screen.getByText("+ 2 more selections")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /quantity|remove/i })).toBeNull();
  });

  it("leads with the line just added, even an older one, and changes nothing", async () => {
    await renderWithProviders(
      <QuickCartSheet open addedLineId={lines[1]?.lineId} onOpenChange={jest.fn()} />,
    );

    expect(screen.getByText("Added to your cart")).toBeOnTheScreen();
    expect(screen.getByText("Also in your cart")).toBeOnTheScreen();
    expect(shownSelections()).toEqual(["Selection 2", "Selection 1", "Selection 3", "Selection 4"]);
    expect(screen.getByText("+ 2 more selections")).toBeOnTheScreen();
    expect(useCartStore.getState().lines).toEqual(lines);
  });

  it("uses singular wording for one item in one selection", async () => {
    useCartStore.setState({ lines: [lines[0]!] });
    await renderWithProviders(<QuickCartSheet open onOpenChange={jest.fn()} />);

    expect(screen.getByText("1 item · 1 selection")).toBeOnTheScreen();
    expect(screen.queryByText(/more selection/)).toBeNull();
  });

  it("Keep browsing closes and Review cart reports the navigation intent", async () => {
    const onOpenChange = jest.fn();
    const onViewFullCart = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <QuickCartSheet open onOpenChange={onOpenChange} onViewFullCart={onViewFullCart} />,
    );

    await user.press(screen.getByRole("button", { name: "Review cart" }));
    expect(onViewFullCart).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole("button", { name: "Keep browsing" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers no Review cart for an empty cart even when a callback exists", async () => {
    useCartStore.setState({ lines: [] });
    await renderWithProviders(
      <QuickCartSheet open onOpenChange={jest.fn()} onViewFullCart={jest.fn()} />,
    );

    expect(screen.getByText("Nothing here yet.")).toBeOnTheScreen();
    expect(screen.getByText("Items you add while browsing will appear here.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Review cart" })).toBeNull();
    expect(screen.getByRole("button", { name: "Keep browsing" })).toBeOnTheScreen();
  });

  it("shows the restore in progress rather than an empty cart before hydration", async () => {
    useCartStore.setState({ lines: [], hydrated: false });
    await renderWithProviders(
      <QuickCartSheet open onOpenChange={jest.fn()} onViewFullCart={jest.fn()} />,
    );

    expect(screen.getByText("Restoring your cart…")).toBeOnTheScreen();
    expect(screen.queryByText("Items you add while browsing will appear here.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Review cart" })).toBeNull();
  });

  it("omits navigation without an intent and renders no content while closed", async () => {
    const view = await renderWithProviders(<QuickCartSheet open onOpenChange={jest.fn()} />);
    expect(shownSelections()).toContain("Selection 1");
    expect(screen.queryByRole("button", { name: "Review cart" })).toBeNull();

    await view.rerender(<QuickCartSheet open={false} onOpenChange={jest.fn()} />);
    expect(screen.queryAllByText("Selection 1")).toHaveLength(0);
  });
});
