import { resetLogging, setLogSink } from "@/core/logging";
import {
  createJsonStorage,
  storageKey,
  type KeyValueStore,
  type StorageWriteResult,
} from "@/core/storage";
import { createMemoryStore } from "@/core/testing";

import type { AddToCartInput, CartLine } from "../model/cart-line.schema";
import { deriveLineId } from "../model/cart-rules";
import { persistedCartSchema } from "../model/persisted-cart.schema";
import { createCartStore, selectDistinctLineCount, selectTotalQuantity } from "./cart-store";

const KEY = storageKey("cart", "lines");

const OWNER_A = "11111111-2222-4333-8444-555555555555";
const OWNER_B = "aaaaaaa1-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const espressoLine: CartLine = {
  lineId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f|e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
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

/** The same cappuccino line with a different quantity — what a stepper edit produces. */
function cappuccinoWithQuantity(quantity: number): CartLine {
  return { ...espressoLine, quantity };
}

/** A line minus its derived identity — what an "Add to cart" caller passes. */
function toInput(line: CartLine): AddToCartInput {
  const { lineId: _lineId, ...input } = line;
  return input;
}

const espressoInput = toInput(espressoLine);
const waterInput = toInput(waterLine);

/** The ids the pure rules derive — what the store must attach to every line. */
const espressoLineId = deriveLineId(espressoInput);
const waterLineId = deriveLineId(waterInput);

/** Same variant as espresso, a different size option VALUE: a distinct selection. */
const smallOatInput: AddToCartInput = {
  ...espressoInput,
  optionSelections: [
    {
      optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
      optionValueId: "d4c3b2a1-1234-4567-8901-234567890123",
      optionValueLabel: "Small",
    },
    {
      optionTypeId: "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d",
      optionValueId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      optionValueLabel: "Oat Milk",
    },
  ],
};

/**
 * Poll until the condition holds — how a test awaits a fire-and-forget durable
 * op (clearCart) without calling anything that would change the outcome being
 * asserted on.
 */
async function until(condition: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; !condition(); attempt += 1) {
    if (attempt > 500) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

/** Count the durable writes that actually reach the raw store. */
function countWrites(raw: ReturnType<typeof createMemoryStore>) {
  const baseSetItem = raw.setItem;
  let writes = 0;
  raw.setItem = async (key: string, value: string) => {
    writes += 1;
    return baseSetItem(key, value);
  };
  return {
    count: () => writes,
    reset: () => {
      writes = 0;
    },
  };
}

function seedCart(raw: ReturnType<typeof createMemoryStore>, cart: unknown) {
  raw.map.set(KEY, JSON.stringify(cart));
}

/** Parse whatever is durably under KEY back through the schema, like a cold start would. */
function readPersistedCart(raw: ReturnType<typeof createMemoryStore>) {
  return persistedCartSchema.parse(JSON.parse(raw.map.get(KEY) ?? "null"));
}

/**
 * Narrow a write result to its rejection and hand back the error (fails the
 * test if the write was not rejected). TS will not narrow through expect().
 */
function rejectedError(result: StorageWriteResult): Error {
  if (result.status === "rejected") return result.error;
  throw new Error(`expected the write to be rejected, but it was ${result.status}`);
}

/**
 * A memory store whose writes are SLOW (they land after a fixed delay). This
 * holds a durable write in flight long enough to make write/clear/hydrate
 * races DETERMINISTIC instead of timing-dependent: every un-serialized
 * operation that races the write (a clear's remove, a restore's read and
 * discard) completes within microtasks — long before the delayed write lands
 * — so the interleaving is fixed, not a coin flip.
 */
function slowWriteStore(options?: { failOn?: "removeItem" }) {
  const raw = createMemoryStore(options);
  const baseSetItem = raw.setItem;
  let inFlight = 0;
  let maxInFlight = 0;
  raw.setItem = async (key, value) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await baseSetItem(key, value);
    } finally {
      inFlight -= 1;
    }
  };
  return { raw, maxInFlight: () => maxInFlight };
}

/**
 * A memory store whose reads are SLOW (they return after a fixed delay). This
 * holds a restore's `backend.read` in flight long enough to make the
 * read→discard window of a hydrate DETERMINISTIC: a write enqueued right
 * after `hydrate()` starts is guaranteed to run while the restore is still
 * between its read and its mismatch discard — the exact interleaving
 * R-T03R-01 pins.
 */
function slowReadStore() {
  const raw = createMemoryStore();
  const baseGetItem = raw.getItem;
  let reads = 0;
  raw.getItem = async (key) => {
    reads += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return baseGetItem(key);
  };
  return { raw, reads: () => reads };
}

// The failure paths below log by design (see the store's clear()/persist paths);
// keep the suite silent so an expected failure does not look like a broken run.
beforeEach(() => setLogSink(() => {}));
afterEach(resetLogging);

