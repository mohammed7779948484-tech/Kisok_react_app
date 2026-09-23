import { Dimensions } from "react-native";

import { resetLogging, setLogSink } from "@/core/logging";
import { renderWithProviders, screen, userEvent } from "@/core/testing";

import type { CartLine } from "../model/cart-line.schema";
import { useCartStore } from "../state/cart-store";
import { QuickCartSheet } from "./quick-cart-sheet";

jest.mock("lucide-react-native", () => {
  const makeIcon = (name: string) => Object.assign(() => null, { displayName: name });
  return {
    PackageCheck: makeIcon("PackageCheck"),
    ShoppingCart: makeIcon("ShoppingCart"),
    ImageOff: makeIcon("ImageOff"),
    TriangleAlert: makeIcon("TriangleAlert"),
    CircleAlert: makeIcon("CircleAlert"),
  };
});

const lines: CartLine[] = Array.from({ length: 5 }, (_, index) => ({
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

describe("QuickCartSheet read-only preview", () => {
  beforeEach(() => {
    setLogSink(() => {});
    Dimensions.set({
      window: { width: 1024, height: 768, scale: 1, fontScale: 1 },
      screen: { width: 1024, height: 768, scale: 1, fontScale: 1 },
    });
    useCartStore.setState({ lines, hydrated: true, locked: false, persistence: "persisted" });
  });
  afterEach(resetLogging);

  it("bounds the preview to three selections with whole-cart context and no editing controls", async () => {
    await renderWithProviders(
      <QuickCartSheet open onOpenChange={jest.fn()} onViewFullCart={jest.fn()} />,
    );
    expect(screen.getByText("Your Cart")).toBeOnTheScreen();
    expect(screen.getAllByText(/^Selection \d$/).map((node) => node.props.children)).toEqual([
      "Selection 1",
      "Selection 2",
      "Selection 3",
    ]);
    expect(screen.getAllByText("Large")).toHaveLength(3);
    expect(screen.getByText("2 more selections in your cart")).toBeOnTheScreen();
    expect(screen.getByText("Cart · 15 items")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /quantity|Remove/i })).toBeNull();
    expect(screen.queryByText("Saved in memory only")).toBeNull();
    expect(screen.queryByText("Couldn't clear the saved cart")).toBeNull();
  });

  it("puts the explicitly re-added older selection first rather than assuming the last stored line", async () => {
    await renderWithProviders(
      <QuickCartSheet open addedLineId={lines[1]?.lineId} onOpenChange={jest.fn()} />,
    );
    expect(screen.getByText("Added to cart")).toBeOnTheScreen();
    expect(screen.getAllByText(/^Selection \d$/).map((node) => node.props.children)).toEqual([
      "Selection 2",
      "Selection 1",
      "Selection 3",
    ]);
    expect(useCartStore.getState().lines).toEqual(lines);
  });

  it("Keep Shopping closes and View Cart reports the navigation intent", async () => {
    const onOpenChange = jest.fn();
    const onViewFullCart = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <QuickCartSheet open onOpenChange={onOpenChange} onViewFullCart={onViewFullCart} />,
    );
    await user.press(screen.getByRole("button", { name: "View Cart" }));
    expect(onViewFullCart).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole("button", { name: "Keep Shopping" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers no View Cart navigation for an empty cart even when a callback exists", async () => {
    useCartStore.setState({ lines: [] });
    await renderWithProviders(
      <QuickCartSheet open onOpenChange={jest.fn()} onViewFullCart={jest.fn()} />,
    );
    expect(screen.getByText("Your cart is empty")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "View Cart" })).toBeNull();
    expect(screen.getByRole("button", { name: "Keep Shopping" })).toBeOnTheScreen();
  });

  it("shows restoration rather than an empty cart or guessed total before hydration", async () => {
    useCartStore.setState({ lines: [], hydrated: false });
    await renderWithProviders(
      <QuickCartSheet open onOpenChange={jest.fn()} onViewFullCart={jest.fn()} />,
    );
    expect(screen.getByText("Restoring your cart…")).toBeOnTheScreen();
    expect(screen.queryByText("Your cart is empty")).toBeNull();
    expect(screen.queryByText(/^Cart ·/)).toBeNull();
    expect(screen.queryByRole("button", { name: "View Cart" })).toBeNull();
  });

  it.each([
    ["memoryOnly", "Saved in memory only"],
    ["clearFailed", "Couldn't clear the saved cart"],
  ] as const)("honestly surfaces %s persistence", async (persistence, warning) => {
    useCartStore.setState({ persistence });
    await renderWithProviders(<QuickCartSheet open onOpenChange={jest.fn()} />);
    expect(screen.getByText(warning)).toBeOnTheScreen();
    expect(screen.getByText("Selection 1")).toBeOnTheScreen();
  });

  it("omits navigation without an intent and renders no content while closed", async () => {
    const view = await renderWithProviders(<QuickCartSheet open onOpenChange={jest.fn()} />);
    expect(screen.getByText("Selection 1")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "View Cart" })).toBeNull();
    await view.rerender(<QuickCartSheet open={false} onOpenChange={jest.fn()} />);
    expect(screen.queryByText("Selection 1")).toBeNull();
  });
});
