import { runSignOutCleanup, runSignOutGuards, type SignOutGuardResult } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import { storage, storageKey } from "@/core/storage";

import { checkoutAttemptSchema, type CheckoutAttempt } from "../model/checkout-attempt.schema";
import { useAttemptStore, type AttemptState } from "./attempt-store";
// The module under test. Its import IS the behaviour under test: checkout's
// sign-out guard + cleanup register here, as a module side-effect.
import { clearCheckoutForSignOut } from "./sign-out-cleanup";

/**
 * lucide-react-native resolves (via the `react-native` condition) to an
 * untransformed ESM entry under jest-expo, so no test in this repo can
 * value-import it without a jest-config change. This suite renders no
 * lucide-using component — but the module under test binds the attempt store,
 * whose default deps bind the Cart feature's PUBLIC index, and that index
 * re-exports the cart's components and screen, which value-import lucide — so
 * the module graph needs the standardized stand-ins (the attempt-store and
 * use-cart.test.tsx precedents) just to load. The icons are decorative SVGs;
 * nothing here asserts on them.
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

/**
 * T07 — checkout's sign-out guard + cleanup registration (AC-12).
 *
 * How this file drives a module that registers on import against the
 * module-global core/auth registries:
 *
 * - Registry hygiene: the beforeEach/afterEach `clearSignOutTasks()` pattern
 *   from core/auth's own suite is deliberately NOT used here, for the reason
 *   the cart's sign-out-cleanup.test.ts documented first: THIS subject
 *   registers once, at import — the static import above — so clearing the
 *   registries between tests would delete the very registration under test,
 *   and a dynamic re-import cannot restore it (the module graph is cached,
 *   and jest's CJS sandbox rejects `import()`). The registration stays live
 *   for the whole file: it is the file's only checkout registration, the
 *   registries are name-keyed Maps so re-registration is idempotent, and
 *   jest's per-file module sandbox keeps it from leaking into any other
 *   suite.
 * - The module graph also registers the CART's cleanup ("cart"): the attempt
 *   store binds the Cart feature's public index, whose own side-effect import
 *   registers it. `runSignOutCleanup()` therefore runs the REAL production
 *   composition (cart + checkout). The cart's clear of an empty store
 *   succeeds, so `failures: []` is the honest full-lifecycle assertion, and
 *   the failure test asserts EXACT equality against
 *   `["checkout-cleanup"]` — pinning both halves of the composition:
 *   checkout failed by name, and the cart's real remove (which the spy
 *   passes through for non-checkout keys) succeeded in the same run.
 * - The failure path: the cleanup removes `kisok:checkout:attempt` through
 *   the REAL `storage` singleton — it is not injectable through the attempt
 *   store's factory, and the store offers no ungated clear action to swap
 *   the way the cart's test replaced `clear()` via `useCartStore.setState`.
 *   The matching seam here is `jest.spyOn(storage, "remove")`, rejecting
 *   ONLY the checkout key so the cart's cleanup in the same lifecycle still
 *   runs its real path; the spy is restored in a finally. No jest module
 *   mocking is involved, and the success-path tests prove the REAL remove
 *   end-to-end (write → cleanup → read back through `storage.read`, the way
 *   a cold start would).
 * - The liveness test: the index import is loaded inside
 *   `jest.isolateModules`, so the only way the guard can exist in that fresh
 *   registry is the index's own side-effect import — this file's direct
 *   module import above cannot have registered it there. `require()` is the
 *   CJS mechanism (jest's sandbox rejects dynamic `import()`); each one-line
 *   eslint disable follows the repo's generator-template precedent.
 */

const KEY = storageKey("checkout", "attempt");
const OWNER = "11111111-2222-4333-8444-555555555555";
const VARIANT_ID = "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d";
const PRODUCT_ID = "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a";