describe("hydrate — owner-scoped restore (AC-01, AC-02)", () => {
  it("restores the persisted cart when the payload's owner is the active profile", async () => {
    const raw = createMemoryStore();
    seedCart(raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine, waterLine] });
    const useStore = createCartStore(createJsonStorage(raw));

    await useStore.getState().hydrate(OWNER_A);

    expect(useStore.getState().lines).toEqual([espressoLine, waterLine]);
    expect(useStore.getState().ownerId).toBe(OWNER_A);
    expect(useStore.getState().persistence).toBe("persisted");
    expect(useStore.getState().hydrated).toBe(true);
  });

  it("never surfaces another customer's cart: a mismatched owner is discarded and durably cleared", async () => {
    const raw = createMemoryStore();
    seedCart(raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = createCartStore(createJsonStorage(raw));

    await useStore.getState().hydrate(OWNER_B);

    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().ownerId).toBe(OWNER_B);
    // The durable discard actually happened: the key is gone, not left for the
    // next cold start to trip over.
    expect(raw.map.has(KEY)).toBe(false);
    expect(useStore.getState().persistence).toBe("persisted");
    expect(useStore.getState().hydrated).toBe(true);
  });

  it("reports clearFailed — never memoryOnly — when a mismatched payload cannot be durably discarded", async () => {
    // removeItem AND the fallback write both fail: there is no way left to
    // prove the other customer's cart left the disk.
    const raw: KeyValueStore = {
      getItem: async () => JSON.stringify({ version: 1, ownerId: OWNER_A, lines: [espressoLine] }),
      setItem: async () => {
        throw new Error("disk full");
      },
      removeItem: async () => {
        throw new Error("disk full");
      },
    };
    const useStore = createCartStore(createJsonStorage(raw));

    await useStore.getState().hydrate(OWNER_B);

    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().ownerId).toBe(OWNER_B);
    expect(useStore.getState().persistence).toBe("clearFailed");
    expect(useStore.getState().hydrated).toBe(true);
  });

  it("starts empty and persisted when nothing was ever stored (fresh tablet)", async () => {
    const useStore = createCartStore(createJsonStorage(createMemoryStore()));

    await useStore.getState().hydrate(OWNER_A);

    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().ownerId).toBe(OWNER_A);
    expect(useStore.getState().persistence).toBe("persisted");
    expect(useStore.getState().hydrated).toBe(true);
  });

  it("starts clean and durably clears an unreadable (corrupt JSON) payload", async () => {
    const raw = createMemoryStore();
    raw.map.set(KEY, "{not valid json");
    const useStore = createCartStore(createJsonStorage(raw));

    await useStore.getState().hydrate(OWNER_A);

    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().persistence).toBe("persisted");
    expect(useStore.getState().hydrated).toBe(true);
    // Shared-kiosk safety: the corrupt blob is removed, not left for the next
    // cold start — it may be a previous customer's cart.
    expect(raw.map.has(KEY)).toBe(false);
  });

  it("treats a schema-invalid payload (wrong version) as corrupt: clean start + durable clear", async () => {
    const raw = createMemoryStore();
    seedCart(raw, { version: 2, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = createCartStore(createJsonStorage(raw));

    await useStore.getState().hydrate(OWNER_A);

    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().persistence).toBe("persisted");
    expect(raw.map.has(KEY)).toBe(false);
  });

  it("treats duplicate lineIds as corrupt: clean start + durable clear", async () => {
    const raw = createMemoryStore();
    seedCart(raw, {
      version: 1,
      ownerId: OWNER_A,
      lines: [espressoLine, cappuccinoWithQuantity(5)],
    });
    const useStore = createCartStore(createJsonStorage(raw));

    await useStore.getState().hydrate(OWNER_A);

    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().persistence).toBe("persisted");
    expect(raw.map.has(KEY)).toBe(false);
  });

  it("reports clearFailed when a corrupt payload cannot be durably cleared", async () => {
    const raw: KeyValueStore = {
      getItem: async () => "{not valid json",
      setItem: async () => {
        throw new Error("disk full");
      },
      removeItem: async () => {
        throw new Error("disk full");
      },
    };
    const useStore = createCartStore(createJsonStorage(raw));

    await useStore.getState().hydrate(OWNER_A);

    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().persistence).toBe("clearFailed");
    expect(useStore.getState().hydrated).toBe(true);
  });

  it("is idempotent: hydrating again for the same owner reads storage once", async () => {
    const raw = createMemoryStore();
    seedCart(raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const baseGetItem = raw.getItem;
    let reads = 0;
    raw.getItem = async (key) => {
      reads += 1;
      return baseGetItem(key);
    };
    const useStore = createCartStore(createJsonStorage(raw));

    await useStore.getState().hydrate(OWNER_A);
    await useStore.getState().hydrate(OWNER_A);

    expect(reads).toBe(1);
  });

  it("concurrent hydrate calls for the same owner do not double-read", async () => {
    const raw = createMemoryStore();
    seedCart(raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const baseGetItem = raw.getItem;
    let reads = 0;
    raw.getItem = async (key) => {
      reads += 1;
      return baseGetItem(key);
    };
    const useStore = createCartStore(createJsonStorage(raw));

    await Promise.all([useStore.getState().hydrate(OWNER_A), useStore.getState().hydrate(OWNER_A)]);

    expect(reads).toBe(1);
    expect(useStore.getState().lines).toEqual([espressoLine]);
  });

  it("discards the previous owner's in-memory cart when the profile switches", async () => {
    const raw = createMemoryStore();
    seedCart(raw, { version: 1, ownerId: OWNER_B, lines: [waterLine] });
    const useStore = createCartStore(createJsonStorage(raw));

    // B's session: their own cart is restored into memory and stays on disk.
    await useStore.getState().hydrate(OWNER_B);
    expect(useStore.getState().lines).toEqual([waterLine]);
    expect(raw.map.has(KEY)).toBe(true);

    // Session switch to A: B's lines must not survive into A's session —
    // neither in memory nor on disk.
    await useStore.getState().hydrate(OWNER_A);

    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().ownerId).toBe(OWNER_A);
    expect(raw.map.has(KEY)).toBe(false);
    expect(useStore.getState().persistence).toBe("persisted");
    expect(useStore.getState().hydrated).toBe(true);
  });

  it("restores across a cold start: a fresh store on the same backend reads back what was persisted", async () => {
    const raw = createMemoryStore();
    const first = createCartStore(createJsonStorage(raw));
    await first.getState().hydrate(OWNER_A);
    first.setState({ lines: [espressoLine, waterLine] });
    await first.getState().persistNow();

    const second = createCartStore(createJsonStorage(raw));
    await second.getState().hydrate(OWNER_A);

    expect(second.getState().lines).toEqual([espressoLine, waterLine]);
    expect(second.getState().ownerId).toBe(OWNER_A);
    expect(second.getState().persistence).toBe("persisted");
  });
});

