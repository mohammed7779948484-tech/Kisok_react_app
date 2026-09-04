import { Text } from "react-native";

import { renderWithProviders, screen, waitFor } from "@/core/testing";

import { fetchCatalog } from "../api/fetch-catalog";
import type { CatalogSnapshot } from "../model/catalog-snapshot.schema";
import { createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";

import { catalogKeys } from "./keys";
import { useCatalog } from "./use-catalog";
import { useCustomerCatalogSettings } from "./use-customer-settings";

jest.mock("../api/fetch-catalog", () => ({
  fetchCatalog: jest.fn(),
}));

const mockFetchCatalog = fetchCatalog as jest.MockedFunction<typeof fetchCatalog>;

function SettingsProbe() {
  const settings = useCustomerCatalogSettings();

  if (settings.isPending) {
    return <Text>pending</Text>;
  }
  if (settings.isError) {
    return <Text>error</Text>;
  }

  return <Text>{`seconds:${settings.data?.customerSuccessResetSeconds}`}</Text>;
}

function CatalogProbe() {
  const catalog = useCatalog();

  return <Text>{`catalog:${catalog.data?.products.length ?? "pending"}`}</Text>;
}

afterEach(() => {
  mockFetchCatalog.mockReset();
});

describe("useCustomerCatalogSettings", () => {
  it("returns the configured reset seconds when the snapshot carries full settings", async () => {
    mockFetchCatalog.mockResolvedValue(
      createCatalogSnapshotFixture({
        settings: {
          store_name: "KISOK Test Store",
          global_low_stock_threshold: 5,
          customer_success_reset_seconds: 40,
          store_timezone: "Africa/Casablanca",
          logo_media_asset_id: null,
          logo_public_id: null,
          logo_secure_url: null,
        },
      }),
    );

    await renderWithProviders(<SettingsProbe />);

    await waitFor(() => expect(screen.getByText("seconds:40")).toBeOnTheScreen());
  });

  it("returns customerSuccessResetSeconds undefined when the settings union member is the empty object", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture({ settings: {} }));

    await renderWithProviders(<SettingsProbe />);

    await waitFor(() => expect(screen.getByText("seconds:undefined")).toBeOnTheScreen());
  });

  it("shares the catalog query: mounting alongside useCatalog fires one fetch and caches one raw snapshot", async () => {
    const snapshot = createCatalogSnapshotFixture();
    mockFetchCatalog.mockResolvedValue(snapshot);

    const { queryClient } = await renderWithProviders(
      <>
        <CatalogProbe />
        <SettingsProbe />
      </>,
    );

    await waitFor(() => expect(screen.getByText("catalog:3")).toBeOnTheScreen());
    await waitFor(() => expect(screen.getByText("seconds:25")).toBeOnTheScreen());

    expect(queryClient.getQueryData(catalogKeys.all)).toBe(snapshot);
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("reports the pending state without crashing while the shared query is in flight", async () => {
    let resolveFetch: (snapshot: CatalogSnapshot) => void = () => {};
    mockFetchCatalog.mockImplementation(
      () =>
        new Promise<CatalogSnapshot>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    await renderWithProviders(<SettingsProbe />);

    expect(screen.getByText("pending")).toBeOnTheScreen();

    resolveFetch(createCatalogSnapshotFixture());
    await waitFor(() => expect(screen.getByText("seconds:25")).toBeOnTheScreen());
  });

  it("passes the query error state through", async () => {
    mockFetchCatalog.mockRejectedValue(new Error("catalog unreachable"));

    await renderWithProviders(<SettingsProbe />);

    await waitFor(() => expect(screen.getByText("error")).toBeOnTheScreen());
  });
});
