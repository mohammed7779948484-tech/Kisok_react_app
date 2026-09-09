import { runSignOutCleanup, runSignOutGuards } from "@/core/auth";
import { finishSignOutHandoff } from "@/core/auth/sign-out";
import { resetLogging, setLogSink } from "@/core/logging";
import { storage, storageKey } from "@/core/storage";

import type { AddToCartInput, CartLine } from "../model/cart-line.schema";
import { deriveLineId } from "../model/cart-rules";
import { persistedCartSchema } from "../model/persisted-cart.schema";
import { useCartStore } from "./cart-store";
// The module under test. Its import IS the behaviour under test: the cart's
// sign-out cleanup registers here, as a module side-effect.
import { clearCartForSignOut } from "./sign-out-cleanup";

/**
 * T05 — the cart's sign-out cleanup registration (AC-07).
 *
 * How this file drives a module that registers on import against the SINGLETON
 * `useCartStore`:
 *
 * - The singleton's durable backend is the real `storage` (AsyncStorage —
 *   mocked by core/testing/setup.ts with the package's official in-memory
 *   mock: reliable, but it cannot be told to fail). The injectable-backend
 *   seam (`createCartStore(backend)`) is exercised by `cart-store.test.ts`
 *   (T03/T04), where `clear()`'s remove→fallback and `clearFailed` semantics
 *   are already proven against `createMemoryStore({ failOn })`. What T05 must
 *   pin is the LIFECYCLE contract: registration, the honest throw, the memory
 *   reset, and no guard.
 * - Memory state is therefore placed with `useCartStore.setState(...)`, and a
 *   failing durable clear is produced by temporarily replacing the
 *   singleton's `clear` action — `setState` can replace actions on a real
 *   zustand store; no mock framework is involved.
 * - The durable-success path runs end-to-end through the REAL write and
 *   remove paths (`persistNow` → `storage.write` → AsyncStorage; `clear` →
 *   `storage.remove`) and is verified by reading the key back through the
 *   app's own `storage.read` API, the way a cold start would.
 * - The H-F02 lifecycle test drives the auth pipeline's full completion
 *   shape, so it also calls `finishSignOutHandoff` — imported from the deep
 *   `@/core/auth/sign-out` module, exactly as production's context.tsx does
 *   (the public `@/core/auth` index deliberately does not re-export the
 *   handoff internals).
 *
 * Registry hygiene: the sanctioned `beforeEach/afterEach(clearSignOutTasks)`
 * pattern from core/auth/__tests__/sign-out.test.ts is deliberately adapted
 * here. That file registers its tasks inside each test; THIS subject
 * registers once, at import — the static import above — so clearing the
 * registry between tests would delete the very registration under test (a
 * dynamic re-import cannot restore it: the module graph is cached, and
 * jest's CJS sandbox rejects `import()` without --experimental-vm-modules).
 * The registration is instead left live for the whole file: it is the file's
 * ONLY registration (nothing here registers manually), the registry is a
 * name-keyed Map so re-registration is idempotent, and jest's per-file module
 * sandbox keeps it from leaking into any other suite.
 */

const KEY = storageKey("cart", "lines");
const OWNER = "11111111-2222-4333-8444-555555555555";

/** A schema-valid line — the same shape the cart-store tests round-trip. */
const seedLine: CartLine = {
  lineId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  variantId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 3,
};

/**
 * The selection the re-authed customer adds — a DIFFERENT line from the seed,
 * so a resurrected old cart can never pass as the new session's write.
 */
const coldBrewInput: AddToCartInput = {
  variantId: "1b2a3f4e-5d6c-4b7a-9e8f-0a1b2c3d4e5f",
  productId: "6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f",
  productDisplayName: "Cold Brew Coffee",
  variantLabel: "330 ml Can",
  optionSelections: [],
  imageUri: null,
  quantity: 2,
};

/** The id the rules derive for that selection — what the store must attach. */
const coldBrewLineId = deriveLineId(coldBrewInput);

/** The singleton's real clear action — restored after a test patches it. */
const realClear = useCartStore.getState().clear;

/** Read the cart key back through the app's real storage API. */
async function readPersistedCart() {
  return storage.read(KEY, (raw) => persistedCartSchema.parse(raw));
}

