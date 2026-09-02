import { createLogger } from "@/core/logging";
import { clearKisokStorage, createJsonStorage, storage } from "@/core/storage";

import { createDevicePolicyStore } from "./device-policy-store";

/**
 * AC-02 / AC-05 — the ephemeral device-policy store.
 *
 * Under test:
 * - the fail-closed default (nothing has proven this device is a kiosk);
 * - snapshot application: schema validation, derivation, and the session
 *   clear that every snapshot triggers (a role change invalidates an unlock);
 * - the maintenance unlock session: right code / wrong code / no code,
 *   expiry, clearing;
 * - the NEGATIVE space — the maintenance code and unlock state live in
 *   memory only: the store never touches `@/core/storage`, and no snapshot
 *   value ever reaches a logger (the maintenance code travels inside the
 *   restrictions).
 *
 * Both foundation seams are mocked for exactly those two negative
 * assertions, per the plan's test strategy ("zero calls into
 * `@/core/storage`", asserted with a mocked storage surface).
 */
jest.mock("@/core/storage", () => ({
  storage: { read: jest.fn(), write: jest.fn(), remove: jest.fn() },
  storageKey: jest.fn((feature: string, name: string) => `kisok:${feature}:${name}`),
  createJsonStorage: jest.fn(),
  clearKisokStorage: jest.fn(),
}));

jest.mock("@/core/logging", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(),
  })),
  setLogSink: jest.fn(),
  setLogLevel: jest.fn(),
  resetLogging: jest.fn(),
  redact: jest.fn(),
}));

const storageMock = {
  read: storage.read as unknown as jest.Mock,
  write: storage.write as unknown as jest.Mock,
  remove: storage.remove as unknown as jest.Mock,
};

// The other two ways into durable state: constructing a JSON store over a
// backend, and the emergency KISOK namespace reset.
const createJsonStorageMock = createJsonStorage as unknown as jest.Mock;
const clearKisokStorageMock = clearKisokStorage as unknown as jest.Mock;

const createLoggerMock = createLogger as unknown as jest.Mock;

type MockLogger = {
  debug: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

/** Logger instances the mocked `createLogger` handed out (one per module). */
function storeLoggers(): MockLogger[] {
  return createLoggerMock.mock.results.map((result) => result.value as MockLogger);
}

/** Every argument of every log call, at every level, across all loggers. */
function loggedCallArgs(): unknown[] {
  return storeLoggers().flatMap((logger) =>
    (["debug", "info", "warn", "error"] as const).flatMap((level) =>
      logger[level].mock.calls.flat(),
    ),
  );
}

function countWarnCalls(): number {
  return storeLoggers().reduce((total, logger) => total + logger.warn.mock.calls.length, 0);
}

const KIOSK_CODE = "4481";
const WRONG_CODE = "not-the-code-7741";
const TIMEOUT_SECONDS = 120;

/** A deterministic "now" so expiry arithmetic is exact, not fuzzy. */
const BASE_TIME = Date.UTC(2026, 8, 2, 12, 0, 0);

function kioskSnapshot() {
  return {
    restrictions: {
      kiosk_device_role: "customer_kiosk",
      maintenance_unlock_code: KIOSK_CODE,
      maintenance_unlock_timeout_seconds: TIMEOUT_SECONDS,
    },
    lockTaskPermitted: false,
    lockTaskModeState: "none",
  };
}

function standardSnapshot() {
  return {
    restrictions: { kiosk_device_role: "standard" },
    lockTaskPermitted: false,
    lockTaskModeState: "none",
  };
}

/** Kiosk role via allowlist corroboration only — reachable, but no code. */
function allowlistOnlyKioskSnapshot() {
  return {
    restrictions: {},
    lockTaskPermitted: true,
    lockTaskModeState: "locked",
  };
}

/** Schema-REJECTED (lockTaskPermitted is a string) and carrying poison values. */
function invalidSnapshot() {
  return {
    restrictions: {
      kiosk_device_role: "customer_kiosk",
      maintenance_unlock_code: KIOSK_CODE,
    },
    lockTaskPermitted: "poison-lock-task-permitted",
    lockTaskModeState: "none",
  };
}

const LOCKED_SESSION = { unlocked: false, expiresAt: null };

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(BASE_TIME);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("device-policy store (initial state)", () => {
  it("starts at the fail-closed standard default with a locked maintenance session", () => {
    const useStore = createDevicePolicyStore();

    expect(useStore.getState().policy).toEqual({
      role: "standard",
      maintenance: { code: null, timeoutSeconds: 90 },
    });
    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);
  });
});

