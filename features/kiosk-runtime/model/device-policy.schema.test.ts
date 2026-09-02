import { devicePolicySchema } from "./device-policy.schema";

/**
 * Colocated with the schema it protects: the test is right there when the
 * schema changes, instead of in a __tests__ bucket nobody opens.
 *
 * This schema is the boundary between an untyped native payload (the Kotlin
 * `KioskPolicy` module) and everything downstream. A malformed snapshot must
 * fail HERE — loudly — so the feature's source layer (T04) can fail closed to
 * a standard device policy instead of letting a bad shape flow on as data.
 */

const wellFormed = {
  restrictions: {
    kiosk_device_role: "customer_kiosk",
    maintenance_unlock_code: "4481",
    maintenance_unlock_timeout_seconds: 90,
    restrictions_pending: false,
  },
  lockTaskPermitted: true,
  lockTaskModeState: "locked",
} as const;

describe("device-policy schema (native snapshot contract)", () => {
  it("accepts a well-formed snapshot with every restriction value type", () => {
    const result = devicePolicySchema.safeParse(wellFormed);

    expect(result.success).toBe(true);
  });

  it("accepts an empty restrictions bundle (no DPC manages the device)", () => {
    const result = devicePolicySchema.safeParse({
      restrictions: {},
      lockTaskPermitted: false,
      lockTaskModeState: "none",
    });

    expect(result.success).toBe(true);
  });

  it("accepts every documented lockTaskModeState value", () => {
    for (const lockTaskModeState of ["none", "locked", "pinned"] as const) {
      const result = devicePolicySchema.safeParse({
        ...wellFormed,
        lockTaskModeState,
      });

      expect(result.success).toBe(true);
    }
  });

  it("accepts unknown restriction keys (the bundle is MDM-defined, not app-defined)", () => {
    const result = devicePolicySchema.safeParse({
      ...wellFormed,
      restrictions: { ...wellFormed.restrictions, some_future_mdm_key: "value" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects an undocumented lockTaskModeState", () => {
    const result = devicePolicySchema.safeParse({
      ...wellFormed,
      lockTaskModeState: "off",
    });

    expect(result.success).toBe(false);
  });

  it("rejects null restriction values (the Kotlin layer drops them; a null means the contract broke)", () => {
    const result = devicePolicySchema.safeParse({
      ...wellFormed,
      restrictions: { ...wellFormed.restrictions, kiosk_device_role: null },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a non-boolean lockTaskPermitted", () => {
    const result = devicePolicySchema.safeParse({
      ...wellFormed,
      lockTaskPermitted: "true",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a snapshot missing any required key", () => {
    const missingRestrictions = {
      lockTaskPermitted: true,
      lockTaskModeState: "locked",
    };
    const missingLockTaskPermitted = {
      restrictions: wellFormed.restrictions,
      lockTaskModeState: "locked",
    };
    const missingLockTaskModeState = {
      restrictions: wellFormed.restrictions,
      lockTaskPermitted: true,
    };

    expect(devicePolicySchema.safeParse(missingRestrictions).success).toBe(false);
    expect(devicePolicySchema.safeParse(missingLockTaskPermitted).success).toBe(false);
    expect(devicePolicySchema.safeParse(missingLockTaskModeState).success).toBe(false);
  });

  it("rejects unknown top-level keys (the native module returns exactly three fields)", () => {
    const result = devicePolicySchema.safeParse({
      ...wellFormed,
      somethingElse: true,
    });

    expect(result.success).toBe(false);
  });
});
