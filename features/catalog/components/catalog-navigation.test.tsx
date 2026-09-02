import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { CatalogNavigation } from "./catalog-navigation";

describe("CatalogNavigation", () => {
  it("announces the current destination and reports every root selection, including re-selection", async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();

    await renderWithProviders(
      <CatalogNavigation currentDestination="products" onSelect={onSelect} />,
    );

    expect(screen.getByRole("button", { name: "Products" })).toHaveProp("accessibilityState", {
      selected: true,
    });
    expect(screen.getByRole("button", { name: "Home" })).toHaveProp("accessibilityState", {
      selected: false,
    });

    await user.press(screen.getByRole("button", { name: "Products" }));
    await user.press(screen.getByRole("button", { name: "Search" }));

    expect(onSelect).toHaveBeenNthCalledWith(1, "products");
    expect(onSelect).toHaveBeenNthCalledWith(2, "search");
  });

  it("exposes all five named root destinations", async () => {
    await renderWithProviders(<CatalogNavigation currentDestination="home" onSelect={jest.fn()} />);

    for (const name of ["Home", "Products", "Brands", "Categories", "Search"]) {
      expect(screen.getByRole("button", { name })).toBeOnTheScreen();
    }
  });
});
