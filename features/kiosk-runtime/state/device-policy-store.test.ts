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
 * - the readiness verdict (RD-01) and its event-driven invalidation
 *   (RD5-02): a restrictions-change event destroys a stale permissive
 *   STANDARD verdict synchronously and always clears the maintenance
 *   session, but never reverts a customer-kiosk role;
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

/** Provisional (KEY_RESTRICTIONS_PENDING) with every bundle signal suppressed by it. */
function provisionalSnapshot() {
  return {
    restrictions: { kiosk_device_role: "customer_kiosk", restrictions_pending: true },
    lockTaskPermitted: true,
    lockTaskModeState: "none",
  };
}

/** Provisional bundle + live LOCKED corroboration — derives kiosk, stays pending (RD-02).
 *  Carries the maintenance credential: the policy self-describes (code still
 *  derived), but RD5-04 supersedes the Round 4 RD-02 credential corollary —
 *  an unsettled bundle is NOT final credential material, so tryUnlock gates
 *  it (R5-11). */
function provisionalLockedSnapshot() {
  return {
    restrictions: {
      kiosk_device_role: "customer_kiosk",
      maintenance_unlock_code: KIOSK_CODE,
      maintenance_unlock_timeout_seconds: TIMEOUT_SECONDS,
      restrictions_pending: true,
    },
    lockTaskPermitted: true,
    lockTaskModeState: "locked",
  };
}

/** The SAME bundle after settling: identical minus the pending marker — what
 *  the re-read delivers once the restrictions land (R5-11). */
function settledKioskSnapshot() {
  return {
    restrictions: {
      kiosk_device_role: "customer_kiosk",
      maintenance_unlock_code: KIOSK_CODE,
      maintenance_unlock_timeout_seconds: TIMEOUT_SECONDS,
    },
    lockTaskPermitted: true,
    lockTaskModeState: "locked",
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
      restrictionsSettled: true,
      maintenance: { code: null, timeoutSeconds: 90 },
    });
    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);
  });

  it("starts with readiness 'pending' — nothing has read the policy yet (RD-01)", () => {
    const useStore = createDevicePolicyStore();

    expect(useStore.getState().readiness).toBe("pending");
  });
});