describe("applySnapshot", () => {
  it("derives a customer-kiosk policy from a kiosk snapshot and leaves the session locked", () => {
    const useStore = createDevicePolicyStore();

    useStore.getState().applySnapshot(kioskSnapshot());

    expect(useStore.getState().policy).toEqual({
      role: "customer-kiosk",
      maintenance: { code: KIOSK_CODE, timeoutSeconds: TIMEOUT_SECONDS },
    });
    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);
  });

  it("derives a standard policy from a standard snapshot", () => {
    const useStore = createDevicePolicyStore();

    useStore.getState().applySnapshot(standardSnapshot());

    expect(useStore.getState().policy).toEqual({
      role: "standard",
      maintenance: { code: null, timeoutSeconds: 90 },
    });
  });

  it("fails closed on a schema-rejected snapshot: standard default, session cleared, one value-free warn", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(kioskSnapshot());
    useStore.getState().tryUnlock(KIOSK_CODE);
    const warnsBefore = countWarnCalls();

    useStore.getState().applySnapshot(invalidSnapshot());

    // An invalid snapshot carries no trustworthy affirmative signal, so the
    // device reverts to the fail-closed default — including the default
    // timeout, not whatever the previously-valid snapshot had set.
    expect(useStore.getState().policy).toEqual({
      role: "standard",
      maintenance: { code: null, timeoutSeconds: 90 },
    });
    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);

    // Exactly one warn for the rejected snapshot — no error, no debug chatter.
    expect(countWarnCalls()).toBe(warnsBefore + 1);
    // And no snapshot value ever appears in any log call, at any level: the
    // maintenance code lives in the restrictions (AC-05).
    expect(JSON.stringify(loggedCallArgs())).not.toContain(KIOSK_CODE);
    expect(JSON.stringify(loggedCallArgs())).not.toContain("poison-lock-task-permitted");
  });

  it("clears an existing unlocked session when a snapshot is applied (a role change invalidates the unlock)", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(kioskSnapshot());
    expect(useStore.getState().tryUnlock(KIOSK_CODE)).toBe(true);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(true);

    useStore.getState().applySnapshot(standardSnapshot());

    expect(useStore.getState().policy.role).toBe("standard");
    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);
  });

  it("re-applying the same snapshot re-locks an unlocked maintenance session — a restrictions re-read is a re-lock moment", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(kioskSnapshot());
    expect(useStore.getState().tryUnlock(KIOSK_CODE)).toBe(true);
    const policyBefore = useStore.getState().policy;

    useStore.getState().applySnapshot(kioskSnapshot());

    // The derived policy is unchanged — same role, same code, same timeout —
    // yet the session re-locks: EVERY snapshot application clears the
    // session, not only a role change.
    expect(useStore.getState().policy).toEqual(policyBefore);
    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);
  });
});

