import { z } from "zod";

/**
 * The native device-policy snapshot — the exact shape returned by the Expo
 * local module `modules/kiosk-policy` (`KioskPolicyModule.getDevicePolicySnapshot`,
 * see `modules/kiosk-policy/src/index.ts`).
 *
 * This is the boundary that makes an untyped native payload trustworthy:
 * everything downstream (the store, the root guard, the maintenance UI)
 * consumes a `DevicePolicySnapshot` that has already passed this schema. A
 * malformed snapshot fails validation HERE — the schema never silently
 * defaults a value — so the feature's source layer can fail closed to a
 * standard device policy instead of letting a bad shape flow on as data
 * (AC-02).
 *
 * Shape (the Kotlin module returns exactly these three fields):
 * - `restrictions`: the MDM-pushed managed app restrictions. Empty when no DPC
 *   manages the device. Keys are MDM-defined, not app-defined — any key is
 *   accepted. Values are `string | number | boolean` ONLY: the Kotlin layer
 *   drops null-valued keys (Android treats explicit null as unset), so a null
 *   or otherwise non-primitive value here means the native contract broke and
 *   the whole snapshot is rejected.
 * - `lockTaskPermitted`: DPC lock-task allowlist corroboration, read-only.
 * - `lockTaskModeState`: current lock-task state. "pinned" is user-exitable
 *   screen pinning, never an enforced kiosk.
 */

/** One MDM-pushed restriction value — primitives only, never null. */
export const restrictionValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const devicePolicySchema = z.strictObject({
  restrictions: z.record(z.string(), restrictionValueSchema),
  lockTaskPermitted: z.boolean(),
  lockTaskModeState: z.enum(["none", "locked", "pinned"]),
});

export type DevicePolicySnapshot = z.infer<typeof devicePolicySchema>;
