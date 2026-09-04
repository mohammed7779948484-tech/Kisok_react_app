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
 * Four things live here, and none may ever leave memory:
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
 * - `readError` — UI-ONLY (RD5-03/R5-08): WHY the policy read is failing
 *   while NO verdict exists. The resolver NEVER consumes it — error ≡
 *   pending, so the startup hold is fail-closed by construction — only the
 *   kiosk-runtime startup gate reads it, to surface a MANUAL retry. It is
 *   set ONLY while `readiness` is `"pending"` (a first-read rejection; the
 *   R5-01 unexpected Android module absence), cleared by any successful
 *   read (`applySnapshot`), `markModuleAbsent`, and the retry dispatch
 *   (`clearReadError`). A failed re-read while a verdict is resolved never
 *   sets it: last-known-good stands and nobody is held. Like `maintenance`,
 *   a UI-owned field the policy machinery ignores — `PolicyReadiness` stays
 *   binary and the resolver table stays untouched.
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

/**
 * WHY a pending policy read is failing (RD5-03 / R5-08). A UI-facing reason
 * CODE, never a message: the gate owns the copy, and nothing here carries
 * native detail (the maintenance code travels inside the restrictions —
 * AC-05 — so a rejection's actual reason must not travel anywhere).
 */
export type PolicyReadErrorReason = "module-absent" | "read-failed";

/** The UI-only pending-failure record. `{ reason }` and nothing else. */
export type PolicyReadError = { reason: PolicyReadErrorReason };

export type DevicePolicyState = {
  /** The app-wide device policy (AC-02). */
  policy: DevicePolicy;
  /**
   * Whether the platform has produced a settled policy verdict (RD-01).
   * `"pending"` initially — see the store doc comment for the transitions.
   * Consumed by `useRootTarget` as the resolver's readiness input.
   */
  readiness: PolicyReadiness;
  /**
   * UI-only (RD5-03): why the read is failing while NO verdict exists — see
   * the store doc comment. Never consumed by the resolver or any policy
   * transition; the startup gate is its only reader. Memory only.
   */
  readError: PolicyReadError | null;
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
   * Record WHY the policy read is failing while NO verdict exists (RD5-03).
   * Called by the sync hook on a current (non-superseded) read rejection and
   * on Android's unexpected module absence. A NO-OP while a verdict is
   * resolved — "readError is set ONLY while pending" is a store invariant,
   * not a caller promise: the guard enforces readiness-pending and nothing
   * more, which is enough because the field's only reader is the startup
   * gate, mounted only in the root startup case — anywhere else the surface
   * is rendered by nothing and thus invisible. Never logged: the reason is a
   * code, but the discipline (AC-05) is that nothing from a failed read
   * travels anywhere.
   */
  setReadError(reason: PolicyReadErrorReason): void;
  /**
   * Clear readError. The retry dispatch does this — retry → loading →
   * error-again-or-resolved — so the gate drops the error surface the moment
   * a new read is on its way, not when the read completes.
   */
  clearReadError(): void;
  /**
   * Attempt a maintenance unlock. Returns true ONLY when the current policy
   * is a customer kiosk with SETTLED restrictions (RD5-04 / R5-11: a
   * provisional bundle's code is not final enforced credential material —
   * KEY_RESTRICTIONS_PENDING — so an unsettled policy exposes no usable
   * credential, mirroring the standard-device gate), the derived code is
   * non-null, and `code` equals it. On failure: false, and NOTHING changes —
   * no partial state, no log (a failed attempt must not even reveal whether
   * a code exists).
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
    readError: null,
    maintenance: LOCKED_MAINTENANCE,

    applySnapshot(snapshot: unknown) {
      const result = devicePolicySchema.safeParse(snapshot);

      if (result.success) {
        set({
          policy: deriveDevicePolicy(result.data),
          maintenance: LOCKED_MAINTENANCE,
          readiness: isProvisionalSnapshot(result.data) ? "pending" : "resolved",
          // A successful read is evidence the machinery works: whatever
          // pending-failure was surfaced is gone (RD5-03). The provisional
          // row keeps readiness pending — and readError null: a COMPLETED
          // provisional read is not a failure, it is an undetermined verdict.
          readError: null,
        });
        return;
      }

      // No payload in this warn, ever: the maintenance code travels inside
      // the restrictions, so snapshot values must not reach the log (AC-05).
      log.warn("Device-policy snapshot failed schema validation; failing closed to standard");
      // readError is deliberately UNTOUCHED here: a schema-rejected read is
      // neither a successful read (nothing to clear) nor a rejection (nothing
      // to set). If a failure was already surfaced, it stays surfaced — the
      // malformed outcome simply fails closed into the same pending hold.
      set({ policy: FAIL_CLOSED_POLICY, maintenance: LOCKED_MAINTENANCE, readiness: "pending" });
    },

    markModuleAbsent() {
      set({
        readiness: "resolved",
        // Absence is the platform verdict, not a failure — whatever error a
        // previous state surfaced is gone (RD5-03 clear-list).
        readError: null,
      });
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
      // readError is deliberately untouched here: the event dispatches an
      // async re-read, and whether THAT fails decides what is surfaced —
      // the event itself is not a read outcome (RD5-03).
    },

    setReadError(reason: PolicyReadErrorReason) {
      // The store owns the invariant: the error surface may exist ONLY while
      // a verdict is missing — the guard is readiness-only, it does not check
      // where the user is. That is sufficient because the surface's only
      // reader is the startup gate, which mounts only in the root startup
      // case: anywhere else the field may be set but is rendered by nothing.
      // While a verdict is resolved the last-known-good stands — nothing to
      // surface.
      if (get().readiness !== "pending") {
        return;
      }

      set({ readError: { reason } });
    },

    clearReadError() {
      set({ readError: null });
    },

    tryUnlock(code: string) {
      const { policy } = get();

      // Standard devices (and code-less kiosks) expose no credential at all.
      if (policy.role !== "customer-kiosk" || policy.maintenance.code === null) {
        return false;
      }

      // An UNSETTLED restrictions bundle is not final credential material
      // either (RD5-04 / R5-11, superseding the Round 4 RD-02 credential
      // corollary): KEY_RESTRICTIONS_PENDING means restrictions "may be
      // applied in the near future but are not available yet", so the code
      // the bundle carries is not yet the MDM-managed maintenance code.
      // Same silent refusal shape as every other gate: false, NOTHING
      // changes — a failed attempt must not reveal whether a code exists.
      if (!policy.restrictionsSettled) {
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
