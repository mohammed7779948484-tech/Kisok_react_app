import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { createJsonStorage, storageKey, type StorageWriteResult } from "@/core/storage";
import { createMemoryStore } from "@/core/testing";
import type { CartLine } from "@/features/cart";

import type { CreateOrderResponse } from "../model/create-order-response.schema";
import { checkoutAttemptSchema, type CheckoutAttempt } from "../model/checkout-attempt.schema";
import { normalizeCartLines, type NormalizedRequest } from "../model/normalized-request";
import type { SubmitOrderInput } from "../api/submit-order";
import { classifySubmitOutcome, createAttemptStore, type AttemptStoreDeps } from "./attempt-store";

/**
 * lucide-react-native resolves (via the `react-native` condition) to an
 * untransformed ESM entry under jest-expo, so no test in this repo can
 * value-import it without a jest-config change. This suite renders no
 * lucide-using component — but the store's default deps bind the Cart
 * feature's PUBLIC index, and that index re-exports the cart's components and
 * screen, which value-import lucide — so the module graph needs the
 * standardized stand-ins (the use-cart.test.tsx precedent) just to load. The
 * icons are decorative SVGs; nothing here asserts on them.
 */
jest.mock("lucide-react-native", () => {
  // Null-rendering stand-ins need no import at all — a component returning
  // null references nothing from react or react-native — which keeps the
  // factory free of `require()` (tests lint with --max-warnings=0).
  const makeIcon = (name: string) => Object.assign(() => null, { displayName: name });
  return {
    Minus: makeIcon("Minus"),
    Plus: makeIcon("Plus"),
    Trash2: makeIcon("Trash2"),
    ImageOff: makeIcon("ImageOff"),
    ShoppingCart: makeIcon("ShoppingCart"),
  };
});

const KEY = storageKey("checkout", "attempt");

const OWNER_A = "11111111-2222-4333-8444-555555555555";
const OWNER_B = "aaaaaaa1-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const CAPPUCCINO_VARIANT_ID = "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f";
const WATER_VARIANT_ID = "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d";

const sizeSelection: CartLine["optionSelections"][number] = {
  optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
  optionValueId: "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
  optionValueLabel: "Large",
};

const oatMilkSelection: CartLine["optionSelections"][number] = {
  optionTypeId: "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d",
  optionValueId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  optionValueLabel: "Oat Milk",
};

/** One option-bearing line: cappuccino with size + oat milk selections. */
const CAPPUCCINO_LINE: CartLine = {
  lineId: `${CAPPUCCINO_VARIANT_ID}|${oatMilkSelection.optionValueId}|${sizeSelection.optionValueId}`,
  variantId: CAPPUCCINO_VARIANT_ID,
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Large · Oat Milk",
  optionSelections: [sizeSelection, oatMilkSelection],
  imageUri: null,
  quantity: 2,
};

/** One plain line: water, no options, so only the variantId identifies it. */
const WATER_LINE: CartLine = {
  lineId: WATER_VARIANT_ID,
  variantId: WATER_VARIANT_ID,
  productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 3,
};

/** The submitted cart. */
const LINES: CartLine[] = [CAPPUCCINO_LINE, WATER_LINE];

/** The real T02 rules compute the normalized request — real behavior, not a mock. */
const NORMALIZED: NormalizedRequest = normalizeCartLines(LINES);

/** A different logical request: same variant, different quantity → different fingerprint. */
const CHANGED_NORMALIZED: NormalizedRequest = normalizeCartLines([
  { ...CAPPUCCINO_LINE, quantity: 5 },
  { ...WATER_LINE, quantity: 3 },
]);

/** The success-family response fixture — typed as the success branch so its fields are directly readable. */
const SUCCESS_RESPONSE: Extract<CreateOrderResponse, { kind: "success" }> = {
  kind: "success",
  order_id: "d0a1b2c3-4d5e-4f60-8a7b-8c9d0e1f2a3b",
  display_number: "KX7QR9",
  created_at: "2026-02-01T10:15:30+00:00",
};

const CONFLICTS: { variant_id: string; requested_quantity: number; available_quantity: number }[] =
  [{ variant_id: CAPPUCCINO_VARIANT_ID, requested_quantity: 2, available_quantity: 1 }];

const networkError = new AppError({
  kind: "network",
  userMessage: "We couldn't reach the network. Check the connection and try again.",
});

const serverError = new AppError({
  kind: "server",
  userMessage: "Something went wrong on our side. Please try again.",
});

const unknownKindError = new AppError({ kind: "unknown", userMessage: "Something went wrong." });

const CLEAR_OK: StorageWriteResult = { status: "persisted" };
const CLEAR_REJECTED: StorageWriteResult = {
  status: "rejected",
  error: new Error("cart storage remove failed"),
};

type RawStore = ReturnType<typeof createMemoryStore>;

/** One planned fake-submit outcome: a response OR a thrown error. */
type SubmitPlan = { response?: CreateOrderResponse; error?: unknown };

/**
 * Injectable deps with counters and result queues — the injectable-failure
 * pattern from the cart store's suite. `idFactory` mints deterministic
 * zero-padded uuids (the persisted record must satisfy the attempt schema's
 * postgres uuid text), `clearCart` replays queued results, `hydrateCart`
 * records every owner it was asked to hydrate (F-06-01's ordering evidence),
 * and `submit` replays queued outcomes, recording every input it was called
 * with.
 */
function createFakeDeps(options?: {
  clearResults?: StorageWriteResult[];
  submits?: SubmitPlan[];
  onClear?: () => void;
  onHydrate?: () => void;
}) {
  let counter = 0;
  let lockCount = 0;
  let unlockCount = 0;
  let clearCount = 0;
  let hydrateCount = 0;
  let clearResults = options?.clearResults ?? [CLEAR_OK];
  const submits = [...(options?.submits ?? [])];
  const submitCalls: SubmitOrderInput[] = [];
  const hydratedOwners: string[] = [];
  const deps: AttemptStoreDeps = {
    idFactory: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    lockCart: () => {
      lockCount += 1;
    },
    unlockCart: () => {
      unlockCount += 1;
    },
    hydrateCart: async (ownerId: string) => {
      hydrateCount += 1;
      hydratedOwners.push(ownerId);
      options?.onHydrate?.();
    },
    clearCart: async () => {
      const result = clearResults[Math.min(clearCount, clearResults.length - 1)];
      clearCount += 1;
      options?.onClear?.();
      if (result === undefined) throw new Error("fake clearCart ran out of queued results");
      return result;
    },
    submit: async (input: SubmitOrderInput): Promise<CreateOrderResponse> => {
      submitCalls.push(input);
      const plan = submits.shift();
      if (plan?.error !== undefined) throw plan.error;
      if (plan?.response) return plan.response;
      throw new Error("fake submit was called without a planned outcome");
    },
  };
  return {
    deps,
    counts: () => ({
      lock: lockCount,
      unlock: unlockCount,
      clear: clearCount,
      hydrate: hydrateCount,
    }),
    submitCalls: () => [...submitCalls],
    hydratedOwners: () => [...hydratedOwners],
  };
}

