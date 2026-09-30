import AsyncStorage from "@react-native-async-storage/async-storage";

import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { createJsonStorage, storageKey } from "@/core/storage";
import { createMemoryStore } from "@/core/testing";
import { addItem, getCartSnapshot, hydrateCart, type CartLine } from "@/features/cart";

import type { CreateOrderResponse } from "../model/create-order-response.schema";
import type { SavedCheckout } from "../model/pending-order.schema";
import { createCheckoutStore } from "./checkout-store";

const KEY = storageKey("checkout", "order");
const VARIANT = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";

let ownerCounter = 0;
/** Every test gets its own customer, so the shared cart store restores fresh. */
function nextOwner(): string {
  ownerCounter += 1;
  return `aaaaaaaa-0000-4000-8000-${String(ownerCounter).padStart(12, "0")}`;
}

function requestId(n: number): string {
  return `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

const line: CartLine = {
  lineId: VARIANT,
  variantId: VARIANT,
  productId: PRODUCT,
  productDisplayName: "Espresso",
  variantLabel: "250 g",
  optionSelections: [],
  imageUri: null,
  quantity: 2,
};

const success: CreateOrderResponse = {
  kind: "success",
  order_id: ORDER_ID,
  display_number: "ABC234",
  created_at: "2026-09-30T10:00:00+00:00",
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (e: unknown) => void;
};
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(options?: { failOn?: "setItem" | "getItem" | "removeItem" }) {
  const memory = createMemoryStore(options);
  const backend = createJsonStorage(memory);
  let ids = 0;
  const submit = jest.fn<Promise<CreateOrderResponse>, [unknown]>();
  const newRequestId = jest.fn(() => requestId(++ids));
  const store = createCheckoutStore(backend, { submit, newRequestId });
  const saved = (): SavedCheckout | null => {
    const raw = memory.map.get(KEY);
    return raw ? (JSON.parse(raw) as SavedCheckout) : null;
  };
  return { memory, store, submit, newRequestId, saved };
}

async function ready(store: ReturnType<typeof setup>["store"], ownerId: string) {
  await store.getState().recover(ownerId);
  expect(store.getState().ready).toBe(true);
}

beforeEach(async () => {
  setLogSink(() => {});
  await AsyncStorage.clear();
});

afterEach(() => {
  resetLogging();
});

describe("checkout store — the duplicate-order guarantee", () => {
  it("saves the request id and exact items BEFORE the first request", async () => {
    const { store, submit, saved } = setup();
    const owner = nextOwner();
    await ready(store, owner);

    submit.mockImplementation(async () => {
      // At the moment the request leaves, the same id and items are on disk.
      const record = saved();
      expect(record).toMatchObject({
        state: "pending",
        ownerId: owner,
        requestId: requestId(1),
        items: [{ variant_id: VARIANT, quantity: 2 }],
      });
      return success;
    });

    await store.getState().submit([line]);

    expect(submit).toHaveBeenCalledWith({
      clientRequestId: requestId(1),
      items: [{ variant_id: VARIANT, quantity: 2 }],
    });
    expect(store.getState().phase).toBe("confirmed");
  });

  it("sends nothing when the pending record cannot be saved", async () => {
    const { store, submit } = setup({ failOn: "setItem" });
    await ready(store, nextOwner());

    await store.getState().submit([line]);

    expect(submit).not.toHaveBeenCalled();
    expect(store.getState().phase).toBe("failure");
    expect(store.getState().failure?.retryable).toBe(true);
  });

  it("keeps the SAME request after an ambiguous result and re-sends it on retry", async () => {
    const { store, submit, saved } = setup();
    await ready(store, nextOwner());

    submit.mockRejectedValueOnce(
      new AppError({ kind: "network", userMessage: "offline", technicalMessage: "fetch failed" }),
    );
    await store.getState().submit([line]);

    expect(store.getState().phase).toBe("unknown");
    expect(saved()).toMatchObject({ state: "pending", requestId: requestId(1) });
    expect(getCartSnapshot().locked).toBe(true);

    submit.mockResolvedValueOnce(success);
    await store.getState().retry();

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1]?.[0]).toEqual(submit.mock.calls[0]?.[0]);
    expect(store.getState().phase).toBe("confirmed");
  });

  it("treats a response that fails validation as ambiguous, not as a definite failure", async () => {
    const { store, submit, saved } = setup();
    await ready(store, nextOwner());

    submit.mockRejectedValueOnce(
      new AppError({ kind: "server", userMessage: "x", code: "RPC_SCHEMA_MISMATCH" }),
    );
    await store.getState().submit([line]);

    expect(store.getState().phase).toBe("unknown");
    expect(saved()).toMatchObject({ state: "pending", requestId: requestId(1) });
  });

  it("clears the cart only after the store confirms the order", async () => {
    const { store, submit, saved } = setup();
    const owner = nextOwner();
    await ready(store, owner);
    addItem(line);
    expect(getCartSnapshot().lines).toHaveLength(1);

    const answer = deferred<CreateOrderResponse>();
    submit.mockReturnValueOnce(answer.promise);
    const sent = store.getState().submit(getCartSnapshot().lines);

    await Promise.resolve();
    await Promise.resolve();
    // In flight: the cart is held, not emptied.
    expect(getCartSnapshot().lines).toHaveLength(1);
    expect(getCartSnapshot().locked).toBe(true);

    answer.resolve(success);
    await sent;

    expect(getCartSnapshot().lines).toHaveLength(0);
    expect(getCartSnapshot().locked).toBe(false);
    expect(saved()).toMatchObject({ state: "confirmed", success: { orderId: ORDER_ID } });
  });

  it("drops the request after a definite failure, keeping the cart", async () => {
    const { store, submit, saved } = setup();
    const owner = nextOwner();
    await ready(store, owner);
    addItem(line);

    submit.mockRejectedValueOnce(
      new AppError({ kind: "unavailable", userMessage: "gone", code: "K1002" }),
    );
    await store.getState().submit(getCartSnapshot().lines);

    expect(store.getState().phase).toBe("failure");
    expect(saved()).toBeNull();
    expect(getCartSnapshot().lines).toHaveLength(1);
    expect(getCartSnapshot().locked).toBe(false);
  });

  it("reports a stock conflict without placing an order", async () => {
    const { store, submit, saved } = setup();
    await ready(store, nextOwner());

    submit.mockResolvedValueOnce({
      kind: "stock_conflict",
      conflicts: [{ variant_id: VARIANT, requested_quantity: 2, available_quantity: 1 }],
    });
    await store.getState().submit([line]);

    expect(store.getState().phase).toBe("conflict");
    expect(store.getState().conflicts).toHaveLength(1);
    expect(saved()).toBeNull();
    expect(getCartSnapshot().locked).toBe(false);
  });

  it("re-sends a pending order with its original id after a restart", async () => {
    const owner = nextOwner();
    const first = setup();
    await ready(first.store, owner);
    first.submit.mockRejectedValueOnce(
      new AppError({ kind: "network", userMessage: "offline", technicalMessage: "fetch failed" }),
    );
    await first.store.getState().submit([line]);
    expect(first.store.getState().phase).toBe("unknown");

    // A new process: a fresh store over the same disk.
    const submit = jest.fn(async () => success);
    const restarted = createCheckoutStore(createJsonStorage(first.memory), {
      submit,
      newRequestId: () => requestId(99),
    });
    await restarted.getState().recover(owner);

    expect(submit).toHaveBeenCalledWith({
      clientRequestId: requestId(1),
      items: [{ variant_id: VARIANT, quantity: 2 }],
    });
    expect(restarted.getState().phase).toBe("confirmed");
  });

  it("still treats a server error on the FIRST attempt as a definite failure", async () => {
    const { store, submit, saved } = setup();
    await ready(store, nextOwner());

    submit.mockRejectedValueOnce(
      new AppError({ kind: "server", userMessage: "x", code: "PGRST002" }),
    );
    await store.getState().submit([line]);

    expect(store.getState().phase).toBe("failure");
    expect(saved()).toBeNull();
  });

  it.each([
    [
      "an unavailable database",
      new AppError({ kind: "server", userMessage: "x", code: "PGRST002" }),
    ],
    ["an expired session", new AppError({ kind: "auth", userMessage: "x", code: "PGRST301" })],
    ["a rejected role check", new AppError({ kind: "forbidden", userMessage: "x", code: "42501" })],
  ])(
    "keeps the SAME request when a re-send after an unknown result meets %s",
    async (_label, error) => {
      const { store, submit, saved } = setup();
      await ready(store, nextOwner());

      // The first attempt may have been placed…
      submit.mockRejectedValueOnce(
        new AppError({ kind: "network", userMessage: "offline", technicalMessage: "fetch failed" }),
      );
      await store.getState().submit([line]);
      // …so an error raised BEFORE the server's duplicate check proves nothing about it.
      submit.mockRejectedValueOnce(error);
      await store.getState().retry();

      expect(store.getState().phase).toBe("unknown");
      expect(saved()).toMatchObject({ state: "pending", requestId: requestId(1) });

      submit.mockResolvedValueOnce(success);
      await store.getState().retry();
      expect(submit.mock.calls.map(([input]) => input)).toEqual([
        expect.objectContaining({ clientRequestId: requestId(1) }),
        expect.objectContaining({ clientRequestId: requestId(1) }),
        expect.objectContaining({ clientRequestId: requestId(1) }),
      ]);
      expect(store.getState().phase).toBe("confirmed");
    },
  );

  it("keeps a resumed order's id when its re-send meets a server error", async () => {
    const owner = nextOwner();
    const { memory, store, submit, saved } = setup();
    memory.map.set(
      KEY,
      JSON.stringify({
        version: 1,
        state: "pending",
        ownerId: owner,
        requestId: requestId(5),
        items: [{ variant_id: VARIANT, quantity: 2 }],
        lineSnapshots: [line],
      }),
    );
    submit.mockRejectedValueOnce(
      new AppError({ kind: "server", userMessage: "x", code: "PGRST002" }),
    );

    await store.getState().recover(owner);

    expect(store.getState().phase).toBe("unknown");
    expect(saved()).toMatchObject({ state: "pending", requestId: requestId(5) });
  });

  it("ends a re-sent request when the server's answer proves it placed nothing", async () => {
    const { store, submit, saved } = setup();
    await ready(store, nextOwner());

    submit.mockRejectedValueOnce(
      new AppError({ kind: "network", userMessage: "offline", technicalMessage: "fetch failed" }),
    );
    await store.getState().submit([line]);
    // K1002 is raised after the duplicate check: no order exists under this id.
    submit.mockRejectedValueOnce(
      new AppError({ kind: "unavailable", userMessage: "gone", code: "K1002" }),
    );
    await store.getState().retry();

    expect(store.getState().phase).toBe("failure");
    expect(saved()).toBeNull();
  });

  it("never resumes another customer's saved order", async () => {
    const ownerA = nextOwner();
    const ownerB = nextOwner();
    const { memory, store, submit, saved } = setup();
    memory.map.set(
      KEY,
      JSON.stringify({
        version: 1,
        state: "pending",
        ownerId: ownerA,
        requestId: requestId(7),
        items: [{ variant_id: VARIANT, quantity: 2 }],
        lineSnapshots: [line],
      }),
    );

    await store.getState().recover(ownerB);

    expect(submit).not.toHaveBeenCalled();
    expect(store.getState().pending).toBeNull();
    expect(saved()).toBeNull();
  });

  it("places ONE order when confirm is pressed twice before the first request leaves", async () => {
    const { store, submit, newRequestId, saved } = setup();
    await ready(store, nextOwner());
    await hydrateCart(store.getState().ownerId!);

    const answer = deferred<CreateOrderResponse>();
    submit.mockReturnValue(answer.promise);

    // Two presses in the same tick: neither has reached the network yet.
    const firstPress = store.getState().submit([line]);
    const secondPress = store.getState().submit([line]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    answer.resolve(success);
    await Promise.all([firstPress, secondPress]);

    expect(newRequestId).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
    // The UI is not left waiting on a request that was never sent…
    expect(store.getState().phase).toBe("confirmed");
    // …and no second, never-sent request is left on disk for a restart to replay.
    expect(saved()).toMatchObject({ state: "confirmed", success: { orderId: ORDER_ID } });
  });
});
