import { Text } from "react-native";

import { renderWithProviders, screen, waitFor } from "@/core/testing";

import { fetchCatalog } from "../api/fetch-catalog";
import { catalogFixtureIds, createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";

import { catalogKeys } from "./keys";
import { useCatalog } from "./use-catalog";

jest.mock("../api/fetch-catalog", () => ({
  fetchCatalog: jest.fn(),
}));

const mockFetchCatalog = fetchCatalog as jest.MockedFunction<typeof fetchCatalog>;

function CatalogProbe() {
  const catalog = useCatalog();

  if (catalog.data === undefined) {
    return <Text>loading</Text>;
  }

  const selectedProduct = catalog.data.resolveProduct(catalogFixtureIds.products.coffee);

  return <Text>{`${catalog.data.products.length}:${selectedProduct?.name ?? "missing"}`}</Text>;
}

afterEach(() => {
  mockFetchCatalog.mockReset();
});

describe("useCatalog", () => {
  it("loads one snapshot under the Catalog key and serves the derived local view without another read", async () => {
    const snapshot = createCatalogSnapshotFixture();
    mockFetchCatalog.mockResolvedValue(snapshot);

    const { queryClient } = await renderWithProviders(<CatalogProbe />);

    await waitFor(() => expect(screen.getByText("3:Café Crème")).toBeOnTheScreen());

    expect(queryClient.getQueryData(catalogKeys.all)).toBe(snapshot);
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });
});