/** A fresh factory store over a fresh memory backend, with fake deps. */
function createStore(
  options?: { raw?: RawStore } & Parameters<typeof createFakeDeps>[0],
): ReturnType<typeof createFakeDeps> & {
  useStore: ReturnType<typeof createAttemptStore>;
  raw: RawStore;
} {
  const raw = options?.raw ?? createMemoryStore();
  const fake = createFakeDeps(options);
  const useStore = createAttemptStore(createJsonStorage(raw), fake.deps);
  return { useStore, raw, ...fake };
}

/** A store whose prepare already succeeded — the in-flight submission state. */
async function preparedStore(
  options?: { raw?: RawStore } & Parameters<typeof createFakeDeps>[0],
): Promise<ReturnType<typeof createStore>> {
  const store = createStore(options);
  // The recovery read completes FIRST (a miss on a fresh backend — the
  // RecoveryGate's own composition): prepare is gated on it (F-06-02).
  await store.useStore.getState().recover(OWNER_A);
  const result = await store.useStore
    .getState()
    .prepareAttempt({ ownerId: OWNER_A, lines: LINES, normalized: NORMALIZED });
  if (!result.ok) throw new Error(`fixture prepare failed: ${result.reason}`);
  return store;
}

/**
 * A store whose attempt is durably confirmed with cleanup done — the Order
 * Success state the defensive-guard tests resolve against. `prepareAttempt`
 * itself never submits, so no submit plan is needed.
 */
async function confirmedStore(
  options?: { raw?: RawStore } & Parameters<typeof createFakeDeps>[0],
): Promise<ReturnType<typeof createStore>> {
  const store = await preparedStore(options);
  await store.useStore.getState().resolveSuccess({
    orderId: SUCCESS_RESPONSE.order_id,
    displayNumber: SUCCESS_RESPONSE.display_number,
    createdAt: SUCCESS_RESPONSE.created_at,
  });
  return store;
}

/** Count the durable writes that actually reach the raw store. */
function countWrites(raw: RawStore) {
  const baseSetItem = raw.setItem;
  let writes = 0;
  raw.setItem = async (key: string, value: string) => {
    writes += 1;
    return baseSetItem(key, value);
  };
  return () => writes;
}

/** A backend whose writes start failing once `failWrites()` is called. */
function flakyWriteBackend() {
  const raw = createMemoryStore();
  const baseSetItem = raw.setItem;
  let failing = false;
  raw.setItem = async (key: string, value: string) => {
    if (failing) throw new Error("disk full");
    return baseSetItem(key, value);
  };
  return { raw, failWrites: () => (failing = true) };
}

/**
 * A backend whose FIRST write parks until `releaseWrite()` — the deterministic
 * mid-prepare window of R2-01(a): the serialized op has started, its durable
 * write is in flight, and the record is not yet in memory. `writeStarted`
 * settles the moment the write begins; `writes()` counts real setItem calls.
 */