describe("persistNow — serialized, honest writes (AC-06)", () => {
  it("never overlaps two durable writes and lands the final state when called rapidly", async () => {
    const raw = createMemoryStore();
    const baseSetItem = raw.setItem;
    let writesStarted = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    raw.setItem = async (key, value) => {
      writesStarted += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        // A slow write is what exposes interleaving: overlapping writes would
        // push the in-flight count past one.
        await new Promise((resolve) => setTimeout(resolve, 10));
        await baseSetItem(key, value);
      } finally {
        inFlight -= 1;
      }
    };
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);

    // Simulate T04-style mutations: state changes, each followed by a
    // fire-and-forget persist request.
    const settled: Promise<StorageWriteResult>[] = [];
    for (let quantity = 1; quantity <= 5; quantity += 1) {
      useStore.setState({ lines: [cappuccinoWithQuantity(quantity)] });
      settled.push(useStore.getState().persistNow());
    }
    const results = await Promise.all(settled);

    // Every waiter resolves with the result of the actual write that flushed
    // it — all five durable here.
    expect(results).toHaveLength(5);
    for (const result of results) {
      expect(result.status).toBe("persisted");
    }
    expect(maxInFlight).toBe(1);
    // Trailing coalescing (plan decision 8): five rapid requests produced
    // fewer actual writes than requests — the queued ones collapsed into a
    // trailing write of the LATEST state.
    expect(writesStarted).toBeLessThan(5);
    expect(useStore.getState().persistence).toBe("persisted");
    expect(readPersistedCart(raw).lines).toEqual([cappuccinoWithQuantity(5)]);
  });

  it("reports memoryOnly after a failed write, then recovers to persisted on the next success", async () => {
    const raw = createMemoryStore();
    const baseSetItem = raw.setItem;
    let failWrites = true;
    raw.setItem = async (key, value) => {
      if (failWrites) throw new Error("disk full");
      await baseSetItem(key, value);
    };
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.setState({ lines: [espressoLine] });

    const failed = await useStore.getState().persistNow();
    expect(failed.status).toBe("rejected");
    // The honest status: the edit only lives in memory. Never "persisted".
    expect(useStore.getState().persistence).toBe("memoryOnly");

    // The customer edits again and the disk recovers.
    failWrites = false;
    useStore.setState({ lines: [espressoLine, waterLine] });
    const recovered = await useStore.getState().persistNow();
    expect(recovered.status).toBe("persisted");
    expect(useStore.getState().persistence).toBe("persisted");
    expect(readPersistedCart(raw).lines).toEqual([espressoLine, waterLine]);
  });

  it("persists the full owner envelope: {version: 1, ownerId, lines} round-trips through the schema", async () => {
    const raw = createMemoryStore();
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.setState({ lines: [espressoLine, waterLine] });

    const result = await useStore.getState().persistNow();

    expect(result.status).toBe("persisted");
    const persisted = readPersistedCart(raw);
    expect(persisted.version).toBe(1);
    expect(persisted.ownerId).toBe(OWNER_A);
    expect(persisted.lines).toEqual([espressoLine, waterLine]);
  });

  it("persisting an empty cart writes the empty envelope — durable empty state, not nothing", async () => {
    const raw = createMemoryStore();
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.setState({ lines: [] });

    const result = await useStore.getState().persistNow();

    expect(result.status).toBe("persisted");
    const persisted = readPersistedCart(raw);
    expect(persisted.ownerId).toBe(OWNER_A);
    expect(persisted.lines).toEqual([]);
  });

  it("skips the durable write entirely before an owner is resolved", async () => {
    const raw = createMemoryStore();
    const useStore = createCartStore(createJsonStorage(raw));
    // Pre-hydrate state changes still happen (T04 mutations use the same
    // seam), but nothing is attributable to a profile yet.
    useStore.setState({ lines: [espressoLine] });

    const result = await useStore.getState().persistNow();

    expect(result.status).toBe("rejected");
    expect(rejectedError(result).message).toBe("Cart owner is not resolved; nothing was persisted");
    expect(raw.map.has(KEY)).toBe(false);
    // The skip is not a storage failure: no memoryOnly claim, no persisted claim.
    expect(useStore.getState().persistence).toBe("unknown");
  });

  it("keeps clearFailed sticky across a failed write; a later successful write honestly clears it", async () => {
    const raw = createMemoryStore();
    let failDurable = true;
    const baseSetItem = raw.setItem;
    const baseRemoveItem = raw.removeItem;
    raw.setItem = async (key, value) => {
      if (failDurable) throw new Error("disk full");
      await baseSetItem(key, value);
    };
    raw.removeItem = async (key) => {
      if (failDurable) throw new Error("disk full");
      await baseRemoveItem(key);
    };
    seedCart(raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = createCartStore(createJsonStorage(raw));

    // Mismatched owner whose discard fails on BOTH paths → clearFailed.
    await useStore.getState().hydrate(OWNER_B);
    expect(useStore.getState().persistence).toBe("clearFailed");

    // A failed write on top of an uncleared disk must not downgrade the
    // safety warning to memoryOnly — the previous customer's data is still
    // on disk, which is the bigger hazard.
    useStore.setState({ lines: [waterLine] });
    const failedWrite = await useStore.getState().persistNow();
    expect(failedWrite.status).toBe("rejected");
    expect(useStore.getState().persistence).toBe("clearFailed");

    // A successful write physically replaces the stale payload, so the hazard
    // is genuinely resolved and clearing the warning is honest.
    failDurable = false;
    useStore.setState({ lines: [waterLine, espressoLine] });
    const recoveredWrite = await useStore.getState().persistNow();
    expect(recoveredWrite.status).toBe("persisted");
    expect(useStore.getState().persistence).toBe("persisted");
    expect(readPersistedCart(raw).lines).toEqual([waterLine, espressoLine]);
  });

  it("resolves waiters with a rejection when a durable op itself throws, and the queue keeps working", async () => {
    const raw = createMemoryStore();
    const backend = createJsonStorage(raw);
    const baseWrite = backend.write;
    let throwWrites = true;
    backend.write = async (key, value) => {
      if (throwWrites) throw new Error("storage exploded");
      return baseWrite(key, value);
    };
    const useStore = createCartStore(backend);
    await useStore.getState().hydrate(OWNER_A);
    useStore.setState({ lines: [espressoLine] });

    // A throwing op must resolve its waiter honestly rather than strand it
    // (or leak an unhandled rejection out of the fire-and-forget flush).
    const failed = await Promise.race([
      useStore.getState().persistNow(),
      new Promise<StorageWriteResult>((resolve) =>
        setTimeout(
          () => resolve({ status: "rejected", error: new Error("waiter never settled") }),
          250,
        ),
      ),
    ]);
    expect(rejectedError(failed).message).not.toBe("waiter never settled");
    expect(failed.status).toBe("rejected");
    expect(useStore.getState().persistence).toBe("memoryOnly");

    // The serialized chain survived the throw: the next write goes through.
    throwWrites = false;
    useStore.setState({ lines: [espressoLine, waterLine] });
    const recovered = await useStore.getState().persistNow();
    expect(recovered.status).toBe("persisted");
    expect(readPersistedCart(raw).lines).toEqual([espressoLine, waterLine]);
  });
});

