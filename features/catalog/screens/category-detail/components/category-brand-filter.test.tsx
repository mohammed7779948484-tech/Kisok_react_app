import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { CategoryBrandFilter } from "./category-brand-filter";

/**
 * Behaviour for the screen-local Category Brand Filter (AC-05).
 *
 * The component is PRESENTATIONAL: it receives its options, its selected id
 * and its callbacks as props and reports interactions upward — no fetching,
 * no store, no router. That is what these tests pin: everything on screen
 * comes from props, and every interaction is reported through the callback.
 *
 * It renders plain buttons (no FlashList, no images), so it needs neither the
 * API-seam mock, nor the router mock, nor fake timers — which is itself part
 * of the presentational-purity proof: nothing else is required to render it.
 */
const filterOptions = [
  { brandId: "11111111-1111-4111-8111-111111111111", name: "Maison Élite" },
  { brandId: "22222222-2222-4222-8222-222222222222", name: "KISOK Basics" },
] as const;

describe("CategoryBrandFilter", () => {
  it("renders the All Brands option plus one chip per brand option", async () => {
    await renderWithProviders(
      <CategoryBrandFilter
        options={filterOptions}
        selectedBrandId={null}
        onSelectBrand={jest.fn()}
      />,
    );

    expect(screen.getByText("Filter by brand")).toBeOnTheScreen();

    // Every option is a named, touch-sized button: the default All Brands
    // chip first, then one chip per brand in the given order.
    expect(screen.getByRole("button", { name: "All Brands" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Maison Élite" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "KISOK Basics" })).toBeOnTheScreen();
  });

  it("marks the selected option and the All Brands default distinctly", async () => {
    await renderWithProviders(
      <CategoryBrandFilter
        options={filterOptions}
        selectedBrandId={filterOptions[0].brandId}
        onSelectBrand={jest.fn()}
      />,
    );

    // A brand selection is announced on the option and deselects All Brands.
    expect(screen.getByRole("button", { name: "Maison Élite", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "KISOK Basics", selected: false })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "All Brands", selected: false })).toBeOnTheScreen();
  });

  it("marks All Brands selected when no brand is selected", async () => {
    await renderWithProviders(
      <CategoryBrandFilter
        options={filterOptions}
        selectedBrandId={null}
        onSelectBrand={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "All Brands", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Maison Élite", selected: false })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "KISOK Basics", selected: false })).toBeOnTheScreen();
  });

  it("reports the chosen brand id when an option is pressed", async () => {
    const onSelectBrand = jest.fn();
    const user = userEvent.setup();

    await renderWithProviders(
      <CategoryBrandFilter
        options={filterOptions}
        selectedBrandId={null}
        onSelectBrand={onSelectBrand}
      />,
    );

    await user.press(screen.getByRole("button", { name: "Maison Élite" }));
    await user.press(screen.getByRole("button", { name: "KISOK Basics" }));
    // Pressing the already-selected option reports the same id again — the
    // owning screen owns what that means (an idempotent re-selection).
    await user.press(screen.getByRole("button", { name: "KISOK Basics" }));

    expect(onSelectBrand).toHaveBeenCalledTimes(3);
    expect(onSelectBrand).toHaveBeenNthCalledWith(1, filterOptions[0].brandId);
    expect(onSelectBrand).toHaveBeenNthCalledWith(2, filterOptions[1].brandId);
    expect(onSelectBrand).toHaveBeenNthCalledWith(3, filterOptions[1].brandId);
  });

  it("reports null when All Brands is pressed — the reset-to-all case", async () => {
    const onSelectBrand = jest.fn();
    const user = userEvent.setup();

    await renderWithProviders(
      <CategoryBrandFilter
        options={filterOptions}
        selectedBrandId={filterOptions[1].brandId}
        onSelectBrand={onSelectBrand}
      />,
    );

    await user.press(screen.getByRole("button", { name: "All Brands" }));

    expect(onSelectBrand).toHaveBeenCalledTimes(1);
    expect(onSelectBrand).toHaveBeenCalledWith(null);
  });

  it("renders exactly the options it is given — an empty set shows only All Brands", async () => {
    await renderWithProviders(
      <CategoryBrandFilter options={[]} selectedBrandId={null} onSelectBrand={jest.fn()} />,
    );

    expect(screen.getByRole("button", { name: "All Brands" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Maison Élite" })).toBeNull();
    expect(screen.queryByRole("button", { name: "KISOK Basics" })).toBeNull();
  });

  it("follows new props on re-render — presentational, never its own data source", async () => {
    // A controlled component: the chips on screen are a projection of the
    // props, so different props must produce a different chip set and a
    // different selection, without any internal fetching or caching.
    await renderWithProviders(
      <CategoryBrandFilter
        options={filterOptions}
        selectedBrandId={null}
        onSelectBrand={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Maison Élite" })).toBeOnTheScreen();

    const otherOptions = [
      { brandId: "33333333-3333-4333-8333-333333333333", name: "Alpine Works" },
    ] as const;

    await renderWithProviders(
      <CategoryBrandFilter
        options={otherOptions}
        selectedBrandId={otherOptions[0].brandId}
        onSelectBrand={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Alpine Works", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "All Brands", selected: false })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Maison Élite" })).toBeNull();
    expect(screen.queryByRole("button", { name: "KISOK Basics" })).toBeNull();
  });
});
