import { resetLogging, setLogSink } from "@/core/logging";
import { createJsonStorage, storageKey } from "@/core/storage";
import { createMemoryStore } from "@/core/testing";

import type { AddToCartInput, CartLine } from "../model/cart-line.schema";
import { deriveLineId } from "../model/cart-rules";
import { persistedCartSchema } from "../model/persisted-cart.schema";
import { createCartStore, selectDistinctLineCount, selectTotalQuantity } from "./cart-store";

const KEY = storageKey("cart", "lines");

const OWNER_A = "11111111-2222-4333-8444-555555555555";
const OWNER_B = "aaaaaaa1-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const espressoLine: CartLine = {
  lineId:
    "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f|1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d|e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
  variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Large · Oat Milk",
  optionSelections: [
    {
      optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
      optionValueId: "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
      optionValueLabel: "Large",
    },
    {
      optionTypeId: "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d",
      optionValueId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      optionValueLabel: "Oat Milk",
    },
  ],
  imageUri: null,
  quantity: 2,
};

const waterLine: CartLine = {
  lineId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  variantId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 3,
};

/** A line minus its derived identity — what an "Add to cart" caller passes. */
function toInput(line: CartLine): AddToCartInput {
  const { lineId: _lineId, ...input } = line;
  return input;
}

const espressoInput = toInput(espressoLine);
const waterInput = toInput(waterLine);
const espressoLineId = deriveLineId(espressoInput);

/** Same variant as espresso, a different size option VALUE: a distinct selection. */
const smallOatInput: AddToCartInput = {
  ...espressoInput,
  optionSelections: [
    {
      optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
      optionValueId: "d4c3b2a1-1234-4567-8901-234567890123",
      optionValueLabel: "Small",
    },
    espressoInput.optionSelections[1]!,
  ],
};

type RawStore = ReturnType<typeof createMemoryStore>;

function seedCart(raw: RawStore, cart: unknown) {
  raw.map.set(KEY, JSON.stringify(cart));
}

/** Parse whatever is durably under KEY back through the schema, like a cold start would. */
function readPersistedCart(raw: RawStore) {
  return persistedCartSchema.parse(JSON.parse(raw.map.get(KEY) ?? "null"));
}

/**
 * A `createMemoryStore` instrumented for the store's fire-and-forget saves:
 * it counts the writes and removes that reach the tablet, can hold writes in
 * flight (`slowWrites`) so races are deterministic, can fail writes on demand
 * (`control.failWrites`), and `idle()` waits until no storage operation is
 * pending. The store chains its queue through microtasks only, so once a
 * macrotask passes with nothing pending, the queue has drained.
 */
function trackedStore(options: { failOn?: "removeItem" | "setItem"; slowWrites?: boolean } = {}) {
  const raw = createMemoryStore(options.failOn ? { failOn: options.failOn } : undefined);
  const { getItem, setItem, removeItem } = raw;
  const ops = { reads: 0, writes: 0, removes: 0 };
  const control = { failWrites: false };
  let pending = 0;
  let writesInFlight = 0;
  let maxWritesInFlight = 0;

  const track = async <T>(run: () => Promise<T>): Promise<T> => {
    pending += 1;
    try {
      return await run();
    } finally {
      pending -= 1;
    }
  };

  raw.getItem = (key) =>
    track(async () => {
      ops.reads += 1;
      return getItem(key);
    });
  raw.setItem = (key, value) =>
    track(async () => {
      ops.writes += 1;
      writesInFlight += 1;
      maxWritesInFlight = Math.max(maxWritesInFlight, writesInFlight);
      try {
        if (options.slowWrites) await new Promise((resolve) => setTimeout(resolve, 10));
        if (control.failWrites) throw new Error("disk full");
        await setItem(key, value);
      } finally {
        writesInFlight -= 1;
      }
    });
  raw.removeItem = (key) =>
    track(async () => {
      ops.removes += 1;
      return removeItem(key);
    });

  return {
    raw,
    ops,
    control,
    maxWritesInFlight: () => maxWritesInFlight,
    /** A write has started and is waiting on the (slow) tablet. */
    writeInFlight: () => writesInFlight > 0,
    idle: async () => {
      do {
        await new Promise((resolve) => setTimeout(resolve, 1));
      } while (pending > 0);
    },
  };
}

