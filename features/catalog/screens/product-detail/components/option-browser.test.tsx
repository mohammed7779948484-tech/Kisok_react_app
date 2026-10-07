import { Keyboard, Text } from "react-native";

import { act, renderWithProviders, screen } from "@/core/testing";

import {
  catalogFixtureIds,
  createCatalogSnapshotFixture,
} from "../../../model/catalog-snapshot.fixture";
import { createCatalogView } from "../../../model/catalog-view";
import { OptionBrowser, type OptionBrowserProps } from "./option-browser";
import { deriveVariantDecision } from "./variant-decision";

const product = createCatalogView(createCatalogSnapshotFixture()).resolveProduct(
  catalogFixtureIds.products.coffee,
);
if (!product) throw new Error("fixture coffee product missing");

function browser(split: boolean) {
  const props: OptionBrowserProps = {
    decision: deriveVariantDecision(product!.variants),
    selectedId: null,
    onSelect: jest.fn(),
    onClose: jest.fn(),
    lowStockThreshold: 0,
    split,
    title: product!.name,
    media: null,
    availableCount: 1,
    total: product!.variants.length,
    orderBar: <Text>Order bar</Text>,
    bottomInset: 0,
  };
  return <OptionBrowser {...props} />;
}

// The grid re-reports its offset on focus; outside a navigator, run it as an effect.
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
  };
});

afterEach(() => jest.restoreAllMocks());

/**
 * Review N-01: the stacked Order Bar follows the keyboard. A rotation through
 * the split layout (which does not listen) must not leave it hidden.
 */
describe("OptionBrowser — Order Bar and the keyboard across a rotation", () => {
  it("shows the Order Bar again after rotating away and back while the keyboard was up", async () => {
    const listeners = new Map<string, () => void>();
    jest.spyOn(Keyboard, "addListener").mockImplementation(((
      event: string,
      handler: () => void,
    ) => {
      listeners.set(event, handler);
      return { remove: () => listeners.delete(event) };
    }) as never);
    jest.spyOn(Keyboard, "isVisible").mockReturnValue(false);

    const view = await renderWithProviders(browser(false));
    await act(async () => listeners.get("keyboardDidShow")?.());
    expect(screen.queryByText("Order bar")).toBeNull();

    // Rotate to landscape: the keyboard is dismissed there, with nobody listening.
    await view.rerender(browser(true));
    // And back to portrait, with no keyboard on screen.
    await view.rerender(browser(false));

    expect(screen.getByText("Order bar")).toBeOnTheScreen();
  });
});