/** One plain line snapshot — the same shape the attempt-store tests round-trip. */
const WATER_SNAPSHOT = {
  lineId: VARIANT_ID,
  variantId: VARIANT_ID,
  productId: PRODUCT_ID,
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 3,
};

/**
 * Fixtures are proven schema-valid at construction (`checkoutAttemptSchema.parse`
 * throws at load time if not): the guard branches on `record.status`, and a
 * record that could never exist on disk would test nothing.
 */
const UNRESOLVED_RECORD: CheckoutAttempt = checkoutAttemptSchema.parse({
  version: 1,
  ownerId: OWNER,
  clientRequestId: "0a1b2c3d-4e5f-4607-8a8b-9c0d1e2f3a4b",
  items: [{ variant_id: VARIANT_ID, quantity: 3 }],
  fingerprint: `${VARIANT_ID}:3`,
  lineSnapshots: [WATER_SNAPSHOT],
  status: "unresolved",
});

/**
 * The legal sign-out composition: a server-CONFIRMED order with cleanup still
 * PENDING (the strongest non-blocking case — the packet's deliberate scoping:
 * a confirmed order creates no duplicate-order risk on sign-out).
 */
const CONFIRMED_RECORD: CheckoutAttempt = checkoutAttemptSchema.parse({
  ...UNRESOLVED_RECORD,
  status: "confirmed",
  success: {
    orderId: "d0a1b2c3-4d5e-4f60-8a7b-8c9d0e1f2a3b",
    displayNumber: "KX7QR9",
    createdAt: "2026-02-01T10:15:30+00:00",
  },
  cleanup: { cartClear: "pending" },
});

/** Read the attempt key back through the app's real storage API. */
async function readPersistedAttempt() {
  return storage.read(KEY, (raw) => checkoutAttemptSchema.parse(raw));
}

/**
 * The store's full DATA surface (actions excluded — they are stable module
 * functions). A JSON round-trip makes a byte-level copy, so an in-place
 * mutation of a nested object cannot hide behind reference equality.
 */
type AttemptData = Pick<
  AttemptState,
  "record" | "recordLoaded" | "persistence" | "phase" | "conflict" | "failure"
>;

function snapshotAttemptData(): AttemptData {
  const { record, recordLoaded, persistence, phase, conflict, failure } =
    useAttemptStore.getState();
  return JSON.parse(
    JSON.stringify({ record, recordLoaded, persistence, phase, conflict, failure }),
  );
}

/** Reset the singleton's memory between tests (disk is cleared in afterEach). */
function resetAttemptSingleton() {
  useAttemptStore.setState({
    record: null,
    recordLoaded: false,
    persistence: "unknown",
    phase: "idle",
    conflict: null,
    failure: null,
  });
}