describe("applySnapshot", () => {
  it("derives a customer-kiosk policy from a kiosk snapshot and leaves the session locked", () => {
    const useStore = createDevicePolicyStore();

    useStore.getState().applySnapshot(kioskSnapshot());

    expect(useStore.getState().policy).toEqual({
      role: "customer-kiosk",
      restrictionsSettled: true,
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
      restrictionsSettled: true,
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
      restrictionsSettled: true,
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

describe("readiness verdict (RD-01)", () => {
  it("resolves when a valid, non-provisional snapshot is applied — standard or kiosk", () => {
    const useStore = createDevicePolicyStore();

    useStore.getState().applySnapshot(standardSnapshot());
    expect(useStore.getState().readiness).toBe("resolved");

    useStore.getState().applySnapshot(kioskSnapshot());
    expect(useStore.getState().readiness).toBe("resolved");
  });

  it("holds 'pending' on a provisional snapshot — KEY_RESTRICTIONS_PENDING means the final state is undetermined", () => {
    const useStore = createDevicePolicyStore();

    useStore.getState().applySnapshot(provisionalSnapshot());

    // Unchanged derivation semantics: the provisional bundle derives the
    // fail-closed standard role (every bundle/allowlist signal suppressed).
    expect(useStore.getState().policy.role).toBe("standard");
    expect(useStore.getState().readiness).toBe("pending");
  });

  it("holds 'pending' on a provisional snapshot with LOCKED corroboration — the policy is kiosk (RD-02), the verdict is still not final", () => {
    const useStore = createDevicePolicyStore();

    useStore.getState().applySnapshot(provisionalLockedSnapshot());

    expect(useStore.getState().policy.role).toBe("customer-kiosk");
    expect(useStore.getState().readiness).toBe("pending");
  });

  it("reverts to 'pending' when a schema-rejected snapshot arrives after a resolved one", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(standardSnapshot());
    expect(useStore.getState().readiness).toBe("resolved");

    useStore.getState().applySnapshot(invalidSnapshot());

    expect(useStore.getState().policy).toEqual({
      role: "standard",
      restrictionsSettled: true,
      maintenance: { code: null, timeoutSeconds: 90 },
    });
    expect(useStore.getState().readiness).toBe("pending");
  });

  it("markModuleAbsent resolves readiness without touching policy or session — the standard default IS the platform verdict (web/jest)", () => {
    const useStore = createDevicePolicyStore();
    const policyBefore = useStore.getState().policy;
    const sessionBefore = useStore.getState().maintenance;

    useStore.getState().markModuleAbsent();

    expect(useStore.getState().readiness).toBe("resolved");
    expect(useStore.getState().policy).toBe(policyBefore);
    expect(useStore.getState().maintenance).toBe(sessionBefore);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);
  });

  it("markModuleAbsent is idempotent — every read on an absent module re-resolves the same verdict", () => {
    const useStore = createDevicePolicyStore();

    useStore.getState().markModuleAbsent();
    useStore.getState().markModuleAbsent();

    expect(useStore.getState().readiness).toBe("resolved");
  });
});

describe("readError (RD5-03 — the UI-only pending-failure surface)", () => {
  it("starts null — no read has failed yet", () => {
    const useStore = createDevicePolicyStore();

    expect(useStore.getState().readError).toBeNull();
  });

  it("setReadError records the reason while readiness is pending — first-read failures and the android module-absent case", () => {
    const useStore = createDevicePolicyStore();

    useStore.getState().setReadError("read-failed");
    expect(useStore.getState().readError).toEqual({ reason: "read-failed" });

    useStore.getState().setReadError("module-absent");
    expect(useStore.getState().readError).toEqual({ reason: "module-absent" });
  });

  it("setReadError is a NO-OP while a verdict is resolved — the error exists only while a user is actually held at startup", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(standardSnapshot());
    expect(useStore.getState().readiness).toBe("resolved");

    // An AppState-triggered re-read failure lands here with readiness
    // resolved: last-known-good stands, nobody is held, so no surface.
    // The invariant "set ONLY while pending" is enforced by the store, not
    // just by the caller.
    useStore.getState().setReadError("read-failed");

    expect(useStore.getState().readError).toBeNull();
    expect(useStore.getState().readiness).toBe("resolved");
  });

  it("a successful read clears readError (applySnapshot)", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().setReadError("read-failed");

    useStore.getState().applySnapshot(standardSnapshot());

    expect(useStore.getState().readError).toBeNull();
    expect(useStore.getState().readiness).toBe("resolved");
  });

  it("a schema-REJECTED application neither clears nor sets readError — it is not a successful read, and not a rejection either", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().setReadError("read-failed");

    useStore.getState().applySnapshot(invalidSnapshot());

    // The malformed read leaves the fail-closed hold exactly as a pending
    // verdict with the error still offered: retry → loading → error-again.
    expect(useStore.getState().readError).toEqual({ reason: "read-failed" });
    expect(useStore.getState().readiness).toBe("pending");
  });

  it("markModuleAbsent clears readError alongside resolving readiness", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().setReadError("module-absent");

    useStore.getState().markModuleAbsent();

    expect(useStore.getState().readError).toBeNull();
    expect(useStore.getState().readiness).toBe("resolved");
  });

  it("clearReadError clears it — the retry dispatch (retry → loading → error-again-or-resolved)", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().setReadError("read-failed");

    useStore.getState().clearReadError();

    expect(useStore.getState().readError).toBeNull();
  });
});