describe("durable-op serialization — clear and hydrate racing an in-flight write", () => {
  it("a clear requested while a write is in flight runs after it: the cleared cart cannot resurrect", async () => {
    const slow = slowWriteStore();
    seedCart(slow.raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = createCartStore(createJsonStorage(slow.raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.setState({ lines: [espressoLine, waterLine] });

    // The write is in flight (it lands after the delay); clear() races it.
    const writePromise = useStore.getState().persistNow();
    const clearPromise = useStore.getState().clear();
    const [writeResult, clearResult] = await Promise.all([writePromise, clearPromise]);

    expect(writeResult.status).toBe("persisted");
    expect(clearResult.status).toBe("persisted");
    expect(useStore.getState().persistence).toBe("persisted");
    // Un-serialized, the clear removed the key while the write was still in
    // flight, so the write landed afterwards and RESURRECTED the "cleared"
    // cart. Serialized, the clear's remove runs after the write lands.
    expect(slow.raw.map.has(KEY)).toBe(false);
  });

  it("a different-owner hydrate racing an in-flight write leaves nothing of the other customer on disk", async () => {
    const slow = slowWriteStore();
    seedCart(slow.raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = createCartStore(createJsonStorage(slow.raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.setState({ lines: [espressoLine, waterLine] });

    const writePromise = useStore.getState().persistNow();
    const hydratePromise = useStore.getState().hydrate(OWNER_B);
    await Promise.all([writePromise, hydratePromise]);

    // The other customer's lines never entered memory...
    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().ownerId).toBe(OWNER_B);
    expect(useStore.getState().hydrated).toBe(true);
    expect(useStore.getState().persistence).toBe("persisted");
    // ...and the write that was in flight landed first, then the mismatch
    // discard removed it: disk ends genuinely empty, not holding customer
    // A's cart for the next cold start.
    expect(slow.raw.map.has(KEY)).toBe(false);
  });

  it("a clear's fallback write never overlaps an in-flight queue write", async () => {
    // removeItem fails, so clear() must take the overwrite fallback — the
    // write that used to run OUTSIDE the queue and could sit in the backend
    // at the same time as a queue write.
    const slow = slowWriteStore({ failOn: "removeItem" });
    seedCart(slow.raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = createCartStore(createJsonStorage(slow.raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.setState({ lines: [espressoLine, waterLine] });

    const writePromise = useStore.getState().persistNow();
    const clearPromise = useStore.getState().clear();
    const [writeResult, clearResult] = await Promise.all([writePromise, clearPromise]);

    expect(writeResult.status).toBe("persisted");
    expect(clearResult.status).toBe("persisted");
    // Queue write and clear-fallback write must never be inside the backend
    // at the same time — un-serialized, they overlapped (max 2 in flight);
    // serialization holds it to 1.
    expect(slow.maxInFlight()).toBe(1);
    // And the fallback landed LAST: durable empty state, not the cleared cart.
    expect(readPersistedCart(slow.raw).lines).toEqual([]);
  });

  it("a write enqueued mid-restore survives the mismatch discard: the restore's read and discard are ONE op", async () => {
    // R-T03R-01: restore() sets ownerId synchronously, so a mutation racing
    // the read passes the pre-owner guard and enqueues a REAL write. With the
    // read as one chain op and the discard enqueued in its continuation, that
    // write landed BETWEEN them — and the discard then wiped it: memory held
    // the cart, disk was empty, persistence said "persisted". Folding read and
    // discard into one op makes the write land AFTER the whole restore, with
    // the post-restore state.
    const slow = slowReadStore();
    seedCart(slow.raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = createCartStore(createJsonStorage(slow.raw));

    // hydrate(B) while the disk holds A's cart → mismatch discard path. The
    // read is gated (10ms); the "mutation" below lands inside that window.
    const hydratePromise = useStore.getState().hydrate(OWNER_B);
    // Let the restore START: restore() runs one microtask behind hydrate(),
    // and sets ownerId synchronously before its first await — spin until the
    // mid-restore window is open (owner set, gated read still in flight).
    while (useStore.getState().ownerId !== OWNER_B) {
      await Promise.resolve();
    }
    // Simulate the mid-restore mutation: the state seam T04 mutations use.
    useStore.setState({ lines: [waterLine] });
    const writePromise = useStore.getState().persistNow();
    const [writeResult] = await Promise.all([writePromise, hydratePromise]);

    expect(writeResult.status).toBe("persisted");
    // The write survived the discard AND carried the post-restore owner: disk
    // holds B's mutated cart, honestly reported.
    expect(useStore.getState().persistence).toBe("persisted");
    const persisted = readPersistedCart(slow.raw);
    expect(persisted.ownerId).toBe(OWNER_B);
    expect(persisted.lines).toEqual([waterLine]);
  });
});

describe("clear — owner-aware template semantics", () => {
  it("clears the in-memory lines immediately and the durable value, keeping the owner", async () => {
    const raw = createMemoryStore();
    seedCart(raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);

    const result = await useStore.getState().clear();

    expect(result.status).toBe("persisted");
    expect(useStore.getState().lines).toEqual([]);
    // Clearing the cart is not a profile switch — the owner stays.
    expect(useStore.getState().ownerId).toBe(OWNER_A);
    expect(useStore.getState().persistence).toBe("persisted");
    expect(raw.map.has(KEY)).toBe(false);
  });

  it("recovers with the overwrite fallback when removeItem fails, so a cold start starts clean", async () => {
    const raw = createMemoryStore({ failOn: "removeItem" });
    seedCart(raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);

    const result = await useStore.getState().clear();

    // The fallback overwrite recovered: a genuine durable success — never
    // memoryOnly, which would undersell what happened.
    expect(result.status).toBe("persisted");
    expect(useStore.getState().persistence).toBe("persisted");

    // Simulate a COLD START: a fresh store reading the same backend.
    const afterRestart = createCartStore(createJsonStorage(raw));
    await afterRestart.getState().hydrate(OWNER_A);
    expect(afterRestart.getState().lines).toEqual([]);
  });

  it("reports clearFailed — never persisted or memoryOnly — when nothing durable succeeds", async () => {
    const raw: KeyValueStore = {
      getItem: async () => null,
      setItem: async () => {
        throw new Error("disk full");
      },
      removeItem: async () => {
        throw new Error("disk full");
      },
    };
    const useStore = createCartStore(createJsonStorage(raw));

    const result = await useStore.getState().clear();

    expect(result.status).toBe("rejected");
    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().persistence).toBe("clearFailed");
  });

  it("resolves with a rejection — never rejects itself — when the backend remove THROWS", async () => {
    // R-T03R-02: JsonStorage maps its own failures to results, so the throw
    // must be at the JsonStorage seam itself (like the waiter-throw test
    // patches backend.write). A throwing durable op still comes back as a
    // result: clear() resolves, persistence lands on clearFailed, and T05's
    // sign-out cleanup can branch on the outcome instead of catching.
    const raw = createMemoryStore();
    seedCart(raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const backend = createJsonStorage(raw);
    backend.remove = async () => {
      throw new Error("removeItem exploded");
    };
    const useStore = createCartStore(backend);
    await useStore.getState().hydrate(OWNER_A);

    const result = await useStore.getState().clear();

    expect(result.status).toBe("rejected");
    expect(rejectedError(result).message).toBe("removeItem exploded");
    expect(useStore.getState().persistence).toBe("clearFailed");
    // The throw skipped the fallback: the previous customer's payload is
    // still on disk — the honest unknown, for the auth emergency path to
    // handle, never a fake "persisted".
    expect(readPersistedCart(raw).lines).toEqual([espressoLine]);
    // And the chain survived the throw — the next durable write goes through.
    useStore.setState({ lines: [espressoLine] });
    const write = await useStore.getState().persistNow();
    expect(write.status).toBe("persisted");
    expect(readPersistedCart(raw).lines).toEqual([espressoLine]);
  });

  it("never rejects hydrate when the read op THROWS: corrupt-payload handling, clean start", async () => {
    // R-T03R-02's read half, at the JsonStorage seam (a throwing KeyValueStore
    // getItem is already mapped to a rejected result by core/storage — that
    // path is pinned by the corrupt-payload tests above; this one makes the
    // READ OP itself throw, which only the store's own catch can absorb).
    const raw = createMemoryStore();
    seedCart(raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const backend = createJsonStorage(raw);
    backend.read = async () => {
      throw new Error("read exploded");
    };
    const useStore = createCartStore(backend);

    await expect(useStore.getState().hydrate(OWNER_A)).resolves.toBeUndefined();

    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().hydrated).toBe(true);
    expect(useStore.getState().ownerId).toBe(OWNER_A);
    expect(useStore.getState().persistence).toBe("persisted");
    // The attempted durable clear still ran after the throwing read.
    expect(raw.map.has(KEY)).toBe(false);
  });

  it("before an owner is resolved, clear() never writes an ownerless fallback envelope", async () => {
    // R-T03R-03: pre-owner, a failed remove must NOT fall back to writing an
    // empty envelope — `ownerId: null` fails the persisted-cart schema, so
    // the "fallback" would leave a payload our own next restore rejects as
    // corrupt. Failing closed (clearFailed) lets the auth emergency
    // namespace reset handle the stale data instead.
    const raw = createMemoryStore({ failOn: "removeItem" });
    seedCart(raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = createCartStore(createJsonStorage(raw));

    const result = await useStore.getState().clear();

    expect(result.status).toBe("rejected");
    expect(rejectedError(result).message).toBe(
      "durable remove failed and no owner is resolved to write an empty envelope",
    );
    expect(useStore.getState().persistence).toBe("clearFailed");
    expect(useStore.getState().lines).toEqual([]);
    // No fallback write happened: the previous (stale) payload is still the
    // ONLY thing on disk, for the emergency reset to handle.
    expect(JSON.parse(raw.map.get(KEY) ?? "null")).toEqual({
      version: 1,
      ownerId: OWNER_A,
      lines: [espressoLine],
    });
  });
});

describe("addItem — add, merge, distinct lines (AC-03)", () => {
  it("appends a line with the DERIVED lineId and persists the envelope", async () => {
    const raw = createMemoryStore();
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);

    useStore.getState().addItem(espressoInput);
    await useStore.getState().persistNow();

    const lines = useStore.getState().lines;
    expect(lines).toEqual([{ ...espressoInput, lineId: espressoLineId }]);
    const persisted = readPersistedCart(raw);
    expect(persisted.ownerId).toBe(OWNER_A);
    expect(persisted.lines).toEqual(lines);
  });

  it("re-adding the same selection merges by summing quantities (2+3→5): one line on disk", async () => {
    const raw = createMemoryStore();
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);

    useStore.getState().addItem(espressoInput);
    useStore.getState().addItem({ ...espressoInput, quantity: 3 });
    await useStore.getState().persistNow();

    expect(useStore.getState().lines).toEqual([
      { ...espressoInput, lineId: espressoLineId, quantity: 5 },
    ]);
    const persisted = readPersistedCart(raw);
    expect(persisted.lines).toHaveLength(1);
    expect(persisted.lines[0]?.quantity).toBe(5);
  });

  it("a different option selection or a different variant creates a distinct line", async () => {
    const raw = createMemoryStore();
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);

    useStore.getState().addItem(espressoInput);
    useStore.getState().addItem(smallOatInput);
    useStore.getState().addItem(waterInput);
    await useStore.getState().persistNow();

    const lines = useStore.getState().lines;
    expect(lines).toHaveLength(3);
    expect(new Set(lines.map((line) => line.lineId)).size).toBe(3);
    expect(readPersistedCart(raw).lines).toHaveLength(3);
  });

  it("ignores schema-invalid input as a no-op: no line, no durable write", async () => {
    const raw = createMemoryStore();
    const writes = countWrites(raw);
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);

    useStore.getState().addItem({ ...espressoInput, quantity: 0 });
    useStore
      .getState()
      .addItem({ ...espressoInput, variantId: undefined } as unknown as AddToCartInput);
    useStore.getState().addItem({ ...espressoInput, quantity: "2" } as unknown as AddToCartInput);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useStore.getState().lines).toEqual([]);
    expect(writes.count()).toBe(0);
    expect(raw.map.has(KEY)).toBe(false);
  });

  it("never trusts a stray lineId on the input: the derived identity wins", async () => {
    const raw = createMemoryStore();
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);

    useStore
      .getState()
      .addItem({ ...espressoInput, lineId: "not-the-derived-id" } as AddToCartInput);
    await useStore.getState().persistNow();

    expect(useStore.getState().lines[0]?.lineId).toBe(espressoLineId);
    expect(readPersistedCart(raw).lines[0]?.lineId).toBe(espressoLineId);
  });

  it("a failed durable write after addItem keeps the line in memory and reports memoryOnly", async () => {
    // R-T04-02: the mutation-level half of AC-06 — a mutation whose write
    // fails is kept in memory and honestly reported, never silently dropped
    // and never claimed as persisted. (setLineQuantity/removeLine persist
    // through the same queue seam, so one test pins the contract for all
    // three.)
    const raw = createMemoryStore();
    const baseSetItem = raw.setItem;
    let failWrites = true;
    raw.setItem = async (key: string, value: string) => {
      if (failWrites) throw new Error("disk full");
      await baseSetItem(key, value);
    };
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);

    useStore.getState().addItem(espressoInput);
    // Settle the queue: a persistNow covers the request and resolves with the
    // actual (failed) write's result.
    const failed = await useStore.getState().persistNow();

    expect(failed.status).toBe("rejected");
    // The line is KEPT — the edit happened; only the save failed.
    expect(useStore.getState().lines).toEqual([{ ...espressoInput, lineId: espressoLineId }]);
    expect(useStore.getState().persistence).toBe("memoryOnly");
    expect(raw.map.has(KEY)).toBe(false);
  });
});

describe("setLineQuantity / removeLine — quantity bounds and removal (AC-04)", () => {
  it("updates the line and persists, clamping into 1..99; an unknown lineId is a no-op", async () => {
    const raw = createMemoryStore();
    const writes = countWrites(raw);
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.getState().addItem(espressoInput);
    await useStore.getState().persistNow();

    const line = () => useStore.getState().lines[0];

    useStore.getState().setLineQuantity(espressoLineId, 0);
    expect(line()?.quantity).toBe(1);

    useStore.getState().setLineQuantity(espressoLineId, 150);
    expect(line()?.quantity).toBe(99);

    useStore.getState().setLineQuantity(espressoLineId, 2.7);
    expect(line()?.quantity).toBe(2);

    // Settle the trailing writes from the clamp edits before taking the
    // counter baseline, so the count below proves only the no-op's behavior.
    await useStore.getState().persistNow();

    // Unknown line: nothing changes in memory, and nothing is enqueued.
    writes.reset();
    useStore.getState().setLineQuantity("no-such-line", 5);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(line()?.quantity).toBe(2);
    expect(writes.count()).toBe(0);

    expect(readPersistedCart(raw).lines).toEqual([
      { ...espressoInput, lineId: espressoLineId, quantity: 2 },
    ]);
  });

  it("removes the line and persists; an unknown lineId is a no-op", async () => {
    const raw = createMemoryStore();
    const writes = countWrites(raw);
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.getState().addItem(espressoInput);
    useStore.getState().addItem(waterInput);
    await useStore.getState().persistNow();

    writes.reset();
    useStore.getState().removeLine("no-such-line");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useStore.getState().lines).toHaveLength(2);
    expect(writes.count()).toBe(0);

    useStore.getState().removeLine(espressoLineId);
    expect(useStore.getState().lines).toEqual([{ ...waterInput, lineId: waterLineId }]);
    await useStore.getState().persistNow();
    expect(readPersistedCart(raw).lines).toEqual([{ ...waterInput, lineId: waterLineId }]);
  });
});

describe("lock — interaction lock for critical operations (AC-09)", () => {
  it("while locked, user-driven mutations are no-ops and enqueue no durable write", async () => {
    const raw = createMemoryStore();
    const writes = countWrites(raw);
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.getState().addItem(espressoInput);
    await useStore.getState().persistNow();

    useStore.getState().lock();
    expect(useStore.getState().locked).toBe(true);

    writes.reset();
    useStore.getState().addItem(waterInput);
    useStore.getState().setLineQuantity(espressoLineId, 50);
    useStore.getState().removeLine(espressoLineId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // State unchanged — and no write was ever enqueued to the queue.
    expect(useStore.getState().lines).toEqual([{ ...espressoInput, lineId: espressoLineId }]);
    expect(writes.count()).toBe(0);
  });

  it("clearCart is NOT blocked by the lock: memory empties and the durable clear still runs", async () => {
    const raw = createMemoryStore();
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.getState().addItem(espressoInput);
    await useStore.getState().persistNow();
    expect(raw.map.has(KEY)).toBe(true);

    useStore.getState().lock();
    useStore.getState().clearCart();

    // Memory is empty immediately; the durable clear ran despite the lock.
    expect(useStore.getState().lines).toEqual([]);
    await until(() => !raw.map.has(KEY), "the durable clear to remove the key");
    expect(useStore.getState().persistence).toBe("persisted");
    expect(useStore.getState().locked).toBe(true);
  });

  it("unlock() re-enables user mutations", async () => {
    const raw = createMemoryStore();
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);

    useStore.getState().lock();
    useStore.getState().addItem(espressoInput);
    expect(useStore.getState().lines).toEqual([]);

    useStore.getState().unlock();
    expect(useStore.getState().locked).toBe(false);
    useStore.getState().addItem(espressoInput);
    expect(useStore.getState().lines).toEqual([{ ...espressoInput, lineId: espressoLineId }]);
    await useStore.getState().persistNow();
    expect(readPersistedCart(raw).lines).toHaveLength(1);
  });

  it("a lock never survives an owner switch: the next customer's mutations are not silently blocked", async () => {
    // R-T04-01: a lock belongs to ONE owner's critical operation. No sanctioned
    // flow locks across an owner switch, and a stale lock would silently block
    // the next customer's mutations with no unlock path they could reach.
    const raw = createMemoryStore();
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.getState().lock();
    expect(useStore.getState().locked).toBe(true);

    // The profile switches mid-session: the restore's reset must clear the
    // previous customer's lock along with their lines.
    await useStore.getState().hydrate(OWNER_B);

    expect(useStore.getState().ownerId).toBe(OWNER_B);
    expect(useStore.getState().locked).toBe(false);

    // The next customer can actually use the cart — not a silent no-op.
    useStore.getState().addItem(waterInput);
    expect(useStore.getState().lines).toEqual([{ ...waterInput, lineId: waterLineId }]);
    await useStore.getState().persistNow();
    expect(readPersistedCart(raw).lines).toEqual([{ ...waterInput, lineId: waterLineId }]);
  });

  it("a lock survives a same-owner re-hydrate: the idempotent no-op never touches the lock", async () => {
    // A legitimate checkout holds its lock across anything that does NOT switch
    // the profile: the same-owner hydrate returns early and must not unlock.
    const raw = createMemoryStore();
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.getState().lock();

    await useStore.getState().hydrate(OWNER_A);

    expect(useStore.getState().locked).toBe(true);
    useStore.getState().addItem(espressoInput);
    expect(useStore.getState().lines).toEqual([]);
  });
});

describe("hydration gate — user mutations wait for the restore (R-T03R2-01)", () => {
  it("before the first hydrate, user mutations are no-ops: no memory change, no write", async () => {
    const raw = createMemoryStore();
    const writes = countWrites(raw);
    const useStore = createCartStore(createJsonStorage(raw));

    useStore.getState().addItem(espressoInput);
    useStore.getState().setLineQuantity(espressoLineId, 5);
    useStore.getState().removeLine(espressoLineId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().ownerId).toBe(null);
    expect(useStore.getState().hydrated).toBe(false);
    expect(writes.count()).toBe(0);
    expect(raw.map.has(KEY)).toBe(false);
    expect(useStore.getState().persistence).toBe("unknown");
  });

  it("locked AND not hydrated is still a no-op", async () => {
    const raw = createMemoryStore();
    const writes = countWrites(raw);
    const useStore = createCartStore(createJsonStorage(raw));

    useStore.getState().lock();
    useStore.getState().addItem(espressoInput);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().locked).toBe(true);
    expect(useStore.getState().hydrated).toBe(false);
    expect(writes.count()).toBe(0);
  });

  it("a mutation racing an in-flight restore is a no-op: the restore's lines win, on disk too", async () => {
    // R-T03R2-01: without the hydrated gate, a mid-restore addItem enters
    // memory, a write is enqueued (the ownerId is already set synchronously),
    // the restore outcome then clobbers memory — and the eagerly-captured
    // envelope lands the PRE-restore mutation on disk, so the next cold start
    // restores the wrong cart.
    const slow = slowReadStore();
    seedCart(slow.raw, { version: 1, ownerId: OWNER_B, lines: [waterLine] });
    const useStore = createCartStore(createJsonStorage(slow.raw));

    const hydratePromise = useStore.getState().hydrate(OWNER_B);
    // Open the mid-restore window: ownerId set synchronously, read still gated.
    while (useStore.getState().ownerId !== OWNER_B) {
      await Promise.resolve();
    }
    expect(useStore.getState().hydrated).toBe(false);

    useStore.getState().addItem(espressoInput);
    await hydratePromise;
    // Let any (wrongly) enqueued trailing write settle before judging disk.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(useStore.getState().lines).toEqual([waterLine]);
    expect(readPersistedCart(slow.raw).lines).toEqual([waterLine]);
  });
});

describe("clearCart — the UI-facing clear (AC-05)", () => {
  it("clears memory immediately and durably: the key is removed, the owner kept", async () => {
    const raw = createMemoryStore();
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.getState().addItem(espressoInput);
    useStore.getState().addItem(waterInput);
    await useStore.getState().persistNow();
    expect(raw.map.has(KEY)).toBe(true);

    useStore.getState().clearCart();

    expect(useStore.getState().lines).toEqual([]);
    await until(() => !raw.map.has(KEY), "the durable clear to remove the key");
    expect(useStore.getState().ownerId).toBe(OWNER_A);
    expect(useStore.getState().persistence).toBe("persisted");
  });

  it("remove-fails-but-overwrite-succeeds → durable empty envelope on disk, persisted (never memoryOnly)", async () => {
    const raw = createMemoryStore({ failOn: "removeItem" });
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);
    useStore.getState().addItem(espressoInput);
    await useStore.getState().persistNow();
    expect(readPersistedCart(raw).lines).toHaveLength(1);

    useStore.getState().clearCart();
    expect(useStore.getState().lines).toEqual([]);

    await until(
      () => raw.map.has(KEY) && readPersistedCart(raw).lines.length === 0,
      "the fallback overwrite to land the empty envelope",
    );
    expect(useStore.getState().persistence).toBe("persisted");
  });

  it("both remove and overwrite fail → clearFailed, never memoryOnly", async () => {
    const raw: KeyValueStore = {
      getItem: async () => JSON.stringify({ version: 1, ownerId: OWNER_A, lines: [espressoLine] }),
      setItem: async () => {
        throw new Error("disk full");
      },
      removeItem: async () => {
        throw new Error("disk full");
      },
    };
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);
    expect(useStore.getState().lines).toEqual([espressoLine]);

    useStore.getState().clearCart();
    expect(useStore.getState().lines).toEqual([]);

    await until(
      () => useStore.getState().persistence === "clearFailed",
      "clearFailed to be reported",
    );
    expect(useStore.getState().lines).toEqual([]);
  });

  it("before the first hydrate, clearCart is a no-op: no durable clear runs", async () => {
    const raw = createMemoryStore();
    seedCart(raw, { version: 1, ownerId: OWNER_A, lines: [espressoLine] });
    const useStore = createCartStore(createJsonStorage(raw));

    useStore.getState().clearCart();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useStore.getState().lines).toEqual([]);
    expect(useStore.getState().hydrated).toBe(false);
    expect(useStore.getState().ownerId).toBe(null);
    expect(useStore.getState().persistence).toBe("unknown");
    // The durable clear never ran — pre-restore discards belong to hydrate().
    expect(raw.map.has(KEY)).toBe(true);
  });
});