async function until(condition: () => boolean, what: string) {
  for (let attempt = 0; !condition(); attempt += 1) {
    if (attempt > 500) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

// Ignored edits log at debug, failed writes at warn/error, discards at info:
// keep the suite silent so an expected path does not look like a broken run.
beforeEach(() => setLogSink(() => {}));
afterEach(resetLogging);

function storeOver(tracked: ReturnType<typeof trackedStore>) {
  return createCartStore(createJsonStorage(tracked.raw));
}

async function hydratedStore(options?: Parameters<typeof trackedStore>[0]) {
  const tracked = trackedStore(options);
  const useStore = storeOver(tracked);
  await useStore.getState().hydrate(OWNER_A);
  return { ...tracked, useStore };
}

describe("hydrate — owner-scoped restore", () => {
  it("restores the saved cart when the payload belongs to the customer", async () => {
    const tracked = trackedStore();
    seedCart(tracked.raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine, waterLine] });
    const useStore = storeOver(tracked);

    await useStore.getState().hydrate(OWNER_A);

    expect(useStore.getState()).toMatchObject({
      lines: [espressoLine, waterLine],
      ownerId: OWNER_A,
      hydrated: true,
      locked: false,
      saveFailed: false,
    });
    // The customer's own cart stays on the tablet.
    expect(tracked.ops.removes).toBe(0);
    expect(readPersistedCart(tracked.raw).lines).toEqual([espressoLine, waterLine]);
  });

  it("never surfaces another customer's cart, and removes it from the tablet", async () => {
    const tracked = trackedStore();
    seedCart(tracked.raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = storeOver(tracked);

    await useStore.getState().hydrate(OWNER_B);

    expect(useStore.getState()).toMatchObject({ lines: [], ownerId: OWNER_B, hydrated: true });
    expect(tracked.raw.map.has(KEY)).toBe(false);
  });

  it("starts empty on a fresh tablet without writing or removing anything", async () => {
    const tracked = trackedStore();
    const useStore = storeOver(tracked);

    await useStore.getState().hydrate(OWNER_A);

    expect(useStore.getState()).toMatchObject({ lines: [], ownerId: OWNER_A, hydrated: true });
    expect(tracked.ops).toMatchObject({ writes: 0, removes: 0 });
  });

  it.each([
    ["unparseable JSON", "{not valid json"],
    [
      "an unknown payload version",
      JSON.stringify({ version: 2, ownerId: OWNER_A, lines: [espressoLine] }),
    ],
    [
      "a line the schema rejects",
      JSON.stringify({ version: 1, ownerId: OWNER_A, lines: [{ ...espressoLine, quantity: 0 }] }),
    ],
  ])("starts empty and removes %s from the tablet", async (_label, payload) => {
    const tracked = trackedStore();
    tracked.raw.map.set(KEY, payload);
    const useStore = storeOver(tracked);

    await useStore.getState().hydrate(OWNER_A);

    expect(useStore.getState()).toMatchObject({ lines: [], hydrated: true });
    expect(tracked.raw.map.has(KEY)).toBe(false);
  });

  it("re-derives restored line identities and merges duplicate selections", async () => {
    const tracked = trackedStore();
    seedCart(tracked.raw, {
      version: 1,
      ownerId: OWNER_A,
      lines: [
        { ...espressoLine, lineId: "stale-id-a" },
        { ...espressoLine, lineId: "stale-id-b", quantity: 5 },
        waterLine,
      ],
    });
    const useStore = storeOver(tracked);

    await useStore.getState().hydrate(OWNER_A);

    expect(useStore.getState().lines).toEqual([{ ...espressoLine, quantity: 7 }, waterLine]);

    // A later add of the same selection merges with the restored line.
    useStore.getState().addItem({ ...espressoInput, quantity: 1 });
    expect(useStore.getState().lines).toEqual([{ ...espressoLine, quantity: 8 }, waterLine]);
  });

  it("reads storage once for repeated or concurrent hydrates of the same customer", async () => {
    const tracked = trackedStore();
    seedCart(tracked.raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = storeOver(tracked);

    await Promise.all([useStore.getState().hydrate(OWNER_A), useStore.getState().hydrate(OWNER_A)]);
    await useStore.getState().hydrate(OWNER_A);

    expect(tracked.ops.reads).toBe(1);
    expect(useStore.getState().lines).toEqual([espressoLine]);
  });

  it("drops the previous customer's cart from memory and disk when the customer changes", async () => {
    const tracked = trackedStore();
    seedCart(tracked.raw, { version: 1, ownerId: OWNER_B, lines: [waterLine] });
    const useStore = storeOver(tracked);

    await useStore.getState().hydrate(OWNER_B);
    expect(useStore.getState().lines).toEqual([waterLine]);

    const switching = useStore.getState().hydrate(OWNER_A);
    // Synchronously: nothing of B's session is visible while A's restore runs.
    expect(useStore.getState()).toMatchObject({ lines: [], ownerId: OWNER_A, hydrated: false });
    await switching;

    expect(useStore.getState()).toMatchObject({ lines: [], ownerId: OWNER_A, hydrated: true });
    expect(tracked.raw.map.has(KEY)).toBe(false);
  });

  it("a superseded restore never applies: the latest customer wins", async () => {
    const tracked = trackedStore();
    seedCart(tracked.raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = storeOver(tracked);

    const first = useStore.getState().hydrate(OWNER_A);
    const second = useStore.getState().hydrate(OWNER_B);
    await Promise.all([first, second]);

    expect(useStore.getState()).toMatchObject({ lines: [], ownerId: OWNER_B, hydrated: true });
    expect(tracked.raw.map.has(KEY)).toBe(false);
  });

  it("restores across a cold start: a fresh store on the same tablet reads back the saved cart", async () => {
    const first = await hydratedStore();
    first.useStore.getState().addItem(espressoInput);
    first.useStore.getState().addItem(waterInput);
    await first.idle();

    const second = createCartStore(createJsonStorage(first.raw));
    await second.getState().hydrate(OWNER_A);

    expect(second.getState().lines).toEqual([espressoLine, waterLine]);
  });
});

describe("edits — gated on hydration and the lock", () => {
  it("ignores every edit before the cart is restored, and touches no storage", async () => {
    const tracked = trackedStore();
    const useStore = storeOver(tracked);

    useStore.getState().addItem(espressoInput);
    useStore.getState().setLineQuantity(espressoLineId, 5);
    useStore.getState().removeLine(espressoLineId);
    await useStore.getState().clear();
    await tracked.idle();

    expect(useStore.getState().lines).toEqual([]);
    expect(tracked.ops).toEqual({ reads: 0, writes: 0, removes: 0 });
  });

  it("an edit racing an in-flight restore is ignored: the restored lines win, on disk too", async () => {
    const tracked = trackedStore();
    seedCart(tracked.raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = storeOver(tracked);

    const restoring = useStore.getState().hydrate(OWNER_A);
    useStore.getState().addItem(waterInput);
    await restoring;
    await tracked.idle();

    expect(useStore.getState().lines).toEqual([espressoLine]);
    expect(readPersistedCart(tracked.raw).lines).toEqual([espressoLine]);
  });

  it("ignores user edits while locked and writes nothing; unlock re-enables them", async () => {
    const tracked = trackedStore();
    seedCart(tracked.raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = storeOver(tracked);
    await useStore.getState().hydrate(OWNER_A);

    useStore.getState().lock();
    useStore.getState().addItem(waterInput);
    useStore.getState().setLineQuantity(espressoLineId, 9);
    useStore.getState().removeLine(espressoLineId);
    await tracked.idle();

    expect(useStore.getState().lines).toEqual([espressoLine]);
    expect(tracked.ops).toMatchObject({ writes: 0, removes: 0 });

    useStore.getState().unlock();
    useStore.getState().addItem(waterInput);
    await tracked.idle();
    expect(useStore.getState().lines).toEqual([espressoLine, waterLine]);
    expect(readPersistedCart(tracked.raw).lines).toEqual([espressoLine, waterLine]);
  });

  it("clear works while locked: memory empties and the saved cart is removed", async () => {
    const tracked = trackedStore();
    seedCart(tracked.raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = storeOver(tracked);
    await useStore.getState().hydrate(OWNER_A);

    useStore.getState().lock();
    await useStore.getState().clear();

    expect(useStore.getState()).toMatchObject({ lines: [], ownerId: OWNER_A, locked: true });
    expect(tracked.raw.map.has(KEY)).toBe(false);
  });

  it("a lock survives a same-customer hydrate but not a change of customer", async () => {
    const { useStore } = await hydratedStore();

    useStore.getState().lock();
    await useStore.getState().hydrate(OWNER_A);
    expect(useStore.getState().locked).toBe(true);

    await useStore.getState().hydrate(OWNER_B);
    expect(useStore.getState().locked).toBe(false);
    useStore.getState().addItem(waterInput);
    expect(useStore.getState().lines).toEqual([waterLine]);
  });
});

describe("addItem / setLineQuantity / removeLine", () => {
  it("adds a line with the derived identity and saves the owner envelope", async () => {
    const { raw, useStore, idle } = await hydratedStore();

    // A stray lineId on the input never wins over the derived identity.
    useStore.getState().addItem({ ...espressoInput, lineId: "stray" } as AddToCartInput);
    await idle();

    expect(useStore.getState().lines).toEqual([espressoLine]);
    expect(readPersistedCart(raw)).toEqual({ version: 1, ownerId: OWNER_A, lines: [espressoLine] });
  });

  it("merges the same selection and keeps different selections distinct", async () => {
    const { useStore } = await hydratedStore();

    useStore.getState().addItem(espressoInput);
    useStore.getState().addItem({ ...espressoInput, quantity: 3 });
    useStore.getState().addItem(smallOatInput);
    useStore.getState().addItem(waterInput);

    const lines = useStore.getState().lines;
    expect(lines.map((line) => line.quantity)).toEqual([5, 2, 3]);
    expect(lines.map((line) => line.lineId)).toEqual([
      espressoLineId,
      deriveLineId(smallOatInput),
      waterLine.lineId,
    ]);
  });

  it("ignores an invalid selection", async () => {
    const { ops, useStore, idle } = await hydratedStore();

    useStore.getState().addItem({ ...espressoInput, quantity: 0 });
    await idle();

    expect(useStore.getState().lines).toEqual([]);
    expect(ops.writes).toBe(0);
  });

  it("clamps a quantity change into 1..99 and ignores an unknown line", async () => {
    const { raw, useStore, idle } = await hydratedStore();
    useStore.getState().addItem(espressoInput);

    useStore.getState().setLineQuantity(espressoLineId, 0);
    expect(useStore.getState().lines[0]?.quantity).toBe(1);
    useStore.getState().setLineQuantity(espressoLineId, 500);
    expect(useStore.getState().lines[0]?.quantity).toBe(99);
    useStore.getState().setLineQuantity("unknown", 4);
    expect(useStore.getState().lines).toEqual([{ ...espressoLine, quantity: 99 }]);

    await idle();
    expect(readPersistedCart(raw).lines).toEqual([{ ...espressoLine, quantity: 99 }]);
  });

  it("removes a line; removing the last line removes the saved cart", async () => {
    const { raw, useStore, idle } = await hydratedStore();
    useStore.getState().addItem(espressoInput);
    useStore.getState().addItem(waterInput);

    useStore.getState().removeLine("unknown");
    useStore.getState().removeLine(espressoLineId);
    await idle();
    expect(readPersistedCart(raw).lines).toEqual([waterLine]);

    useStore.getState().removeLine(waterLine.lineId);
    await idle();
    expect(useStore.getState().lines).toEqual([]);
    expect(raw.map.has(KEY)).toBe(false);
  });

  it("derived summaries follow add, merge, quantity change, remove and clear", async () => {
    const { useStore } = await hydratedStore();
    const state = () => useStore.getState();
    const summary = () => [selectTotalQuantity(state()), selectDistinctLineCount(state())];

    expect(summary()).toEqual([0, 0]);
    state().addItem(espressoInput);
    expect(summary()).toEqual([2, 1]);
    state().addItem({ ...espressoInput, quantity: 3 });
    expect(summary()).toEqual([5, 1]);
    state().addItem(waterInput);
    expect(summary()).toEqual([8, 2]);
    state().setLineQuantity(espressoLineId, 10);
    expect(summary()).toEqual([13, 2]);
    state().removeLine(espressoLineId);
    expect(summary()).toEqual([3, 1]);
    await state().clear();
    expect(summary()).toEqual([0, 0]);
  });
});

describe("saving — failures and ordering", () => {
  it("a failed write keeps the cart in memory and reports saveFailed", async () => {
    const { raw, useStore, idle } = await hydratedStore({ failOn: "setItem" });

    useStore.getState().addItem(espressoInput);
    await idle();

    expect(useStore.getState().lines).toEqual([espressoLine]);
    expect(useStore.getState().saveFailed).toBe(true);
    expect(raw.map.has(KEY)).toBe(false);
  });

  it("saveFailed recovers to false on the next successful save", async () => {
    const { raw, control, useStore, idle } = await hydratedStore();

    control.failWrites = true;
    useStore.getState().addItem(espressoInput);
    await idle();
    expect(useStore.getState().saveFailed).toBe(true);

    control.failWrites = false;
    useStore.getState().addItem(waterInput);
    await idle();
    expect(useStore.getState().saveFailed).toBe(false);
    expect(readPersistedCart(raw).lines).toEqual([espressoLine, waterLine]);
  });

  it("a failed clear still empties memory and reports saveFailed", async () => {
    const tracked = trackedStore({ failOn: "removeItem" });
    seedCart(tracked.raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = storeOver(tracked);
    await useStore.getState().hydrate(OWNER_A);

    await useStore.getState().clear();

    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().saveFailed).toBe(true);
  });

  it("a new customer starts with saveFailed cleared", async () => {
    const { useStore, idle } = await hydratedStore({ failOn: "setItem" });
    useStore.getState().addItem(espressoInput);
    await idle();
    expect(useStore.getState().saveFailed).toBe(true);

    await useStore.getState().hydrate(OWNER_B);
    expect(useStore.getState().saveFailed).toBe(false);
  });

  it("rapid edits never overlap writes, coalesce, and land the final state", async () => {
    const { raw, ops, useStore, idle, writeInFlight, maxWritesInFlight } = await hydratedStore({
      slowWrites: true,
    });

    useStore.getState().addItem(espressoInput);
    await until(writeInFlight, "the first write to start");
    useStore.getState().addItem(waterInput); // queued behind the in-flight write
    useStore.getState().setLineQuantity(espressoLineId, 7); // rides along with it
    useStore.getState().removeLine(waterLine.lineId); // rides along with it
    await idle();

    expect(maxWritesInFlight()).toBe(1);
    expect(ops.writes).toBe(2);
    expect(readPersistedCart(raw).lines).toEqual([{ ...espressoLine, quantity: 7 }]);
  });

  it("a clear cannot be undone by a late earlier write", async () => {
    const { raw, useStore, writeInFlight } = await hydratedStore({ slowWrites: true });

    useStore.getState().addItem(espressoInput);
    await until(writeInFlight, "the add's write to start");
    await useStore.getState().clear();

    expect(useStore.getState().lines).toEqual([]);
    expect(raw.map.has(KEY)).toBe(false);
  });

  it("a clear issued behind a queued save resolves only once the tablet is empty", async () => {
    const { raw, useStore, writeInFlight } = await hydratedStore({ slowWrites: true });

    useStore.getState().addItem(espressoInput);
    await until(writeInFlight, "the first write to start");
    useStore.getState().addItem(waterInput); // a second save waits its turn
    await useStore.getState().clear(); // rides along with it, and it now saves []

    expect(raw.map.has(KEY)).toBe(false);
  });

  it("a customer change while a save is in flight leaves nothing of the previous customer on disk", async () => {
    const { raw, useStore, writeInFlight } = await hydratedStore({ slowWrites: true });

    useStore.getState().addItem(espressoInput);
    await until(writeInFlight, "the add's write to start");
    await useStore.getState().hydrate(OWNER_B);

    expect(useStore.getState()).toMatchObject({ lines: [], ownerId: OWNER_B, hydrated: true });
    expect(raw.map.has(KEY)).toBe(false);
  });
});
