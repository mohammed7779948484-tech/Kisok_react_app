import type { QueryClient } from "@tanstack/react-query";
import { Pressable, Text } from "react-native";

import { AppError } from "@/core/errors";
import { renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

import { submitOrder, type SubmitOrderInput } from "../api/submit-order";
import type { CreateOrderResponse } from "../model/create-order-response.schema";

import { useSubmitOrderMutation } from "./use-submit-order-mutation";

jest.mock("../api/submit-order", () => ({
  submitOrder: jest.fn(),
}));

const mockSubmitOrder = submitOrder as jest.MockedFunction<typeof submitOrder>;

const input: SubmitOrderInput = {
  clientRequestId: "5b21a8e0-3f47-4c6d-9e2b-7d8f1a4b6c3e",
  items: [
    { variant_id: "1a2b3c4d-5e6f-4071-8a9b-0c1d2e3f4a5b", quantity: 2 },
    { variant_id: "9a8b7c6d-5e4f-4031-8a2b-6c7d8e9f0a1b", quantity: 1 },
  ],
};

const successResponse: CreateOrderResponse = {
  kind: "success",
  order_id: "c3d4e5f6-a7b8-40c9-8d0e-1f2a3b4c5d6e",
  display_number: "MN4P7Q",
  created_at: "2026-08-26T05:07:00+00:00",
};

/**
 * Probe pattern (use-catalog.test.tsx): mount the hook the way its only
 * consumer drives it — one press, one mutate — and render the observable
 * mutation state. Transport fidelity only: double-submission suppression and
 * the attempt lifecycle belong to the store/screen tasks (plan D8/D13).
 */
function SubmitOrderProbe({ input }: { input: SubmitOrderInput }) {
  const submitOrderMutation = useSubmitOrderMutation();

  if (submitOrderMutation.isPending) {
    return <Text>submitting</Text>;
  }
  if (submitOrderMutation.isError) {
    const failure = submitOrderMutation.error;
    return (
      <Text>{`failed:${failure instanceof AppError ? failure.kind : "not-an-app-error"}`}</Text>
    );
  }
  if (submitOrderMutation.isSuccess) {
    // Narrow by `kind` exactly like the real consumer (the attempt store)
    // will: both response families resolve as mutation data.
    const response = submitOrderMutation.data;
    const label = response.kind === "success" ? response.display_number : response.kind;
    return <Text>{`succeeded:${label}`}</Text>;
  }
  return (
    <Pressable accessibilityRole="button" onPress={() => submitOrderMutation.mutate(input)}>
      <Text>Submit order</Text>
    </Pressable>
  );
}

/** The client renderWithProviders built, held for afterEach cleanup. */
const queryClientRef: { current: QueryClient | null } = { current: null };

async function renderProbe() {
  const { queryClient } = await renderWithProviders(<SubmitOrderProbe input={input} />);
  queryClientRef.current = queryClient;
}

afterEach(() => {
  mockSubmitOrder.mockReset();
  // TanStack schedules a five-minute GC timer for each completed mutation the
  // moment its observer unmounts — the shared test client caps gcTime for
  // QUERIES only. Destroying the mutations cancels those timers; without this
  // the suite passes but jest never exits.
  for (const mutation of queryClientRef.current?.getMutationCache().getAll() ?? []) {
    mutation.destroy();
  }
  queryClientRef.current = null;
});

describe("useSubmitOrderMutation", () => {
  it("drives exactly one api call with the given input and reports the returned payload as success data", async () => {
    const user = userEvent.setup();
    mockSubmitOrder.mockResolvedValue(successResponse);

    await renderProbe();

    await user.press(screen.getByRole("button", { name: "Submit order" }));

    await waitFor(() => expect(screen.getByText("succeeded:MN4P7Q")).toBeOnTheScreen());
    expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
    expect(mockSubmitOrder).toHaveBeenCalledWith(input);
  });

  it("surfaces an api rejection as the hook's error, with the AppError kind intact", async () => {
    const user = userEvent.setup();
    // kind network is the D3 ambiguity signal — it must survive the hop from
    // the api module to the hook untouched.
    const networkFailure = new AppError({
      kind: "network",
      userMessage: "We couldn't reach the network. Check the connection and try again.",
      technicalMessage: "fetch failed",
    });
    mockSubmitOrder.mockRejectedValue(networkFailure);

    await renderProbe();

    await user.press(screen.getByRole("button", { name: "Submit order" }));

    await waitFor(() => expect(screen.getByText("failed:network")).toBeOnTheScreen());
  });
});