describe("tryUnlock", () => {
  it("unlocks with the correct code on a kiosk device and sets a future expiry from the derived timeout", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(kioskSnapshot());

    expect(useStore.getState().tryUnlock(KIOSK_CODE)).toBe(true);

    expect(useStore.getState().maintenance).toEqual({
      unlocked: true,
      expiresAt: BASE_TIME + TIMEOUT_SECONDS * 1000,
    });
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(true);
  });

  it("returns false for a wrong code and changes nothing — no partial state, no signal, nothing logged", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(kioskSnapshot());
    const policyBefore = useStore.getState().policy;
    const callsBefore = loggedCallArgs().length;

    expect(useStore.getState().tryUnlock(WRONG_CODE)).toBe(false);

    expect(useStore.getState().policy).toEqual(policyBefore);
    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);
    // A failed attempt must not even reveal whether a code exists.
    expect(loggedCallArgs().length).toBe(callsBefore);
    expect(JSON.stringify(loggedCallArgs())).not.toContain(WRONG_CODE);
  });

  it("returns false on a standard device (no maintenance code exists)", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(standardSnapshot());

    expect(useStore.getState().tryUnlock(KIOSK_CODE)).toBe(false);
    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
  });

  it("returns false on a kiosk device with no code configured (allowlist-only kiosk)", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(allowlistOnlyKioskSnapshot());

    expect(useStore.getState().policy.role).toBe("customer-kiosk");
    expect(useStore.getState().tryUnlock(KIOSK_CODE)).toBe(false);
    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
  });

  it("returns false for an empty-string attempt", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(kioskSnapshot());

    expect(useStore.getState().tryUnlock("")).toBe(false);
    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
  });

  it("re-extends the window when the correct code is entered while already unlocked (documented choice)", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(kioskSnapshot());
    useStore.getState().tryUnlock(KIOSK_CODE);

    // Half the original window elapses, then the code is entered again.
    const halfway = BASE_TIME + (TIMEOUT_SECONDS / 2) * 1000;
    jest.setSystemTime(halfway);

    expect(useStore.getState().tryUnlock(KIOSK_CODE)).toBe(true);

    // The new expiry is measured from the NEW now, not the original unlock.
    expect(useStore.getState().maintenance).toEqual({
      unlocked: true,
      expiresAt: halfway + TIMEOUT_SECONDS * 1000,
    });
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(true);
  });
});

describe("isMaintenanceUnlocked", () => {
  it("is false before an unlock, true after, false at expiry, false after clearMaintenance", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(kioskSnapshot());

    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);

    useStore.getState().tryUnlock(KIOSK_CODE);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(true);

    // One ms before expiry: still unlocked.
    jest.setSystemTime(BASE_TIME + TIMEOUT_SECONDS * 1000 - 1);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(true);

    // At the expiry instant: `now < expiresAt` no longer holds.
    jest.setSystemTime(BASE_TIME + TIMEOUT_SECONDS * 1000);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);

    useStore.getState().clearMaintenance();
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);
  });

  it("honours an injected now, so the overlay can ask about any instant without moving the clock", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(kioskSnapshot());
    useStore.getState().tryUnlock(KIOSK_CODE);

    expect(useStore.getState().isMaintenanceUnlocked(BASE_TIME + 1)).toBe(true);
    expect(useStore.getState().isMaintenanceUnlocked(BASE_TIME + TIMEOUT_SECONDS * 1000 + 1)).toBe(
      false,
    );
  });
});

describe("clearMaintenance", () => {
  it("locks the session without touching the policy", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(kioskSnapshot());
    useStore.getState().tryUnlock(KIOSK_CODE);

    useStore.getState().clearMaintenance();

    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);
    // Only the session is cleared — the derived policy survives.
    expect(useStore.getState().policy).toEqual({
      role: "customer-kiosk",
      maintenance: { code: KIOSK_CODE, timeoutSeconds: TIMEOUT_SECONDS },
    });
  });
});

describe("no persistence (AC-05)", () => {
  it("never touches @/core/storage across every action — no read/write/remove, no JsonStorage construction, no namespace clear", () => {
    const useStore = createDevicePolicyStore();

    // Exercise the entire action surface, including both applySnapshot paths.
    // The mocks accumulate calls across this whole file, so this also covers
    // every action exercised by the tests above.
    useStore.getState().isMaintenanceUnlocked();
    useStore.getState().applySnapshot(kioskSnapshot());
    useStore.getState().applySnapshot(standardSnapshot());
    useStore.getState().applySnapshot(invalidSnapshot());
    useStore.getState().tryUnlock(KIOSK_CODE);
    useStore.getState().tryUnlock(WRONG_CODE);
    useStore.getState().tryUnlock("");
    useStore.getState().isMaintenanceUnlocked(BASE_TIME);
    useStore.getState().clearMaintenance();

    expect(storageMock.read).not.toHaveBeenCalled();
    expect(storageMock.write).not.toHaveBeenCalled();
    expect(storageMock.remove).not.toHaveBeenCalled();
    // All five exported surfaces stay untouched: constructing a storage
    // layer or triggering the namespace reset would be persistence too.
    expect(createJsonStorageMock).not.toHaveBeenCalled();
    expect(clearKisokStorageMock).not.toHaveBeenCalled();
  });
});
