import { create } from "zustand";

import { createLogger } from "@/core/logging";

import {
  deriveDevicePolicy,
  isProvisionalSnapshot,
  type DevicePolicy,
} from "../model/derive-device-policy";
import { devicePolicySchema } from "../model/device-policy.schema";
import type { PolicyReadiness } from "../model/root-guard";

const log = createLogger("kiosk-runtime.devicePolicy");

/**
 * The app-wide, EPHEMERAL device-policy store (AC-02, AC-05).
 *
 * Three things live here, and none may ever leave memory:
 *
 * - `policy` — the derived device policy, applied from a validated native
 *   snapshot. It starts at the fail-closed standard default: until something
 *   has PROVEN this device is a customer kiosk, it is a standard device.
 * - `readiness` — whether the platform has produced a settled policy verdict
 *   (RD-01/IR-01). It starts `"pending"` and resolves ONLY on affirmative
 *   evidence: a schema-valid, NON-provisional snapshot, or a module-absent
 *   null read (`markModuleAbsent`, driven by the sync hook — on web/jest the
 *   standard default IS the platform verdict, so those platforms can never
 *   hang at the startup hold). A provisional snapshot and a schema-rejected
 *   snapshot hold it `"pending"`; a read REJECTION leaves it untouched (a
 *   failed read carries no evidence — it can neither create nor destroy a
 *   verdict). The ONE thing that can destroy a stale verdict is the
 *   restrictions-change EVENT (`onRestrictionsChanged`, RD5-02): the system
 *   broadcasts it AFTER persisting the new restrictions, so a resolved
 *   standard verdict is evidence about a superseded world and is invalidated
 *   synchronously — the EVENT, not a failed read, destroys it. A read
 *   failure with no event in play (e.g. an AppState-active re-read) still
 *   keeps last-known-good, verdict included. The verdict lives at the store
 *   ROOT, not nested inside `policy`: it is evidence about the READ, not a
 *   property of the derived policy, and `useRootTarget` consumes it as a
 *   second resolver input.
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
  /**
   * Whether the platform has produced a settled policy verdict (RD-01).
   * `"pending"` initially — see the store doc comment for the transitions.
   * Consumed by `useRootTarget` as the resolver's readiness input.
   */
  readiness: PolicyReadiness;
  /** The ephemeral maintenance session (AC-05). */
  maintenance: MaintenanceSession;
  /**
   * Validate a native device-policy snapshot and apply the derived policy.
   * On success the maintenance session is cleared (unconditionally — a role
   * change invalidates any unlock, and a re-read of a managed configuration
   * is exactly the moment to re-lock) and readiness resolves — UNLESS the
   * snapshot is provisional (`restrictions_pending` truthy), in which case
   * the derived policy is applied with today's derivation semantics but
   * readiness stays/becomes `"pending"` (the final state is undetermined).
   * On a schema failure the store fails closed: the policy reverts to the
   * standard default, the session is cleared, and readiness goes to
   * `"pending"` — an invalid snapshot carries no trustworthy affirmative
   * signal.
   */
  applySnapshot(snapshot: unknown): void;
  /**
   * Resolve readiness because the platform layer reports NO native module
   * (web, jest, non-Android). Called by the sync hook when a read resolves
   * null: the fail-closed standard default IS the platform verdict there, so
   * those platforms must never hold at the startup target. Touches nothing
   * else — module absence is not a snapshot application, so no policy change
   * and no session clear. Idempotent.
   */
  markModuleAbsent(): void;
  /**
   * Synchronous invalidation on a restrictions-change event (RD5-02 / R5-02).
   * Called by the sync hook's event listener BEFORE it dispatches the async
   * re-read — `ACTION_APPLICATION_RESTRICTIONS_CHANGED` is sent AFTER the new
   * restrictions are persisted, so any existing verdict is evidence about a
   * superseded world:
   * (a) a resolved STANDARD verdict becomes `"pending"` — a failed or slow
   *     post-event re-read then leaves the fail-closed startup hold, never
   *     a stale permissive verdict;
   * (b) the maintenance session is ALWAYS cleared — the event invalidated
   *     the credential basis (the restrictions that carry the code)
   *     regardless of what the re-read later finds;
   * (c) a customer-kiosk role is NEVER reverted — kiosk/mismatch routing is
   *     not readiness-gated, so reverting buys no protection for the
   *     protected action and costs a running kiosk its availability.
   * Idempotent, and safe at every readiness/role combination.
   */
  onRestrictionsChanged(): void;
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
    readiness: "pending",
    maintenance: LOCKED_MAINTENANCE,

    applySnapshot(snapshot: unknown) {
      const result = devicePolicySchema.safeParse(snapshot);

      if (result.success) {
        set({
          policy: deriveDevicePolicy(result.data),
          maintenance: LOCKED_MAINTENANCE,
          readiness: isProvisionalSnapshot(result.data) ? "pending" : "resolved",
        });
        return;
      }

      // No payload in this warn, ever: the maintenance code travels inside
      // the restrictions, so snapshot values must not reach the log (AC-05).
      log.warn("Device-policy snapshot failed schema validation; failing closed to standard");
      set({ policy: FAIL_CLOSED_POLICY, maintenance: LOCKED_MAINTENANCE, readiness: "pending" });
    },

    markModuleAbsent() {
      set({ readiness: "resolved" });
    },

    onRestrictionsChanged() {
      const { readiness, policy } = get();

      // (a) Destroy a stale PERMISSIVE verdict: the event means the
      // restrictions changed under it (the broadcast follows the persist),
      // and the async re-read dispatched next may fail or take seconds — the
      // old verdict must not survive that window. Kiosk rows are exempt
      // ((c) below): their routing is not readiness-gated.
      const invalidateVerdict = readiness === "resolved" && policy.role === "standard";

      // (b) The maintenance session clears unconditionally, in the same
      // atomic transition: the credential basis itself changed.
      set({
        ...(invalidateVerdict ? { readiness: "pending" } : {}),
        maintenance: LOCKED_MAINTENANCE,
      });
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
