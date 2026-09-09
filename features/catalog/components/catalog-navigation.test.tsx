import { View } from "react-native";

import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { CatalogNavigation, type CatalogDestination } from "./catalog-navigation";

function renderNavigation(
  current: CatalogDestination,
  onNavigate: (destination: CatalogDestination) => void,
) {
  return renderWithProviders(
    <View>
      <CatalogNavigation current={current} onNavigate={onNavigate} />
    </View>,
  );
}

describe("CatalogNavigation", () => {
  it("offers the five root destinations by name", async () => {
    await renderNavigation("home", jest.fn());

    for (const label of ["Home", "Products", "Brands", "Categories", "Search"]) {
      expect(screen.getByRole("button", { name: label })).toBeOnTheScreen();
    }
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("announces the current destination as selected and the others as not", async () => {
    await renderNavigation("products", jest.fn());

    expect(screen.getByRole("button", { name: "Products", selected: true })).toBeOnTheScreen();

    for (const label of ["Home", "Brands", "Categories", "Search"]) {
      expect(screen.getByRole("button", { name: label, selected: false })).toBeOnTheScreen();
    }
  });

  it("reports each destination upward through the navigation callback", async () => {
    const onNavigate = jest.fn();
    const user = userEvent.setup();
    await renderNavigation("home", onNavigate);

    await user.press(screen.getByRole("button", { name: "Brands" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("brands");
  });

  it("also reports the active destination when it is re-selected", async () => {
    const onNavigate = jest.fn();
    const user = userEvent.setup();
    await renderNavigation("search", onNavigate);

    await user.press(screen.getByRole("button", { name: "Search" }));

    expect(onNavigate).toHaveBeenCalledWith("search");
  });
});