function deferredWriteBackend() {
  const raw = createMemoryStore();
  const baseSetItem = raw.setItem;
  let writes = 0;
  let parked = false;
  let release: () => void = () => {};
  let signal: () => void = () => {};
  const writeStarted = new Promise<void>((resolve) => {
    signal = resolve;
  });
  raw.setItem = async (key: string, value: string) => {
    writes += 1;
    if (!parked) {
      parked = true;
      signal();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return baseSetItem(key, value);
  };
  return { raw, writeStarted, releaseWrite: () => release(), writes: () => writes };
}

/** Parse whatever is durably under KEY through the attempt schema, like a cold start would. */
function readPersistedRecord(raw: RawStore): CheckoutAttempt {
  const stored = raw.map.get(KEY);
  if (stored === undefined) throw new Error("expected a persisted attempt record under the key");
  return checkoutAttemptSchema.parse(JSON.parse(stored));
}

/**
 * Narrow the store's record to the CONFIRMED branch (the discriminated union
 * gives `.cleanup` only there). Fails the test loudly when the record is not
 * confirmed — TS will not narrow through `expect()` alone.
 */
function requireConfirmedRecord(
  useStore: ReturnType<typeof createAttemptStore>,
): Extract<CheckoutAttempt, { status: "confirmed" }> {
  const record = useStore.getState().record;
  if (record?.status !== "confirmed") {
    throw new Error(`expected a confirmed attempt record, got ${record?.status ?? "none"}`);
  }
  return record;
}

/**
 * Seed the durable key directly. The record argument is `unknown` on
 * purpose: valid seeds are built by the fixture builders below (schema-valid
 * by construction), while the corrupt-recovery case deliberately seeds a
 * payload the attempt schema must reject.
 */
function seedRecord(raw: RawStore, record: unknown) {
  raw.map.set(KEY, JSON.stringify(record));
}

function unresolvedRecord(overrides?: Partial<Extract<CheckoutAttempt, { status: "unresolved" }>>) {
  return {
    version: 1,
    ownerId: OWNER_A,
    clientRequestId: "00000000-0000-4000-8000-000000000001",
    items: NORMALIZED.items,
    fingerprint: NORMALIZED.fingerprint,
    lineSnapshots: LINES,
    status: "unresolved",
    ...overrides,
  } satisfies Extract<CheckoutAttempt, { status: "unresolved" }>;
}

function confirmedRecord(
  cleanup: "pending" | "done" | "failed",
  ownerId: string = OWNER_A,
): CheckoutAttempt {
  return {
    ...unresolvedRecord({ ownerId }),
    status: "confirmed",
    success: {
      orderId: "d0a1b2c3-4d5e-4f60-8a7b-8c9d0e1f2a3b",
      displayNumber: "KX7QR9",
      createdAt: "2026-02-01T10:15:30+00:00",
    },
    cleanup: { cartClear: cleanup },
  };
}

// The failure paths below log by design (honest storage and guard reports);
// keep the suite silent so an expected failure does not look like a broken run.
beforeEach(() => setLogSink(() => {}));
afterEach(resetLogging);

describe("prepareAttempt — persist before submit (AC-06)", () => {
  it("refuses to prepare when the durable write fails: no record, no lock, no submit", async () => {
    // The AC-06 RED case: a persistence failure BEFORE the first submit must
    // prevent the network call — the store must not hand back a request it
    // cannot prove is durable, and must not lock the cart for a submission
    // that will never happen.
    const store = createStore({ raw: createMemoryStore({ failOn: "setItem" }) });
    // The recovery read completes first (a miss — reads are unaffected by
    // failOn: "setItem"); prepare is gated on it (F-06-02).
    await store.useStore.getState().recover(OWNER_A);

    const result = await store.useStore
      .getState()
      .prepareAttempt({ ownerId: OWNER_A, lines: LINES, normalized: NORMALIZED });

    expect(result).toMatchObject({ ok: false, reason: "persist-failed" });
    expect(store.useStore.getState().record).toBeNull();
    expect(store.useStore.getState().phase).toBe("idle");
    expect(store.counts().lock).toBe(0);
    expect(store.submitCalls()).toEqual([]);
    // Even the safe-retry entry point must not fire without a record.
    await store.useStore.getState().replayAttempt();
    expect(store.submitCalls()).toEqual([]);
  });

  it("persists the unresolved record BEFORE returning ok, then locks the cart", async () => {
    const store = createStore();
    const writes = countWrites(store.raw);
    await store.useStore.getState().recover(OWNER_A);

    const result = await store.useStore
      .getState()
      .prepareAttempt({ ownerId: OWNER_A, lines: LINES, normalized: NORMALIZED });

    expect(result).toEqual({
      ok: true,
      request: { clientRequestId: "00000000-0000-4000-8000-000000000001", items: NORMALIZED.items },
    });
    // The durable write happened — and it is a schema-valid unresolved record.
    expect(writes()).toBe(1);
    expect(readPersistedRecord(store.raw)).toEqual(unresolvedRecord());
    expect(store.useStore.getState().phase).toBe("submitting");
    expect(store.useStore.getState().persistence).toBe("persisted");
    expect(store.counts().lock).toBe(1);
  });

  it("refuses to mint a new identity before the first durable read has completed (F-06-02, recovery-pending)", async () => {
    // Cold start with an unresolved record on disk, and a caller reaches
    // prepareAttempt BEFORE the recovery gate's recover() has run: the
    // in-memory guards see no record, so a fresh id would be minted and the
    // stale identity OVERWRITTEN — and if the original ambiguous submission
    // actually landed server-side, the new submission creates a SECOND
    // order. "No new submission while an unresolved record exists" must hold
    // against DISK, not just memory — never resting on caller ordering.
    const SEEDED_ID = "99999999-9999-4999-8999-999999999999";
    const store = createStore();
    seedRecord(store.raw, unresolvedRecord({ clientRequestId: SEEDED_ID }));
    const before = store.raw.map.get(KEY);

    const result = await store.useStore
      .getState()
      .prepareAttempt({ ownerId: OWNER_A, lines: LINES, normalized: NORMALIZED });

    expect(result).toMatchObject({ ok: false, reason: "recovery-pending" });
    // The stale identity is untouched — byte-identical key, no lock, no submit.
    expect(store.raw.map.get(KEY)).toBe(before);
    expect(store.useStore.getState().record).toBeNull();
    expect(store.counts().lock).toBe(0);
    expect(store.submitCalls()).toEqual([]);

    // After the recovery read: the durable identity is restored and REUSED,
    // never re-minted — a same-fingerprint prepare hands back the SEEDED id.
    const outcome = await store.useStore.getState().recover(OWNER_A);
    expect(outcome).toBe("unresolved");

    const retry = await store.useStore
      .getState()
      .prepareAttempt({ ownerId: OWNER_A, lines: LINES, normalized: NORMALIZED });

    expect(retry).toMatchObject({ ok: true, request: { clientRequestId: SEEDED_ID } });
    expect(store.raw.map.get(KEY)).toBe(before);
  });

  it("reuses the same clientRequestId for the same fingerprint without a new durable write", async () => {
    const store = await preparedStore();
    const writes = countWrites(store.raw);
    const before = store.raw.map.get(KEY);

    const again = await store.useStore
      .getState()
      .prepareAttempt({ ownerId: OWNER_A, lines: LINES, normalized: NORMALIZED });

    // The retry-safety: the record was already persisted — that IS the proof.
    expect(again).toEqual({
      ok: true,
      request: { clientRequestId: "00000000-0000-4000-8000-000000000001", items: NORMALIZED.items },
    });
    expect(writes()).toBe(0);
    expect(store.raw.map.get(KEY)).toBe(before);
    expect(store.useStore.getState().phase).toBe("submitting");
    // The reuse path re-locks: the same request is going back in flight
    // (one lock from the first prepare, one from the reuse — F-06-05).
    expect(store.counts().lock).toBe(2);
  });

  it("refuses to rebind an identity when the fingerprint changed (AC-06)", async () => {
    const store = await preparedStore();
    const before = store.raw.map.get(KEY);

    const result = await store.useStore
      .getState()
      .prepareAttempt({ ownerId: OWNER_A, lines: LINES, normalized: CHANGED_NORMALIZED });

    expect(result).toMatchObject({ ok: false, reason: "unresolved-attempt-exists" });
    // The existing record is untouched: no re-mint, no rewrite.
    expect(store.raw.map.get(KEY)).toBe(before);
    expect(store.useStore.getState().record?.clientRequestId).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
  });

  it("refuses to prepare while a confirmed attempt owns the session", async () => {
    const store = await preparedStore({ submits: [{ response: SUCCESS_RESPONSE }] });
    await store.useStore.getState().resolveSuccess({
      orderId: SUCCESS_RESPONSE.order_id,
      displayNumber: SUCCESS_RESPONSE.display_number,
      createdAt: SUCCESS_RESPONSE.created_at,
    });

    const result = await store.useStore
      .getState()
      .prepareAttempt({ ownerId: OWNER_A, lines: LINES, normalized: NORMALIZED });

    expect(result).toMatchObject({ ok: false, reason: "confirmed-attempt-present" });
  });

  it("flips phase to submitting SYNCHRONOUSLY, before the durable write (R2-01a)", async () => {
    // The prepare-mint window, made deterministic: the write parks, so the
    // snapshot lands exactly between the op's start and the record landing
    // in memory — where a sign-out guard must still see the live submission.
    // The old code set phase only AFTER the write resolved, so mid-write the
    // guard read record: null + phase "idle" and approved a sign-out that
    // then wiped the freshly persisted unresolved identity (R2-01(a), the
    // duplicate-order seam).
    const deferred = deferredWriteBackend();
    const store = createStore({ raw: deferred.raw });
    await store.useStore.getState().recover(OWNER_A);

    const prepared = store.useStore.getState().prepareAttempt({
      ownerId: OWNER_A,
      lines: LINES,
      normalized: NORMALIZED,
    });
    await deferred.writeStarted; // mid-write

    const midWrite = store.useStore.getState();
    expect(midWrite.phase).toBe("submitting");
    expect(midWrite.record).toBeNull();

    deferred.releaseWrite();
    const result = await prepared;

    expect(result).toMatchObject({
      ok: true,
      request: { clientRequestId: "00000000-0000-4000-8000-000000000001" },
    });
    expect(store.useStore.getState().phase).toBe("submitting");
    expect(store.useStore.getState().record?.status).toBe("unresolved");
    expect(store.counts().lock).toBe(1);
  });

  it("reverts the phase to its previous value when the durable write fails (R2-01a)", async () => {
    // After a definite conflict the machine sits in "stock-conflict" with no
    // record. A retried prepare whose write fails must return the machine to
    // EXACTLY that phase — not strand it in "submitting" (the sync set above
    // is a loan against the write, and a failed loan is repaid).
    const flaky = flakyWriteBackend();
    const store = createStore({ raw: flaky.raw });
    await store.useStore.getState().recover(OWNER_A);
    await store.useStore
      .getState()
      .prepareAttempt({ ownerId: OWNER_A, lines: LINES, normalized: NORMALIZED });
    await store.useStore.getState().resolveStockConflict(CONFLICTS);
    flaky.failWrites();

    const result = await store.useStore
      .getState()
      .prepareAttempt({ ownerId: OWNER_A, lines: LINES, normalized: NORMALIZED });

    expect(result).toMatchObject({ ok: false, reason: "persist-failed" });
    expect(store.useStore.getState().phase).toBe("stock-conflict");
    expect(store.useStore.getState().record).toBeNull();
    // No new lock for a submission that will never happen; the conflict's
    // unlock still stands.
    expect(store.counts().lock).toBe(1);
    expect(store.counts().unlock).toBe(1);
  });

  it("refuses to hand another owner the live identity even for the same fingerprint (R2-04)", async () => {
    // Defensive (unreachable in the delivered composition — the flow never
    // lets a second profile reach prepare while an unresolved record
    // exists), but exactly the guard class this round is about: the
    // clientRequestId belongs to whoever minted it, and handing it to a
    // different owner would submit THEIR cart under the first owner's
    // idempotency identity.
    const store = await preparedStore();
    const before = store.raw.map.get(KEY);

    const result = await store.useStore
      .getState()
      .prepareAttempt({ ownerId: OWNER_B, lines: LINES, normalized: NORMALIZED });

    expect(result).toMatchObject({ ok: false, reason: "unresolved-attempt-exists" });
    // The existing identity is untouched: no re-mint, no rewrite, no lock.
    expect(store.raw.map.get(KEY)).toBe(before);
    expect(store.useStore.getState().record?.clientRequestId).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(store.useStore.getState().record?.ownerId).toBe(OWNER_A);
    expect(store.counts().lock).toBe(1);
  });

  it("serializes overlapping prepares: exactly ONE durable write, both resolve ok with the IDENTICAL id (R2-05)", async () => {
    // The serialized durable-op chain claim, now with teeth: a second
    // prepare overlapping a deferred write must WAIT for the first op to
    // settle and then REUSE its record — idempotent retry, no second id, no
    // second write. Without serialization the second op would read
    // record: null while the first write was in flight, mint a SECOND
    // client_request_id, and race a SECOND durable write onto the key.
    const deferred = deferredWriteBackend();
    const store = createStore({ raw: deferred.raw });
    await store.useStore.getState().recover(OWNER_A);

    const first = store.useStore.getState().prepareAttempt({
      ownerId: OWNER_A,
      lines: LINES,
      normalized: NORMALIZED,
    });
    await deferred.writeStarted; // the first write is in flight
    const second = store.useStore.getState().prepareAttempt({
      ownerId: OWNER_A,
      lines: LINES,
      normalized: NORMALIZED,
    });
    deferred.releaseWrite();

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual({
      ok: true,
      request: { clientRequestId: "00000000-0000-4000-8000-000000000001", items: NORMALIZED.items },
    });
    expect(secondResult).toEqual(firstResult);
    expect(deferred.writes()).toBe(1);
  });
});

describe("resolveSuccess — capture, durably confirm, THEN clear (D4, AC-07/AC-11)", () => {
  it("writes the confirmed record durably BEFORE attempting the cart clear", async () => {
    const events: string[] = [];
    const raw = createMemoryStore();
    const baseSetItem = raw.setItem;
    raw.setItem = async (key, value) => {
      events.push("write");
      return baseSetItem(key, value);
    };
    const store = createStore({
      raw,
      onHydrate: () => events.push("hydrate"),
      onClear: () => events.push("clear"),
    });
    await store.useStore.getState().recover(OWNER_A);
    await store.useStore
      .getState()
      .prepareAttempt({ ownerId: OWNER_A, lines: LINES, normalized: NORMALIZED });
    events.length = 0;

    await store.useStore.getState().resolveSuccess({
      orderId: SUCCESS_RESPONSE.order_id,
      displayNumber: SUCCESS_RESPONSE.display_number,
      createdAt: SUCCESS_RESPONSE.created_at,
    });

    // D4's exact ordering, WITH F-06-01's hydration: confirm-write → hydrate
    // → clear → cleanup-write. A clear that ran before the confirmation was
    // durable would destroy the recovery evidence while the attempt was
    // still ambiguous; a clear that ran before the cart's hydration settled
    // could be resurrected by the cart's own in-flight restore apply.
    expect(events).toEqual(["write", "hydrate", "clear", "write"]);
    expect(store.hydratedOwners()).toEqual([OWNER_A]);
    expect(store.useStore.getState().phase).toBe("confirmed");
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("done");
    expect(readPersistedRecord(store.raw)).toEqual(confirmedRecord("done"));
    expect(store.counts().unlock).toBe(1);
    expect(store.useStore.getState().persistence).toBe("persisted");
  });

  it("keeps the order CONFIRMED with a failed cleanup tracker when the cart clear fails (AC-11)", async () => {
    const store = await preparedStore({ clearResults: [CLEAR_REJECTED] });

    await store.useStore.getState().resolveSuccess({
      orderId: SUCCESS_RESPONSE.order_id,
      displayNumber: SUCCESS_RESPONSE.display_number,
      createdAt: SUCCESS_RESPONSE.created_at,
    });

    // The order IS confirmed — the phase never returns to submitting — and the
    // failed cleanup is tracked in the record, durably, for the recovery flow.
    expect(store.useStore.getState().phase).toBe("confirmed");
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("failed");
    expect(readPersistedRecord(store.raw)).toEqual(confirmedRecord("failed"));
    // The reset gate must refuse until cleanup is proven safe.
    const reset = await store.useStore.getState().resetForNextCustomer();
    expect(reset.status).toBe("rejected");
  });

  it("resolveSuccess with NO record is a no-op: nothing written, no clear, no phase change (R2-05)", async () => {
    // The defensive branch R2-01(a) makes reachable in the wild (a wipe raced
    // a live submission and the identity was destroyed before the server
    // answered): the store must do NOTHING — fabricating a confirmed record
    // would pin a success payload to a dead identity, and a cart clear would
    // fire for an attempt that does not exist.
    const store = createStore();
    await store.useStore.getState().recover(OWNER_A);
    const writes = countWrites(store.raw);

    await store.useStore.getState().resolveSuccess({
      orderId: SUCCESS_RESPONSE.order_id,
      displayNumber: SUCCESS_RESPONSE.display_number,
      createdAt: SUCCESS_RESPONSE.created_at,
    });

    expect(writes()).toBe(0);
    expect(store.raw.map.has(KEY)).toBe(false);
    expect(store.counts().hydrate).toBe(0);
    expect(store.counts().clear).toBe(0);
    expect(store.counts().unlock).toBe(0);
    const state = store.useStore.getState();
    expect(state.record).toBeNull();
    expect(state.phase).toBe("idle");
    expect(state.persistence).toBe("unknown");
  });

  it("keeps the DURABLE record unresolved when the confirmed write fails, but still clears", async () => {
    // D4's design: a restart replays the same id → idempotent re-confirmation,
    // so no duplicate order is possible even though this write failed.
    const flaky = flakyWriteBackend();
    const store = createStore({ raw: flaky.raw });
    await store.useStore.getState().recover(OWNER_A);

    await store.useStore
      .getState()
      .prepareAttempt({ ownerId: OWNER_A, lines: LINES, normalized: NORMALIZED });
    flaky.failWrites();

    await store.useStore.getState().resolveSuccess({
      orderId: SUCCESS_RESPONSE.order_id,
      displayNumber: SUCCESS_RESPONSE.display_number,
      createdAt: SUCCESS_RESPONSE.created_at,
    });

    // Disk still holds the UNRESOLVED record — the restart recovery spine.
    expect(readPersistedRecord(store.raw).status).toBe("unresolved");
    // In memory the attempt is confirmed, the clear still ran, honesty held.
    expect(store.useStore.getState().phase).toBe("confirmed");
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("done");
    expect(store.counts().clear).toBe(1);
    expect(store.useStore.getState().persistence).toBe("memoryOnly");
    expect(store.counts().unlock).toBe(1);
  });
});

describe("resolveStockConflict — a definite no-order outcome (AC-08)", () => {
  it("discards the record, preserves the cart, and unlocks for editing", async () => {
    const store = await preparedStore();

    await store.useStore.getState().resolveStockConflict(CONFLICTS);

    // The cart is NEVER cleared on a conflict — no order exists.
    expect(store.counts().clear).toBe(0);
    expect(store.raw.map.has(KEY)).toBe(false);
    expect(store.useStore.getState().record).toBeNull();
    expect(store.useStore.getState().phase).toBe("stock-conflict");
    expect(store.useStore.getState().conflict).toEqual(CONFLICTS);
    expect(store.counts().unlock).toBe(1);
  });

  it("reports clearFailed — never memoryOnly — when the discard cannot remove the key (F-06-05)", async () => {
    // removeItem fails: there is no way left to prove the attempt left the
    // disk. The OUTCOME is still definite (the server answered: no order),
    // so the machine resolves to stock-conflict with the conflict payload —
    // but the honesty is clearFailed, and the stale unresolved record stays
    // on disk (safe: a later replay re-sends the same id, which the server
    // deduplicates).
    const store = await preparedStore({ raw: createMemoryStore({ failOn: "removeItem" }) });

    await store.useStore.getState().resolveStockConflict(CONFLICTS);

    expect(store.useStore.getState().phase).toBe("stock-conflict");
    expect(store.useStore.getState().conflict).toEqual(CONFLICTS);
    expect(store.useStore.getState().persistence).toBe("clearFailed");
    // The in-memory machine state is the definite outcome; the durable key
    // could not be removed and is honestly reported as still there.
    expect(store.useStore.getState().record).toBeNull();
    expect(readPersistedRecord(store.raw).status).toBe("unresolved");
    expect(store.counts().unlock).toBe(1);
  });
});

describe("resolveDefiniteFailure — a definite server-answered failure (AC-10)", () => {
  it("discards the record and stores a plain failure payload, never an Error instance", async () => {
    const store = await preparedStore();

    await store.useStore.getState().resolveDefiniteFailure(serverError);

    expect(store.raw.map.has(KEY)).toBe(false);
    expect(store.useStore.getState().record).toBeNull();
    expect(store.useStore.getState().phase).toBe("failed");
    expect(store.useStore.getState().failure).toEqual({
      kind: "server",
      userMessage: "Something went wrong on our side. Please try again.",
      retryable: true,
    });
    expect(store.counts().clear).toBe(0);
    expect(store.counts().unlock).toBe(1);
  });
});

describe("resolveUnknown — the ambiguous outcome (AC-09)", () => {
  it("keeps the record durable and the cart locked", async () => {
    const store = await preparedStore();

    store.useStore.getState().resolveUnknown();

    expect(store.useStore.getState().phase).toBe("unknown");
    // The idempotency identity survives: unresolved on disk, in memory.
    expect(readPersistedRecord(store.raw).status).toBe("unresolved");
    expect(store.useStore.getState().record?.status).toBe("unresolved");
    // Editing is unsafe while the outcome is unknown.
    expect(store.counts().unlock).toBe(0);
    expect(store.useStore.getState().conflict).toBeNull();
    expect(store.useStore.getState().failure).toBeNull();
  });
});

describe("classifySubmitOutcome — the D3 ambiguity boundary", () => {
  it("classifies a success response as success", () => {
    expect(classifySubmitOutcome({ response: SUCCESS_RESPONSE })).toEqual({
      kind: "success",
      response: SUCCESS_RESPONSE,
    });
  });

  it("classifies a stock_conflict response as a conflict", () => {
    const response: CreateOrderResponse = { kind: "stock_conflict", conflicts: CONFLICTS };
    expect(classifySubmitOutcome({ response })).toEqual({
      kind: "stock-conflict",
      conflicts: CONFLICTS,
    });
  });

  it("classifies a definite AppError kind as definite-failure", () => {
    expect(classifySubmitOutcome({ error: serverError })).toEqual({
      kind: "definite-failure",
      error: serverError,
    });
  });

  it("classifies a network AppError as unknown (ambiguous)", () => {
    expect(classifySubmitOutcome({ error: networkError })).toEqual({ kind: "unknown" });
  });

  it("classifies an unknown-kind AppError as unknown (ambiguous)", () => {
    expect(classifySubmitOutcome({ error: unknownKindError })).toEqual({ kind: "unknown" });
  });

  it("classifies a non-AppError error as unknown (fail-safe)", () => {
    // The api contract says this cannot happen — the classifier must not
    // trust it: anything unclassifiable stays ambiguous.
    expect(classifySubmitOutcome({ error: new TypeError("raw transport error") })).toEqual({
      kind: "unknown",
    });
  });
});

describe("replayAttempt — the safe retry (AC-09/AC-13)", () => {
  it("replays the SAME identity and resolves a success to confirmed", async () => {
    const store = await preparedStore({ submits: [{ response: SUCCESS_RESPONSE }] });
    store.useStore.getState().resolveUnknown();

    await store.useStore.getState().replayAttempt();

    // The exact stored identity was submitted — never a re-minted id.
    expect(store.submitCalls()).toEqual([
      { clientRequestId: "00000000-0000-4000-8000-000000000001", items: NORMALIZED.items },
    ]);
    expect(store.useStore.getState().phase).toBe("confirmed");
    expect(readPersistedRecord(store.raw)).toEqual(confirmedRecord("done"));
    expect(store.counts().clear).toBe(1);
    expect(store.counts().unlock).toBe(1);
  });

  it("returns to unknown, record still durable-unresolved, cart still locked, on a network error", async () => {
    const store = await preparedStore({ submits: [{ error: networkError }] });
    store.useStore.getState().resolveUnknown();

    await store.useStore.getState().replayAttempt();

    expect(store.submitCalls()).toHaveLength(1);
    expect(store.useStore.getState().phase).toBe("unknown");
    expect(readPersistedRecord(store.raw).status).toBe("unresolved");
    expect(store.counts().unlock).toBe(0);
  });

  it("routes a stock_conflict replay through the conflict path", async () => {
    const store = await preparedStore({
      submits: [{ response: { kind: "stock_conflict", conflicts: CONFLICTS } }],
    });
    store.useStore.getState().resolveUnknown();

    await store.useStore.getState().replayAttempt();

    expect(store.useStore.getState().phase).toBe("stock-conflict");
    expect(store.useStore.getState().conflict).toEqual(CONFLICTS);
    expect(store.raw.map.has(KEY)).toBe(false);
    expect(store.counts().unlock).toBe(1);
  });

  it("hydrates the cart for the record's owner BEFORE clearing it (F-06-01)", async () => {
    // The recovery path: recover → replay → resolveSuccess → clear. The
    // cart's own restore may still be in flight here — a clear awaited
    // mid-restore resolves honest-on-disk but the restore's apply can
    // resurrect the confirmed order's lines in memory. The STORE must
    // sequence hydrate-before-clear; no caller can gate this ordering.
    const events: string[] = [];
    const raw = createMemoryStore();
    const baseSetItem = raw.setItem;
    raw.setItem = async (key, value) => {
      events.push("write");
      return baseSetItem(key, value);
    };
    seedRecord(raw, unresolvedRecord());
    const store = createStore({
      raw,
      submits: [{ response: SUCCESS_RESPONSE }],
      onHydrate: () => events.push("hydrate"),
      onClear: () => events.push("clear"),
    });
    await store.useStore.getState().recover(OWNER_A);
    events.length = 0;

    await store.useStore.getState().replayAttempt();

    // D4's ordering WITH F-06-01's hydration: confirm-write → hydrate →
    // clear → cleanup-write — for the record's owner, exactly once.
    expect(events).toEqual(["write", "hydrate", "clear", "write"]);
    expect(store.hydratedOwners()).toEqual([OWNER_A]);
    expect(store.useStore.getState().phase).toBe("confirmed");
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("done");
  });
});

describe("recover — restart recovery (AC-13, D7)", () => {
  it("reports none on a miss and leaves the machine idle", async () => {
    const store = createStore();

    const outcome = await store.useStore.getState().recover(OWNER_A);

    expect(outcome).toBe("none");
    expect(store.useStore.getState().record).toBeNull();
    expect(store.useStore.getState().phase).toBe("idle");
    expect(store.counts().lock).toBe(0);
  });

  it("restores a same-owner unresolved record to phase unknown and locks the cart", async () => {
    const store = createStore();
    seedRecord(store.raw, unresolvedRecord());

    const outcome = await store.useStore.getState().recover(OWNER_A);

    expect(outcome).toBe("unresolved");
    expect(store.useStore.getState().phase).toBe("unknown");
    expect(store.useStore.getState().record).toEqual(unresolvedRecord());
    expect(store.counts().lock).toBe(1);
  });

  it("durably discards a foreign-owner record WITHOUT replaying it (D7)", async () => {
    const store = createStore();
    seedRecord(store.raw, unresolvedRecord({ ownerId: OWNER_B }));

    const outcome = await store.useStore.getState().recover(OWNER_A);

    expect(outcome).toBe("discarded-foreign");
    expect(store.raw.map.has(KEY)).toBe(false);
    expect(store.useStore.getState().record).toBeNull();
    // No path from a foreign-owner replay can be safe — submit never fired.
    expect(store.submitCalls()).toEqual([]);
    expect(store.counts().lock).toBe(0);
  });

  it("durably discards a corrupt payload and reports discarded-corrupt", async () => {
    const store = createStore();
    seedRecord(store.raw, { version: 1, status: "unresolved" });

    const outcome = await store.useStore.getState().recover(OWNER_A);

    expect(outcome).toBe("discarded-corrupt");
    // A corrupt record cannot be replayed and must not trip the next restore.
    expect(store.raw.map.has(KEY)).toBe(false);
    expect(store.useStore.getState().record).toBeNull();
    expect(store.useStore.getState().phase).toBe("idle");
  });

  it("restores a confirmed record with unsafe cleanup locked, pending its outcome", async () => {
    const store = createStore();
    seedRecord(store.raw, confirmedRecord("pending"));

    const outcome = await store.useStore.getState().recover(OWNER_A);

    expect(outcome).toBe("confirmed-cleanup-pending");
    expect(store.useStore.getState().phase).toBe("confirmed");
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("pending");
    // The success flow must finish cleanup before the kiosk resets.
    expect(store.counts().lock).toBe(1);
  });

  it("restores a confirmed, safely-cleaned record to phase confirmed, unlocked", async () => {
    const store = createStore();
    seedRecord(store.raw, confirmedRecord("done"));

    const outcome = await store.useStore.getState().recover(OWNER_A);

    expect(outcome).toBe("confirmed-cleanup-done");
    expect(store.useStore.getState().phase).toBe("confirmed");
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("done");
    expect(store.counts().lock).toBe(0);
  });

  it("is idempotent: a second call re-classifies without re-locking or re-reading", async () => {
    const store = createStore();
    seedRecord(store.raw, unresolvedRecord());
    await store.useStore.getState().recover(OWNER_A);
    const readsBefore = store.raw.map.get(KEY);

    const again = await store.useStore.getState().recover(OWNER_A);

    expect(again).toBe("unresolved");
    expect(store.counts().lock).toBe(1);
    expect(store.raw.map.get(KEY)).toBe(readsBefore);
  });

  it("survives a restart: a second store over the same backend restores the record (AC-13)", async () => {
    const first = await preparedStore();

    // A COLD START: a fresh store instance over the SAME durable backend.
    const second = createStore({ raw: first.raw });
    const outcome = await second.useStore.getState().recover(OWNER_A);

    expect(outcome).toBe("unresolved");
    expect(second.useStore.getState().record).toEqual(first.useStore.getState().record);
    expect(second.useStore.getState().phase).toBe("unknown");
  });

  it("does not clobber a live submitting phase or double-lock when the read lands mid-submission (F-06-03)", async () => {
    // Defense-in-depth: a submission in flight while the recovery read
    // completes. recover() classifies and loads the record, but must NOT
    // mutate phase (submitting → unknown would strand the live flow) and
    // must NOT lock again (the submission already holds the lock). Forced
    // directly through setState to pin the defensive branch.
    const store = createStore();
    seedRecord(store.raw, unresolvedRecord());
    store.useStore.setState({ phase: "submitting" });

    const outcome = await store.useStore.getState().recover(OWNER_A);

    expect(outcome).toBe("unresolved");
    expect(store.useStore.getState().phase).toBe("submitting");
    expect(store.counts().lock).toBe(0);
    expect(store.useStore.getState().record).toEqual(unresolvedRecord());
    expect(store.useStore.getState().recordLoaded).toBe(true);
  });
});

describe("retryCleanup — the AC-11 recovery action", () => {
  it("retries the clear, tracks done durably, and unlocks", async () => {
    // The crash window: durably confirmed, then the app died before the clear.
    const store = createStore();
    seedRecord(store.raw, confirmedRecord("pending"));
    await store.useStore.getState().recover(OWNER_A);

    await store.useStore.getState().retryCleanup();

    expect(store.counts().clear).toBe(1);
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("done");
    expect(readPersistedRecord(store.raw)).toEqual(confirmedRecord("done"));
    expect(store.counts().unlock).toBe(1);
  });

  it("hydrates the cart BEFORE retrying the clear (F-06-01)", async () => {
    // retryCleanup is BY CONSTRUCTION a recovery-path clear: the app crashed
    // between confirmation and cleanup, so the cart's restore may still be
    // in flight when it runs. The store sequences hydrate-before-clear
    // itself — no caller can gate it.
    const events: string[] = [];
    const raw = createMemoryStore();
    const baseSetItem = raw.setItem;
    raw.setItem = async (key, value) => {
      events.push("write");
      return baseSetItem(key, value);
    };
    seedRecord(raw, confirmedRecord("pending"));
    const store = createStore({
      raw,
      onHydrate: () => events.push("hydrate"),
      onClear: () => events.push("clear"),
    });
    await store.useStore.getState().recover(OWNER_A);
    events.length = 0;

    await store.useStore.getState().retryCleanup();

    expect(events).toEqual(["hydrate", "clear", "write"]);
    expect(store.hydratedOwners()).toEqual([OWNER_A]);
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("done");
    expect(store.counts().unlock).toBe(1);
  });

  it("is a no-op once cleanup is already done", async () => {
    const store = await preparedStore({ submits: [{ response: SUCCESS_RESPONSE }] });
    await store.useStore.getState().resolveSuccess({
      orderId: SUCCESS_RESPONSE.order_id,
      displayNumber: SUCCESS_RESPONSE.display_number,
      createdAt: SUCCESS_RESPONSE.created_at,
    });

    await store.useStore.getState().retryCleanup();

    expect(store.counts().clear).toBe(1);
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("done");
  });
});

describe("resetForNextCustomer — the AC-14 gate", () => {
  it("removes the durable record and returns to idle after confirmed + safe cleanup", async () => {
    const store = await preparedStore({ submits: [{ response: SUCCESS_RESPONSE }] });
    await store.useStore.getState().resolveSuccess({
      orderId: SUCCESS_RESPONSE.order_id,
      displayNumber: SUCCESS_RESPONSE.display_number,
      createdAt: SUCCESS_RESPONSE.created_at,
    });

    const result = await store.useStore.getState().resetForNextCustomer();

    expect(result.status).toBe("persisted");
    expect(store.raw.map.has(KEY)).toBe(false);
    expect(store.useStore.getState().record).toBeNull();
    expect(store.useStore.getState().phase).toBe("idle");
    expect(store.useStore.getState().conflict).toBeNull();
    expect(store.useStore.getState().failure).toBeNull();
  });

  it("refuses, touching nothing, while cleanup failed", async () => {
    const store = await preparedStore({ clearResults: [CLEAR_REJECTED] });
    await store.useStore.getState().resolveSuccess({
      orderId: SUCCESS_RESPONSE.order_id,
      displayNumber: SUCCESS_RESPONSE.display_number,
      createdAt: SUCCESS_RESPONSE.created_at,
    });
    const durableBefore = store.raw.map.get(KEY);

    const result = await store.useStore.getState().resetForNextCustomer();

    expect(result.status).toBe("rejected");
    expect(store.raw.map.get(KEY)).toBe(durableBefore);
    expect(store.useStore.getState().phase).toBe("confirmed");
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("failed");
  });

  it("refuses, touching nothing, while the attempt is unresolved (phase unknown)", async () => {
    const store = await preparedStore();
    store.useStore.getState().resolveUnknown();

    const result = await store.useStore.getState().resetForNextCustomer();

    expect(result.status).toBe("rejected");
    expect(readPersistedRecord(store.raw).status).toBe("unresolved");
    expect(store.useStore.getState().phase).toBe("unknown");
  });
});

describe("enterReview — returning to a clean review state", () => {
  it("resets from stock-conflict, clearing the conflict payload", async () => {
    const store = await preparedStore();
    await store.useStore.getState().resolveStockConflict(CONFLICTS);

    store.useStore.getState().enterReview();

    expect(store.useStore.getState().phase).toBe("idle");
    expect(store.useStore.getState().conflict).toBeNull();
  });

  it("resets from failed, clearing the failure payload", async () => {
    const store = await preparedStore();
    await store.useStore.getState().resolveDefiniteFailure(serverError);

    store.useStore.getState().enterReview();

    expect(store.useStore.getState().phase).toBe("idle");
    expect(store.useStore.getState().failure).toBeNull();
  });

  it("refuses from unknown — the attempt is unresolved and must stay so", async () => {
    const store = await preparedStore();
    store.useStore.getState().resolveUnknown();

    store.useStore.getState().enterReview();

    expect(store.useStore.getState().phase).toBe("unknown");
    expect(store.useStore.getState().record?.status).toBe("unresolved");
  });

  it("refuses from submitting and from confirmed", async () => {
    const submitting = await preparedStore();
    submitting.useStore.getState().enterReview();
    expect(submitting.useStore.getState().phase).toBe("submitting");

    const confirmed = await confirmedStore();
    confirmed.useStore.getState().enterReview();
    expect(confirmed.useStore.getState().phase).toBe("confirmed");
  });
});

describe("defensive guards — duplicate and late resolves (F-06-05)", () => {
  it("ignores a duplicate resolveSuccess: one hydrate, one clear, one unlock, record intact", async () => {
    const store = await confirmedStore();

    await store.useStore.getState().resolveSuccess({
      orderId: SUCCESS_RESPONSE.order_id,
      displayNumber: SUCCESS_RESPONSE.display_number,
      createdAt: SUCCESS_RESPONSE.created_at,
    });

    // The second resolve is a logged no-op: no second hydrate, clear, or
    // unlock, and no rewrite of the confirmed record.
    expect(store.counts().hydrate).toBe(1);
    expect(store.counts().clear).toBe(1);
    expect(store.counts().unlock).toBe(1);
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("done");
    expect(readPersistedRecord(store.raw)).toEqual(confirmedRecord("done"));
  });

  it("refuses a late stock conflict against a confirmed record: the success payload is kept", async () => {
    const store = await confirmedStore();
    const durableBefore = store.raw.map.get(KEY);

    await store.useStore.getState().resolveStockConflict(CONFLICTS);

    expect(store.raw.map.get(KEY)).toBe(durableBefore);
    expect(store.useStore.getState().phase).toBe("confirmed");
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("done");
    expect(store.useStore.getState().conflict).toBeNull();
    expect(store.counts().clear).toBe(1);
    expect(store.counts().unlock).toBe(1);
  });

  it("refuses a late definite failure against a confirmed record: the success payload is kept", async () => {
    const store = await confirmedStore();
    const durableBefore = store.raw.map.get(KEY);

    await store.useStore.getState().resolveDefiniteFailure(serverError);

    expect(store.raw.map.get(KEY)).toBe(durableBefore);
    expect(store.useStore.getState().phase).toBe("confirmed");
    expect(store.useStore.getState().failure).toBeNull();
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("done");
  });

  it("replayAttempt is a no-op with a confirmed record: no second submission", async () => {
    const store = await confirmedStore();

    await store.useStore.getState().replayAttempt();

    expect(store.submitCalls()).toEqual([]);
    expect(store.useStore.getState().phase).toBe("confirmed");
    expect(requireConfirmedRecord(store.useStore).cleanup.cartClear).toBe("done");
  });

  it("replayAttempt is a no-op with no record at all", async () => {
    const store = createStore();
    await store.useStore.getState().recover(OWNER_A);

    await store.useStore.getState().replayAttempt();

    expect(store.submitCalls()).toEqual([]);
    expect(store.useStore.getState().phase).toBe("idle");
  });
});

describe("clearForSignOut — the sign-out wipe (AC-12, R2-01)", () => {
  it("removes the durable record and resets the full envelope, returning the honest result", async () => {
    const store = await preparedStore();

    const removed = await store.useStore.getState().clearForSignOut();

    expect(removed).toEqual({ status: "persisted" });
    expect(store.raw.map.has(KEY)).toBe(false);
    const state = store.useStore.getState();
    expect(state.record).toBeNull();
    // recordLoaded: false is deliberate — the next session's recover() must
    // run a REAL read against whatever disk holds then.
    expect(state.recordLoaded).toBe(false);
    expect(state.phase).toBe("idle");
    expect(state.conflict).toBeNull();
    expect(state.failure).toBeNull();
    expect(state.persistence).toBe("persisted");
  });

  it("a rejected remove still resets the envelope and returns the rejection", async () => {
    const store = await preparedStore({ raw: createMemoryStore({ failOn: "removeItem" }) });

    const removed = await store.useStore.getState().clearForSignOut();

    expect(removed.status).toBe("rejected");
    // The memory reset happens BEFORE the rejection propagates: the sign-out
    // cleanup throws on this result, and after the throw core/auth's
    // emergency wipe owns DISK — nothing after it would ever reset MEMORY.
    // `persistence` is "unknown", not "clearFailed": the emergency wipe may
    // already have erased the stale record, and "unknown" forces the next
    // session's recover() to run a REAL read (the cart's H-F02 reasoning).
    const state = store.useStore.getState();
    expect(state.record).toBeNull();
    expect(state.recordLoaded).toBe(false);
    expect(state.phase).toBe("idle");
    expect(state.persistence).toBe("unknown");
    // The remove could not be proven — the stale record stays on disk.
    expect(readPersistedRecord(store.raw).status).toBe("unresolved");
  });

  it("queues its remove strictly BEHIND an in-flight recover read: no disk resurrection, memory wiped after (R2-01b)", async () => {
    // The recover-read window: sign-out lands while recovery's durable read
    // is in flight. The wipe is chain-enqueued, so it runs AFTER the read —
    // whatever the read loaded from disk is covered by the remove + reset
    // (the residual is memory-only DURING teardown, harmless); the next
    // session reads clean disk. The old raw remove ran off the chain and
    // left the loaded record resurrected in memory after the reset.
    const events: string[] = [];
    const raw = createMemoryStore();
    seedRecord(raw, unresolvedRecord());
    const baseGetItem = raw.getItem;
    const baseRemoveItem = raw.removeItem;
    let releaseRead: () => void = () => {};
    let signalRead: () => void = () => {};
    const readStarted = new Promise<void>((resolve) => {
      signalRead = resolve;
    });
    raw.getItem = async (key: string) => {
      if (key === KEY) {
        events.push("read");
        signalRead();
        await new Promise<void>((resolve) => {
          releaseRead = resolve;
        });
      }
      return baseGetItem(key);
    };
    raw.removeItem = async (key: string) => {
      if (key === KEY) events.push("remove");
      return baseRemoveItem(key);
    };
    const store = createStore({ raw });

    const recovering = store.useStore.getState().recover(OWNER_A);
    await readStarted; // the read is in flight

    // Sign-out mid-read: the wipe is requested while the read is in flight.
    const clearing = store.useStore.getState().clearForSignOut();
    expect(events).toEqual(["read"]); // the remove has NOT interleaved the read

    releaseRead();
    const outcome = await recovering;
    const removed = await clearing;

    // The read itself was untouched and honest; the remove ran strictly after.
    expect(outcome).toBe("unresolved");
    expect(removed).toEqual({ status: "persisted" });
    expect(events).toEqual(["read", "remove"]);
    // Final state: disk clean AND memory clean — the record the read loaded
    // did not survive the wipe (the old raw remove left it in memory).
    expect(store.raw.map.has(KEY)).toBe(false);
    const state = store.useStore.getState();
    expect(state.record).toBeNull();
    expect(state.recordLoaded).toBe(false);
    expect(state.phase).toBe("idle");
    expect(state.persistence).toBe("persisted");
  });
});
