import { create } from "zustand";

import { createLogger } from "@/core/logging";

import { deriveDevicePolicy, type DevicePolicy } from "../model/derive-device-policy";
import { devicePolicySchema } from "../model/device-policy.schema";

const log = createLogger("kiosk-runtime.devicePolicy");

/**
 * The app-wide, EPHEMERAL device-policy store (AC-02, AC-05).
 *
 * Two things live here, and neither may ever leave memory:
 *
 * - `policy` — the derived device policy, applied from a validated native
 *   snapshot. It starts at the fail-closed standard default: until something
 *   has PROVEN this device is a customer kiosk, it is a standard device.
 * - `maintenance` — the maintenance unlock session. The MDM-managed code and
 *   the unlock state exist in memory only: never persisted, never logged as
 *   values, cleared on timeout, background, and any snapshot application.
 *
 * This is a deliberate adaptation of the generated store template. The
 * template is persistence-oriented (hydrate/clear/persist through
 * `@/core/storage`) because that is the harder case to get right; this
 * feature's state is ephemeral by plan (plan.md Design decision 4 — the
 * maintenance credential must never be persisted, AC-05), so the storage
 * machinery is replaced with plain in-memory state and the store imports no
 * storage layer at all. Non-persistent stores are a documented legitimate
 * case (docs/state-management.md).
 */

/** The maintenance unlock session. Ephemeral: memory only, never persisted. */
export type MaintenanceSession = {
  /** Whether the session is currently unlocked. */
  unlocked: boolean;
  /** Epoch ms when the unlock expires; null while locked. */
  expiresAt: number | null;
};

export type DevicePolicyState = {
  /** The app-wide device policy (AC-02). */
  policy: DevicePolicy;
  /** The ephemeral maintenance session (AC-05). */
  maintenance: MaintenanceSession;
  /**
   * Validate a native device-policy snapshot and apply the derived policy.
   * On success the maintenance session is cleared (unconditionally — a role
   * change invalidates any unlock, and a re-read of a managed configuration
   * is exactly the moment to re-lock). On a schema failure the store fails
   * closed: the policy reverts to the standard default and the session is
   * cleared — an invalid snapshot carries no trustworthy affirmative signal.
   */
  applySnapshot(snapshot: unknown): void;
  /**
   * Attempt a maintenance unlock. Returns true ONLY when the current policy
   * is a customer kiosk, the derived code is non-null, and `code` equals it.
   * On failure: false, and NOTHING changes — no partial state, no log (a
   * failed attempt must not even reveal whether a code exists).
   */
  tryUnlock(code: string): boolean;
  /**
   * Whether the maintenance session is currently unlocked and unexpired.
   * `now` is injectable so the UI can ask about any instant; the expiry
   * timer itself lives in the maintenance overlay (T06).
   */
  isMaintenanceUnlocked(now?: number): boolean;
  /** Lock the maintenance session immediately. */
  clearMaintenance(): void;
};

/**
 * The fail-closed default policy, DERIVED once from the empty snapshot the
 * model already fails closed on — no restrictions and no allowlist
 * corroboration yield a standard role, a null code, and the model's default
 * timeout. Deriving it (rather than hand-copying a literal) means the store
 * and the model can never disagree about what the default is.
 */
const failClosedPolicy = deriveDevicePolicy({
  restrictions: {},
  lockTaskPermitted: false,
  lockTaskModeState: "none",
});

/**
 * Frozen, nested included: one object is shared by the initial state and
 * every fail-closed reset, so an in-place mutation must fail fast instead
 * of silently corrupting every future default. Policies derived per
 * snapshot in `applySnapshot` are recreated on each derivation and need no
 * freezing.
 */
const FAIL_CLOSED_POLICY: DevicePolicy = Object.freeze({
  ...failClosedPolicy,
  maintenance: Object.freeze(failClosedPolicy.maintenance),
});

/**
 * The locked session. Frozen for the same reason: one object is shared by
 * every lock transition, so an in-place mutation must fail fast instead of
 * corrupting every future "locked" value.
 */
const LOCKED_MAINTENANCE: MaintenanceSession = Object.freeze({ unlocked: false, expiresAt: null });

/**
 * A factory, not a bare `create(...)`, so a test gets a fresh store instance
 * instead of the module singleton (same shape as the generated template,
 * minus the storage backend this store deliberately does not have). Real
 * code uses `useDevicePolicyStore` below.
 */
export function createDevicePolicyStore() {
  return create<DevicePolicyState>((set, get) => ({
    policy: FAIL_CLOSED_POLICY,
    maintenance: LOCKED_MAINTENANCE,

    applySnapshot(snapshot: unknown) {
      const result = devicePolicySchema.safeParse(snapshot);

      if (result.success) {
        set({ policy: deriveDevicePolicy(result.data), maintenance: LOCKED_MAINTENANCE });
        return;
      }

      // No payload in this warn, ever: the maintenance code travels inside
      // the restrictions, so snapshot values must not reach the log (AC-05).
      log.warn("Device-policy snapshot failed schema validation; failing closed to standard");
      set({ policy: FAIL_CLOSED_POLICY, maintenance: LOCKED_MAINTENANCE });
    },

    tryUnlock(code: string) {
      const { policy } = get();

      // Standard devices (and code-less kiosks) expose no credential at all.
      if (policy.role !== "customer-kiosk" || policy.maintenance.code === null) {
        return false;
      }

      // A plain equality check is deliberate: this is a store-staff
      // maintenance code, not a cryptographic secret.
      if (code !== policy.maintenance.code) {
        return false;
      }

      set({
        maintenance: {
          unlocked: true,
          expiresAt: Date.now() + policy.maintenance.timeoutSeconds * 1000,
        },
      });
      return true;
    },

    isMaintenanceUnlocked(now: number = Date.now()) {
      const { maintenance } = get();
      return maintenance.unlocked && maintenance.expiresAt !== null && now < maintenance.expiresAt;
    },

    clearMaintenance() {
      set({ maintenance: LOCKED_MAINTENANCE });
    },
  }));
}

export const useDevicePolicyStore = createDevicePolicyStore();