describe("checkout sign-out guard + cleanup (AC-12)", () => {
  beforeEach(() => {
    // The failure path logs by design (core/auth's lifecycle reports it) —
    // keep the suite silent, per the repo convention.
    setLogSink(() => {});
    resetAttemptSingleton();
  });

  afterEach(async () => {
    resetLogging();
    // Disk hygiene: the failure-path test leaves the seeded key behind by
    // design (its remove is what failed); clear it through the REAL storage.
    await storage.remove(KEY);
  });

  it("blocks sign-out while an attempt is unresolved, with the documented reason — and mutates NOTHING", async () => {
    // The post-resolveUnknown shape a real session would hold when the
    // outcome is unknown: durable unresolved record, phase "unknown".
    useAttemptStore.setState({
      record: UNRESOLVED_RECORD,
      recordLoaded: true,
      persistence: "persisted",
      phase: "unknown",
    });
    const stateBefore = useAttemptStore.getState();
    const dataBefore = snapshotAttemptData();

    await expect(runSignOutGuards()).resolves.toEqual({
      status: "blocked",
      reason: "An order submission is still unresolved.",
    });

    // Side-effect-free proof (docs/state-management.md Phase 1: guards
    // decide, they do not mutate), pinned two ways:
    // (a) no zustand setState ran at all — the state object is
    //     reference-identical (zustand's set always produces a new object);
    expect(useAttemptStore.getState()).toBe(stateBefore);
    // (b) no in-place mutation of the data either — a byte-level deep copy
    //     of the full data surface is unchanged.
    expect(snapshotAttemptData()).toEqual(dataBefore);
  });

  it("approves sign-out when no attempt record exists (recovery found nothing)", async () => {
    useAttemptStore.setState({ recordLoaded: true, persistence: "persisted", phase: "idle" });

    await expect(runSignOutGuards()).resolves.toEqual({ status: "ok" });
  });

  it("approves sign-out with a CONFIRMED record — the success flow owns that state, not sign-out", async () => {
    // Deliberate scoping: only `unresolved` blocks. A confirmed order is
    // server-confirmed; discarding its record on sign-out loses nothing a
    // replay would need (there is nothing left to replay), so it creates no
    // duplicate-order risk. Confirmed-with-unsafe-cleanup is the in-session
    // reset gate's business (AC-11/AC-14), not sign-out's. "pending" is the
    // strongest case: even a cleanup that never finished does not block.
    useAttemptStore.setState({
      record: CONFIRMED_RECORD,
      recordLoaded: true,
      persistence: "persisted",
      phase: "confirmed",
    });

    await expect(runSignOutGuards()).resolves.toEqual({ status: "ok" });
  });

  it("registers on import: runSignOutCleanup wipes the durable key AND resets the in-memory envelope, with no failures", async () => {
    // The LEGAL composition: the guard approved (a confirmed record does not
    // block sign-out), the session is gone, so the cleanup may wipe. Seed
    // honestly — a real record through the app's real write path — so the
    // post-run assertions have something to be false about.
    await expect(storage.write(KEY, CONFIRMED_RECORD)).resolves.toEqual({ status: "persisted" });
    // The seed really is on disk, or the post-run miss would prove nothing.
    expect((await readPersistedAttempt()).status).toBe("hit");
    useAttemptStore.setState({
      record: CONFIRMED_RECORD,
      recordLoaded: true,
      persistence: "persisted",
      phase: "confirmed",
    });

    const result = await runSignOutCleanup();

    // The full real composition (the cart's cleanup runs here too — it
    // registered via the attempt store's `@/features/cart` import — and its
    // empty-store clear succeeds).
    expect(result).toEqual({ failures: [] });
    const state = useAttemptStore.getState();
    expect(state.record).toBeNull();
    expect(state.recordLoaded).toBe(false);
    expect(state.phase).toBe("idle");
    expect(state.persistence).toBe("persisted");
    expect((await readPersistedAttempt()).status).toBe("miss");
  });

  it("propagates a failed durable clear: the task throws AFTER resetting memory, and the lifecycle records the failure", async () => {
    // A durable clear that cannot be proven. The singleton's remove seam is
    // temporarily replaced — rejecting ONLY the checkout key, so the cart's
    // cleanup in the same lifecycle still runs its real path (the cart test's
    // setState-patched action is the analogous seam for its store).
    await expect(storage.write(KEY, CONFIRMED_RECORD)).resolves.toEqual({ status: "persisted" });
    useAttemptStore.setState({
      record: CONFIRMED_RECORD,
      recordLoaded: true,
      persistence: "persisted",
      phase: "confirmed",
    });
    const realRemove = storage.remove;
    const removeSpy = jest
      .spyOn(storage, "remove")
      .mockImplementation(async (key: string) =>
        key === KEY ? { status: "rejected", error: new Error("disk full") } : await realRemove(key),
      );

    try {
      // The task itself rejects with the honest message — swallowing it
      // would leave the previous customer's attempt record on disk with no
      // one left to clear it.
      await expect(clearCheckoutForSignOut()).rejects.toThrow(
        "Checkout sign-out cleanup could not durably clear the attempt record: disk full",
      );

      // The memory envelope was reset BEFORE the throw (the cart's H-F02
      // precedent): once the failure propagates, core/auth's emergency wipe
      // owns DISK, but nothing else would ever reset MEMORY. A stale record
      // would block the NEXT session's sign-out for the previous customer's
      // attempt; `recordLoaded: false` + `persistence: "unknown"` force the
      // next session's recover() to run a REAL read against post-wipe disk.
      const state = useAttemptStore.getState();
      expect(state.record).toBeNull();
      expect(state.recordLoaded).toBe(false);
      expect(state.phase).toBe("idle");
      expect(state.persistence).toBe("unknown");

      // Through the lifecycle the throw is captured and reported — exactly
      // the contract that triggers core/auth's emergency kisok:* namespace
      // reset. Exact equality pins BOTH halves of the real composition:
      // checkout failed by name, and the cart's real remove — which the spy
      // passes through for non-checkout keys — succeeded in the same run.
      const result = await runSignOutCleanup();
      expect(result.failures).toEqual(["checkout-cleanup"]);
    } finally {
      removeSpy.mockRestore();
    }
  });

  it("clears the durable key and the full in-memory envelope through the real storage paths", async () => {
    await expect(storage.write(KEY, CONFIRMED_RECORD)).resolves.toEqual({ status: "persisted" });
    // The seed really is on disk, or the post-clear miss would prove nothing.
    expect((await readPersistedAttempt()).status).toBe("hit");
    useAttemptStore.setState({
      record: CONFIRMED_RECORD,
      recordLoaded: true,
      persistence: "persisted",
      phase: "confirmed",
      conflict: null,
      failure: null,
    });

    await expect(clearCheckoutForSignOut()).resolves.toBeUndefined();

    const state = useAttemptStore.getState();
    expect(state.record).toBeNull();
    expect(state.recordLoaded).toBe(false);
    expect(state.phase).toBe("idle");
    // The previous session's ephemeral UI payloads go with the record.
    expect(state.conflict).toBeNull();
    expect(state.failure).toBeNull();
    // `persistence` mirrors the store's own discard-success semantics: the
    // remove proved the wipe, so "persisted" is the honest status.
    expect(state.persistence).toBe("persisted");
    expect((await readPersistedAttempt()).status).toBe("miss");
  });

  it("importing the public index makes the guard live (registration liveness — plan decision 10 / D7)", async () => {
    let guards: Promise<SignOutGuardResult> | undefined;
    jest.isolateModules(() => {
      // The index import IS the production registration path: the customer
      // layout's module load (plan D7) is what makes checkout's guard live.
      // Loaded in a fresh module registry, so the only way this guard exists
      // here is the index's side-effect import — the direct module import at
      // the top of this file cannot have registered it in THIS registry.
      // (Bare `require` is the CJS mechanism jest's sandbox needs here.)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../index");
      // The fresh registry's modules — typed through `typeof import(...)`, so
      // the requires below stay honest to the real module shapes: silence the
      // fresh logger instance (it starts on the console sink) exactly as
      // beforeEach does for this file's own instance.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const logging = require("@/core/logging") as typeof import("@/core/logging");
      logging.setLogSink(() => {});
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const attemptStore = require("./attempt-store") as typeof import("./attempt-store");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const auth = require("@/core/auth") as typeof import("@/core/auth");
      attemptStore.useAttemptStore.setState({
        record: UNRESOLVED_RECORD,
        recordLoaded: true,
        persistence: "persisted",
        phase: "unknown",
      });
      guards = auth.runSignOutGuards();
    });
    if (guards === undefined) {
      throw new Error("the isolateModules callback did not produce a guard run");
    }
    await expect(guards).resolves.toEqual({
      status: "blocked",
      reason: "An order submission is still unresolved.",
    });
  });
});
