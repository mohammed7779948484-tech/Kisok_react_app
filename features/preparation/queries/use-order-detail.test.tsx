import { Text } from "react-native";

import { createTestQueryClient, renderWithProviders, screen, waitFor } from "@/core/testing";

import { type ActiveOrderRow } from "../api/fetch-active-orders";
import { fetchOrderDetail } from "../api/fetch-order-detail";

import { preparationKeys } from "./keys";
import { useOrderDetail } from "./use-order-detail";

/**
 * The plan's test strategy for parameterized reads: the id must ride in the
 * queryKey, or the shared TanStack cache serves order A's data for order B —
 * the exact cross-contamination the details screen cannot survive (AC-07).
 *
 * The api module is mocked (the tests rule's seam for hook tests — a hook
 * test should not know Supabase exists); the cache itself is real, so the
 * assertions below prove real cache behaviour, not mock behaviour.
 */

jest.mock("../api/fetch-order-detail", () => ({
  fetchOrderDetail: jest.fn(),
}));

const ORDER_ID_A = "1e2a3b4c-5d6f-4a7b-8c9d-0e1f2a3b4c5a";
const ORDER_ID_B = "9f8e7d6c-5b4a-4c3d-8e9f-0a1b2c3d4e5f";

/**
 * A full detail row whose identity fields all derive from the arguments, so
 * two rows built for two ids can never be equal — typed as the read's return
 * type so a schema drift fails `pnpm typecheck` instead of this test.
 */
function makeOrderRow(orderId: string, displayNumber: string, productName: string): ActiveOrderRow {
  return {
    id: orderId,
    display_number: displayNumber,
    client_request_id: "2b7e1a9c-4d6f-4e8a-b0c1-3d5e7f9a1b2c",
    request_fingerprint: "3c1f8e2a9d40",
    status: "new",
    created_by: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    assigned_preparation_id: null,
    completed_by: null,
    completed_at: null,
    cancelled_by: null,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: "2026-08-26T06:12:03.246810+00:00",
    updated_at: "2026-08-26T06:12:03.246810+00:00",
    order_items: [
      {
        id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        order_id: orderId,
        product_id: "d1e2f3a4-5b6c-4d7e-8f9a-0b1c2d3e4f5a",
        variant_id: "e2f3a4b5-6c7d-4e8f-9a0b-1c2d3e4f5a6b",
        product_name: productName,
        variant_name: "250g · Whole Bean",
        variant_sku: "SO-250G-WB",
        // Snapshot shape from migration 20260826050007: {type, value} pairs.
        variant_options: [{ type: "Grind", value: "Whole bean" }],
        brand_name: "Kisok Roasters",
        image_public_id: null,
        image_secure_url: null,
        quantity: 2,
      },
    ],
  };
}

/** Renders the loaded order's id — the two probes make cache identity visible. */
function OrderDetailText({ orderId }: { orderId: string }) {
  const { data } = useOrderDetail(orderId);
  return <Text>{data ? data.id : "loading"}</Text>;
}

describe("useOrderDetail", () => {
  const fetchMock = fetchOrderDetail as jest.MockedFunction<typeof fetchOrderDetail>;

  afterEach(() => {
    fetchMock.mockReset();
  });

  it("keys the cache per orderId, never serving one order's data for another", async () => {
    const orderA = makeOrderRow(ORDER_ID_A, "A1B2C3", "Single Origin Coffee");
    const orderB = makeOrderRow(ORDER_ID_B, "D4E5F6", "Cold Brew Concentrate");
    fetchMock.mockImplementation(async (orderId: string) =>
      orderId === ORDER_ID_A ? orderA : orderB,
    );

    // One tree, one shared client — the two probes are exactly the situation
    // the details screen creates as navigation moves between orders.
    const queryClient = createTestQueryClient();
    await renderWithProviders(
      <>
        <OrderDetailText orderId={ORDER_ID_A} />
        <OrderDetailText orderId={ORDER_ID_B} />
      </>,
      { queryClient },
    );

    await waitFor(() => expect(screen.getByText(ORDER_ID_A)).toBeOnTheScreen());
    await waitFor(() => expect(screen.getByText(ORDER_ID_B)).toBeOnTheScreen());

    // Each id was fetched exactly once — no shared fetch, no duplicate fetch.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.filter((call) => call[0] === ORDER_ID_A)).toHaveLength(1);
    expect(fetchMock.mock.calls.filter((call) => call[0] === ORDER_ID_B)).toHaveLength(1);

    // Two DISTINCT cache entries under the planned key shape — drop the id
    // from the queryKey and these keys collide, so one of the two lookups
    // returns the other order's row (or undefined) and this fails.
    expect(queryClient.getQueryData([...preparationKeys.all, "order-detail", ORDER_ID_A])).toEqual(
      orderA,
    );
    expect(queryClient.getQueryData([...preparationKeys.all, "order-detail", ORDER_ID_B])).toEqual(
      orderB,
    );
  });
});