/** Reset the singleton's memory between tests (disk is per-test: seeded and cleared within it). */
function resetCartSingleton() {
  useCartStore.setState({
    lines: [],
    ownerId: null,
    persistence: "unknown",
    hydrated: false,
    locked: false,
    clear: realClear,
  });
}

describe("cart sign-out cleanup (AC-07)", () => {
  beforeEach(() => {
    // The failure path logs by design (the store and the auth lifecycle both
    // report it) — keep the suite silent, per the repo convention.
    setLogSink(() => {});
    resetCartSingleton();
  });

  afterEach(resetLogging);

  it("registers on import: runSignOutCleanup clears memory AND the durable key, resetting the lock, with no failures", async () => {
    // The plan's integration promise, pinned in ONE lifecycle test (plan.md
    // T05 test strategy: "after runSignOutCleanup(), memory and key are
    // empty"). Seed honestly — real lines, real owner, real write through the
    // store's own write path — so the post-run assertions have something to
    // be false about.
    useCartStore.setState({
      lines: [seedLine],
      ownerId: OWNER,
      hydrated: true,
      locked: true,
    });
    await expect(useCartStore.getState().persistNow()).resolves.toEqual({ status: "persisted" });
    // The seed really is on disk, or the post-run miss would prove nothing.
    expect((await readPersistedCart()).status).toBe("hit");

    const result = await runSignOutCleanup();

    expect(result).toEqual({ failures: [] });
    expect(useCartStore.getState().lines).toEqual([]);
    expect(useCartStore.getState().locked).toBe(false);
    expect((await readPersistedCart()).status).toBe("miss");
  });

  it("propagates a failed durable clear: the task throws, and the auth lifecycle records the failure", async () => {
    // A durable clear that cannot be proven. T03/T04 prove the real
    // remove→fallback semantics behind `clear()`; here the singleton's clear
    // action is replaced with a failing one (setState can replace actions on
    // a real zustand store — no mock framework).
    useCartStore.setState({
      clear: async () => ({ status: "rejected", error: new Error("disk full") }),
    });

    // The task itself rejects with the honest message — swallowing it would
    // leave the previous customer's cart on disk with no one left to clear it.
    await expect(clearCartForSignOut()).rejects.toThrow(
      "Cart sign-out cleanup could not durably clear the cart: disk full",
    );

    // Through the lifecycle the throw is captured and reported — exactly the
    // contract that triggers core/auth's emergency kisok:* namespace reset.
    const result = await runSignOutCleanup();

    expect(result).toEqual({ failures: ["cart"] });
  });

  it("H-F02: after a failed durable clear and the emergency wipe, the SAME owner re-auths to an empty, unlocked, coherent, mutable cart", async () => {
    // The full sign-out FAILURE cycle: the cart task throws, runSignOutCleanup
    // records it, finishSignOutHandoff emergency-wipes the kisok:* namespace
    // (disk ends clean) — and then the SAME customer signs in again. The
    // stale in-memory session envelope (locked / clearFailed / ownerId /
    // hydrated) must not survive that cycle to no-op the re-hydrate through
    // restore()'s same-owner shortcut: the next session starts empty,
    // unlocked, coherent, and mutable, and the old cart never resurrects.

    // Seed honestly: a real line on disk through the store's own write path.
    useCartStore.setState({
      lines: [seedLine],
      ownerId: OWNER,
      hydrated: true,
      locked: true,
    });
    await expect(useCartStore.getState().persistNow()).resolves.toEqual({ status: "persisted" });
    // The seed really is on disk, or the post-cycle assertions prove nothing.
    expect((await readPersistedCart()).status).toBe("hit");

    // A durable clear that cannot be proven — the same patched-clear seam as
    // the failure test above, modelling the REAL clear's in-memory semantics
    // (lines emptied synchronously, the honest `clearFailed` report) so what
    // can fail below is the session-ENVELOPE leak (H-F02), never an artifact
    // of the patch. T03/T04 own the real remove→fallback semantics.
    useCartStore.setState({
      clear: async () => {
        useCartStore.setState({ lines: [] });
        useCartStore.setState({ persistence: "clearFailed" });
        return { status: "rejected", error: new Error("disk full") };
      },
    });

    // The auth pipeline, exactly as core/auth/context.tsx drives it: the cart
    // task's throw is captured and reported as a failure.
    const cleanup = await runSignOutCleanup();
    expect(cleanup).toEqual({ failures: ["cart"] });

    // ...and the handoff emergency-wipes the kisok:* namespace on the REAL
    // storage — the auth policy completion of a failed cleanup. Disk provably
    // ends clean; the invariant under test is what MEMORY does after it.
    const handoff = await finishSignOutHandoff(cleanup.failures);
    expect(handoff).toEqual({ status: "ok" });
    expect((await readPersistedCart()).status).toBe("miss");

    // The same customer signs in again.
    await useCartStore.getState().hydrate(OWNER);

    // The next session's invariant: empty, unlocked, coherent.
    const state = useCartStore.getState();
    expect(state.lines).toEqual([]);
    expect(state.locked).toBe(false);
    expect(state.hydrated).toBe(true);
    expect(state.ownerId).toBe(OWNER);
    expect(state.persistence).toBe("persisted");

    // Mutations work — a stale lock must not silently no-op them — and the
    // old cart does not resurrect: the first durable write of the new session
    // lands exactly the new line, never the wiped seed line.
    useCartStore.getState().addItem(coldBrewInput);
    await expect(useCartStore.getState().persistNow()).resolves.toEqual({ status: "persisted" });
    expect(useCartStore.getState().lines).toEqual([{ ...coldBrewInput, lineId: coldBrewLineId }]);
    expect(await readPersistedCart()).toEqual({
      status: "hit",
      value: {
        version: 1,
        ownerId: OWNER,
        lines: [{ ...coldBrewInput, lineId: coldBrewLineId }],
      },
    });
  });

  it("registers NO guard — even a populated, locked cart never blocks sign-out (future Checkout owns the guard)", async () => {
    // core/auth/sign-out.ts: a guard exists for ONE invariant — an unresolved
    // checkout attempt must not be wiped — and that belongs to future
    // Checkout, never to the cart ("Never combine guards and cleanup").
    //
    // This test also passes at RED: it pins a negative invariant, and the
    // regression it guards against is someone adding a cart guard later.
    //
    // Deliberately BEHAVIORAL, not static: the guards Map in core/auth is
    // private, so this cannot (and should not) reach into it. Instead it seeds
    // the state a plausible future guard would key on — a populated cart, an
    // active owner, and the interaction LOCK (the one cart state that looks
    // like "a critical operation is in flight") — and asserts sign-out still
    // proceeds. A future lock- or lines-keyed cart guard would run against
    // exactly this state and block, failing this test.
    useCartStore.setState({
      lines: [seedLine],
      ownerId: OWNER,
      hydrated: true,
      locked: true,
    });

    await expect(runSignOutGuards()).resolves.toEqual({ status: "ok" });
  });

  it("resets a stale lock at the sign-out boundary (R-T04-01 carry note)", async () => {
    useCartStore.setState({ locked: true });

    await runSignOutCleanup();

    expect(useCartStore.getState().locked).toBe(false);
  });

  it("clears memory AND the durable key through the real store paths, reporting the durable result", async () => {
    // Seed the singleton honestly: real state through the real write path.
    useCartStore.setState({
      ownerId: OWNER,
      lines: [seedLine],
      hydrated: true,
      locked: true,
    });
    await expect(useCartStore.getState().persistNow()).resolves.toEqual({ status: "persisted" });
    // The seed really is on disk, or the post-clear miss would prove nothing.
    expect((await readPersistedCart()).status).toBe("hit");

    await expect(clearCartForSignOut()).resolves.toBeUndefined();

    const state = useCartStore.getState();
    expect(state.lines).toEqual([]);
    expect(state.locked).toBe(false);
    // `persistence` reflects the durable result and is NOT overwritten by the
    // cleanup: a failed durable clear must stay visible as `clearFailed` for
    // the CART SURFACES to warn about (T08/T09 — the auth lifecycle consumes
    // the cleanup task's throw, not this field). Here the real remove
    // succeeded → "persisted".
    expect(state.persistence).toBe("persisted");
    expect((await readPersistedCart()).status).toBe("miss");
  });
});