describe("derived summaries — totalQuantity and distinctLineCount (AC-08)", () => {
  it("recompute from state after add, merge, quantity change, remove, and clear", async () => {
    const raw = createMemoryStore();
    const useStore = createCartStore(createJsonStorage(raw));
    await useStore.getState().hydrate(OWNER_A);

    const state = () => useStore.getState();
    expect(selectTotalQuantity(state())).toBe(0);
    expect(selectDistinctLineCount(state())).toBe(0);

    state().addItem(espressoInput);
    expect(selectTotalQuantity(state())).toBe(2);
    expect(selectDistinctLineCount(state())).toBe(1);

    state().addItem({ ...espressoInput, quantity: 3 });
    expect(selectTotalQuantity(state())).toBe(5);
    expect(selectDistinctLineCount(state())).toBe(1);

    state().addItem(waterInput);
    expect(selectTotalQuantity(state())).toBe(8);
    expect(selectDistinctLineCount(state())).toBe(2);

    state().setLineQuantity(espressoLineId, 10);
    expect(selectTotalQuantity(state())).toBe(13);
    expect(selectDistinctLineCount(state())).toBe(2);

    state().removeLine(espressoLineId);
    expect(selectTotalQuantity(state())).toBe(3);
    expect(selectDistinctLineCount(state())).toBe(1);

    await useStore.getState().persistNow();
    state().clearCart();
    expect(selectTotalQuantity(state())).toBe(0);
    expect(selectDistinctLineCount(state())).toBe(0);
    await until(() => !raw.map.has(KEY), "the durable clear to remove the key");
  });
});
