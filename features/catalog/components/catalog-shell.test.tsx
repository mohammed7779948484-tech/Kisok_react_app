import { Text } from "react-native";

import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { CatalogShell } from "./catalog-shell";

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

jest.useFakeTimers();

const settings = {
  store_name: "Demo Store",
  global_low_stock_threshold: 0,
  customer_success_reset_seconds: 25,
  store_timezone: "UTC",
  logo_media_asset_id: null,
  logo_public_id: null,
  logo_secure_url: null,
};

async function renderShell() {
  await renderWithProviders(
    <CatalogShell currentDestination="home" settings={settings}>
      <Text>Page</Text>
    </CatalogShell>,
  );
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

beforeEach(() => {
  mockRouterPush.mockClear();
  mockRouterReplace.mockClear();
});

describe("CatalogShell — Help Me Choose pill", () => {
  it("is absent unless the page opts in", async () => {
    await renderShell();

    expect(screen.queryByTestId("help-me-choose-pill")).toBeNull();
  });

  it("opens Help Me Choose unscoped when the page opts in without a scope", async () => {
    await renderWithProviders(
      <CatalogShell currentDestination="products" settings={settings} helpMeChoose={{}}>
        <Text>Page</Text>
      </CatalogShell>,
    );
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await user.press(screen.getByRole("button", { name: "Help me choose" }));

    // No params key carries an undefined value.
    expect(mockRouterPush.mock.calls).toEqual([[{ pathname: "/help-me-choose", params: {} }]]);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("carries only the scope ids the page provides", async () => {
    const view = await renderWithProviders(
      <CatalogShell
        currentDestination="categories"
        settings={settings}
        helpMeChoose={{ categoryId: "cat-1" }}
      >
        <Text>Page</Text>
      </CatalogShell>,
    );
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await user.press(screen.getByTestId("help-me-choose-pill"));

    await view.rerender(
      <CatalogShell
        currentDestination="brands"
        settings={settings}
        helpMeChoose={{ brandId: "b-1" }}
      >
        <Text>Page</Text>
      </CatalogShell>,
    );
    await user.press(screen.getByTestId("help-me-choose-pill"));

    expect(mockRouterPush.mock.calls).toEqual([
      [{ pathname: "/help-me-choose", params: { categoryId: "cat-1" } }],
      [{ pathname: "/help-me-choose", params: { brandId: "b-1" } }],
    ]);
  });
});

describe("CatalogShell — store lockup", () => {
  it("goes Home on an ordinary tap", async () => {
    const user = await renderShell();

    await user.press(screen.getByTestId("catalog-store-lockup"));

    expect(mockRouterReplace).toHaveBeenCalledWith("/");
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("opens the hidden Staff page only after a deliberate three-second hold", async () => {
    const user = await renderShell();
    const lockup = screen.getByTestId("catalog-store-lockup");

    // Anything shorter than the hold is an ordinary tap: it goes Home.
    await user.longPress(lockup, { duration: 1000 });
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockRouterReplace).toHaveBeenCalledWith("/");
    mockRouterReplace.mockClear();

    await user.longPress(lockup, { duration: 3200 });
    expect(mockRouterPush).toHaveBeenCalledWith("/maintenance");
    // A hold never also navigates Home.
    expect(mockRouterReplace).not.toHaveBeenCalledWith("/");
  });

  it("adds no visible staff affordance or hint", async () => {
    await renderShell();

    expect(screen.queryByText(/staff|sign out/i)).toBeNull();
    expect(screen.getByTestId("catalog-store-lockup").props.accessibilityHint).toBeUndefined();
  });
});
