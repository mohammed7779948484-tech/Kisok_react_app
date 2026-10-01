import { View } from "react-native";

import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { CatalogNavigation, type CatalogDestination } from "./catalog-navigation";

const TAB_LABELS = ["Explore", "Products", "Categories", "Brands"] as const;

function renderNavigation(
  current: CatalogDestination | null,
  onNavigate: (destination: CatalogDestination) => void,
  options: { scrollable?: boolean } = {},
) {
  return renderWithProviders(
    <View>
      <CatalogNavigation current={current} onNavigate={onNavigate} {...options} />
    </View>,
  );
}

describe("CatalogNavigation", () => {
  it("offers the four browse destinations as tabs", async () => {
    await renderNavigation("home", jest.fn());

    for (const label of TAB_LABELS) {
      expect(screen.getByRole("tab", { name: label })).toBeOnTheScreen();
    }
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    // Search is the chrome's search field, not a navigation tab.
    expect(screen.queryByRole("tab", { name: "Search" })).not.toBeOnTheScreen();
  });

  it("announces the current destination as selected and the others as not", async () => {
    await renderNavigation("products", jest.fn());

    expect(screen.getByRole("tab", { name: "Products", selected: true })).toBeOnTheScreen();

    for (const label of ["Explore", "Brands", "Categories"]) {
      expect(screen.getByRole("tab", { name: label, selected: false })).toBeOnTheScreen();
    }
  });

  it("selects no tab when the current destination is not one of them", async () => {
    await renderNavigation("search", jest.fn());

    for (const label of TAB_LABELS) {
      expect(screen.getByRole("tab", { name: label, selected: false })).toBeOnTheScreen();
    }
  });

  it("reports each destination upward through the navigation callback", async () => {
    const onNavigate = jest.fn();
    const user = userEvent.setup();
    await renderNavigation("home", onNavigate);

    await user.press(screen.getByRole("tab", { name: "Brands" }));
    await user.press(screen.getByRole("tab", { name: "Explore" }));

    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(onNavigate).toHaveBeenNthCalledWith(1, "brands");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "home");
  });

  it("also reports the active destination when it is re-selected", async () => {
    const onNavigate = jest.fn();
    const user = userEvent.setup();
    await renderNavigation("categories", onNavigate);

    await user.press(screen.getByRole("tab", { name: "Categories" }));

    expect(onNavigate).toHaveBeenCalledWith("categories");
  });

  it("keeps the same tabs and callbacks when the row scrolls sideways", async () => {
    const onNavigate = jest.fn();
    const user = userEvent.setup();
    await renderNavigation("brands", onNavigate, { scrollable: true });

    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("tab", { name: "Brands", selected: true })).toBeOnTheScreen();

    await user.press(screen.getByRole("tab", { name: "Products" }));

    expect(onNavigate).toHaveBeenCalledWith("products");
  });
});