describe("onRestrictionsChanged — event-driven invalidation (RD5-02)", () => {
  it("invalidates a resolved STANDARD verdict to pending — the event means the restrictions changed under it", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(standardSnapshot());
    expect(useStore.getState().readiness).toBe("resolved");

    useStore.getState().onRestrictionsChanged();

    // The broadcast follows the persist (AOSP write-then-broadcast order),
    // so a resolved standard verdict is evidence about a superseded world:
    // destroyed NOW — synchronously, in the sync hook's listener, BEFORE
    // the async re-read — never by the re-read's own outcome.
    expect(useStore.getState().readiness).toBe("pending");
    // Only the verdict is destroyed: the policy itself is not reverted —
    // the re-read (or its failure) supplies what comes next.
    expect(useStore.getState().policy.role).toBe("standard");
    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
  });

  it("ALWAYS clears the maintenance session, even when the verdict is not invalidated — the credential basis changed regardless of read outcome", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(kioskSnapshot());
    expect(useStore.getState().tryUnlock(KIOSK_CODE)).toBe(true);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(true);

    useStore.getState().onRestrictionsChanged();

    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);
  });

  it("NEVER reverts a customer-kiosk role or its resolved verdict — kiosk rows are not readiness-gated (RD5-02c)", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(kioskSnapshot());
    expect(useStore.getState().readiness).toBe("resolved");

    useStore.getState().onRestrictionsChanged();

    expect(useStore.getState().policy.role).toBe("customer-kiosk");
    expect(useStore.getState().readiness).toBe("resolved");
  });

  it("leaves an already-pending verdict pending — nothing to invalidate; the session still clears", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(provisionalSnapshot());
    expect(useStore.getState().readiness).toBe("pending");

    useStore.getState().onRestrictionsChanged();

    expect(useStore.getState().readiness).toBe("pending");
    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
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

  it("returns false for the bundle's own code on a provisional+LOCKED kiosk — an unsettled bundle is not final credential material (RD5-04 supersedes the Round 4 RD-02 credential corollary; R5-11)", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(provisionalLockedSnapshot());
    const policyBefore = useStore.getState().policy;
    const callsBefore = loggedCallArgs().length;

    // The policy self-describes: kiosk role (live LOCKED corroboration —
    // routing is unchanged), code still derived, restrictionsSettled false.
    expect(useStore.getState().policy.role).toBe("customer-kiosk");
    expect(useStore.getState().policy.maintenance.code).toBe(KIOSK_CODE);
    expect(useStore.getState().policy.restrictionsSettled).toBe(false);

    // KEY_RESTRICTIONS_PENDING means restrictions "may be applied in the
    // near future but are not available yet" — the bundle's code is not yet
    // the MDM-managed maintenance code, so the unlock is refused with the
    // same silent shape as every other refusal: false, nothing changes.
    expect(useStore.getState().tryUnlock(KIOSK_CODE)).toBe(false);

    expect(useStore.getState().policy).toEqual(policyBefore);
    expect(useStore.getState().maintenance).toEqual(LOCKED_SESSION);
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(false);
    // No partial state, no log — a failed attempt must not reveal whether a
    // code exists.
    expect(loggedCallArgs().length).toBe(callsBefore);
    expect(JSON.stringify(loggedCallArgs())).not.toContain(KIOSK_CODE);
    // The verdict is still pending — the credential and the readiness are
    // independent dimensions (a live LOCKED query is affirmative evidence
    // for the role; a provisional bundle is not for the verdict NOR for the
    // credential).
    expect(useStore.getState().readiness).toBe("pending");
  });

  it("unlocks on a settled re-read of the SAME bundle — the restrictions landed, so the code is now the MDM-managed credential", () => {
    const useStore = createDevicePolicyStore();
    useStore.getState().applySnapshot(provisionalLockedSnapshot());
    expect(useStore.getState().tryUnlock(KIOSK_CODE)).toBe(false);

    useStore.getState().applySnapshot(settledKioskSnapshot());

    expect(useStore.getState().policy.restrictionsSettled).toBe(true);
    expect(useStore.getState().tryUnlock(KIOSK_CODE)).toBe(true);
    expect(useStore.getState().maintenance).toEqual({
      unlocked: true,
      expiresAt: BASE_TIME + TIMEOUT_SECONDS * 1000,
    });
    expect(useStore.getState().isMaintenanceUnlocked()).toBe(true);
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
      restrictionsSettled: true,
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
    useStore.getState().applySnapshot(provisionalSnapshot());
    useStore.getState().markModuleAbsent();
    useStore.getState().setReadError("read-failed");
    useStore.getState().setReadError("module-absent");
    useStore.getState().clearReadError();
    useStore.getState().tryUnlock(KIOSK_CODE);
    useStore.getState().tryUnlock(WRONG_CODE);
    useStore.getState().tryUnlock("");
    useStore.getState().isMaintenanceUnlocked(BASE_TIME);
    useStore.getState().clearMaintenance();
    useStore.getState().onRestrictionsChanged();

    expect(storageMock.read).not.toHaveBeenCalled();
    expect(storageMock.write).not.toHaveBeenCalled();
    expect(storageMock.remove).not.toHaveBeenCalled();
    // All five exported surfaces stay untouched: constructing a storage
    // layer or triggering the namespace reset would be persistence too.
    expect(createJsonStorageMock).not.toHaveBeenCalled();
    expect(clearKisokStorageMock).not.toHaveBeenCalled();
  });
});
