import { Text } from "react-native";
import { type QueryClient } from "@tanstack/react-query";

import { AppError } from "@/core/errors";
import {
  act,
  createTestQueryClient,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/core/testing";

import { type OrderStatusUpdate } from "../model/order-status-update.schema";
import { updateOrderStatus, type UpdateOrderStatusInput } from "../api/update-order-status";

import { preparationKeys } from "./keys";
import { useUpdateOrderStatusMutation } from "./use-update-order-status-mutation";

/**
 * Hook-level contract test, following T03's remediation convention (Probe +
 * renderWithProviders, the api module mocked at the feature's own boundary —
 * a hook test must not know Supabase exists). The api module's own wire
 * contract is covered in `api/update-order-status.test.ts`; what this file
 * pins is what the hook does AROUND the write: the invalidation scope, the
 * in-flight state the per-card UI disables on, and the never-auto-retry
 * guarantee for a state-changing write.
 */

jest.mock("../api/update-order-status", () => ({
  updateOrderStatus: jest.fn(),
}));

const ORDER_ID = "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";

/** The validated projection a `new → preparing` success returns (T01 shape). */
const preparingUpdate: OrderStatusUpdate = {
  order_id: ORDER_ID,
  display_number: "AB2CD4",
  status: "preparing",
  assigned_preparation_id: "3d0e9c14-64e8-4b6b-9d55-1f7d2a9c0e88",
  completed_at: null,
  cancelled_at: null,
  cancellation_reason: null,
  updated_at: "2026-08-26T05:00:08.123456+00:00",
};

/**
 * The shared test client, plus mutation gcTime: Infinity. A completed
 * useMutation otherwise leaves a five-minute GC timer (query-core's default
 * mutation gcTime) on the event loop after the tree unmounts, and jest then
 * never exits ("Jest did not exit one second after the test run has
 * completed"). gcTime: Infinity never schedules that timer; the shared helper
 * already gives queries the same treatment. Test hygiene only — nothing here
 * touches the retry/pending/invalidation behaviour under test.
 */
function createMutationTestClient(): QueryClient {
  const client = createTestQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    mutations: { ...client.getDefaultOptions().mutations, gcTime: Infinity },
  });
  return client;
}

/** The input a Start-preparing press produces. */
const startPreparingInput: UpdateOrderStatusInput = {
  orderId: ORDER_ID,
  targetStatus: "preparing",
};

/**
 * Renders the mutation state a screen consumes — the pending flag the action
 * disables on (design decision 5), the returned status, and the error state —
 * and fires the write on press, exactly as an action button would.
 */
function MutationProbe({ input }: { input: UpdateOrderStatusInput }) {
  const mutation = useUpdateOrderStatusMutation();
  return (
    <Text accessibilityRole="button" onPress={() => mutation.mutate(input)}>
      {mutation.isPending
        ? "pending"
        : mutation.isError
          ? "error"
          : mutation.data
            ? mutation.data.status
            : "idle"}
    </Text>
  );
}

describe("useUpdateOrderStatusMutation", () => {
  const updateMock = updateOrderStatus as jest.MockedFunction<typeof updateOrderStatus>;

  afterEach(() => {
    updateMock.mockReset();
  });

  it("runs the write with the input, then invalidates every preparation query", async () => {
    updateMock.mockResolvedValue(preparingUpdate);

    const queryClient = createMutationTestClient();
    // The spy calls through — the real invalidation still happens; the
    // assertion pins the SCOPE the hook invalidates.
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const user = userEvent.setup();
    await renderWithProviders(<MutationProbe input={startPreparingInput} />, { queryClient });

    await user.press(screen.getByRole("button"));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(startPreparingInput));
    // A status change can move an order between board groups, move it out of
    // the board into history, and change the detail projection — every query
    // in this feature reads the same rows, so preparationKeys.all IS the
    // narrow scope for this write.
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: preparationKeys.all }),
    );

    invalidateSpy.mockRestore();
  });

  it("is pending while the write is in flight, then exposes the returned status", async () => {
    let resolveWrite!: (value: OrderStatusUpdate) => void;
    updateMock.mockImplementation(
      () =>
        new Promise<OrderStatusUpdate>((resolve) => {
          resolveWrite = resolve;
        }),
    );

    const user = userEvent.setup();
    await renderWithProviders(<MutationProbe input={startPreparingInput} />, {
      queryClient: createMutationTestClient(),
    });

    expect(screen.getByText("idle")).toBeOnTheScreen();

    await user.press(screen.getByRole("button"));

    // The write is still unresolved — exactly the in-flight state the UI must
    // disable the action on so a repeat press cannot fire a second write.
    await waitFor(() => expect(screen.getByText("pending")).toBeOnTheScreen());

    await act(async () => {
      resolveWrite(preparingUpdate);
    });
    await waitFor(() => expect(screen.getByText("preparing")).toBeOnTheScreen());
  });

  it("rejects once — a write is never auto-retried", async () => {
    // The K1004 the server answers a stale transition with: the conflict the
    // UI must surface (AC-10), never swallow or re-fire.
    updateMock.mockRejectedValue(
      new AppError({
        kind: "state-conflict",
        userMessage: "This order has already been updated.",
        code: "K1004",
      }),
    );

    const user = userEvent.setup();
    await renderWithProviders(<MutationProbe input={startPreparingInput} />, {
      queryClient: createMutationTestClient(),
    });

    await user.press(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByText("error")).toBeOnTheScreen());
    // The shared QueryClient disables mutation retries and this hook adds no
    // override, so a rejected write surfaces after ONE attempt — a blind
    // retry of a state change could repeat its effect.
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
