import {
  deriveDeviceMode,
  deviceRoleAccess,
  managedConfigurationSchema,
} from "./device-mode.schema";

describe("managedConfigurationSchema", () => {
  it("accepts the primitive restriction values Android can deliver", () => {
    const parsed = managedConfigurationSchema.parse({
      restrictions: { kiosk_device_role: "customer_kiosk", some_number: 3, some_flag: true },
    });

    expect(parsed.restrictions.kiosk_device_role).toBe("customer_kiosk");
  });

  it("accepts an empty bundle — an unmanaged device has no restrictions", () => {
    expect(managedConfigurationSchema.parse({ restrictions: {} }).restrictions).toEqual({});
  });

  it("rejects a payload whose restriction value is not a primitive", () => {
    expect(() =>
      managedConfigurationSchema.parse({ restrictions: { role: { nested: 1 } } }),
    ).toThrow();
  });

  it("rejects a payload with no restrictions bundle at all", () => {
    expect(() => managedConfigurationSchema.parse({})).toThrow();
  });
});

describe("deriveDeviceMode", () => {
  it("is customer-kiosk only for the exact documented value", () => {
    expect(deriveDeviceMode({ kiosk_device_role: "customer_kiosk" })).toBe("customer-kiosk");
  });

  it("is standard when no managed configuration is present", () => {
    expect(deriveDeviceMode({})).toBe("standard");
  });

  // A present but unrecognised value describes an unknown configuration.
  // Only absence means "standard"; classification never determines access.
  it("is unknown for any other PRESENT value of the key, including a wrong type", () => {
    expect(deriveDeviceMode({ kiosk_device_role: "employee" })).toBe("unknown");
    expect(deriveDeviceMode({ kiosk_device_role: "CUSTOMER_KIOSK" })).toBe("unknown");
    expect(deriveDeviceMode({ kiosk_device_role: "customer-kiosk" })).toBe("unknown");
    expect(deriveDeviceMode({ kiosk_device_role: true })).toBe("unknown");
    expect(deriveDeviceMode({ kiosk_device_role: 1 })).toBe("unknown");
  });

  it("is still standard when the key is absent but other restrictions exist", () => {
    expect(deriveDeviceMode({ some_other_policy: "x" })).toBe("standard");
  });

  // The native layer emits "" for a key the DPC set to null (some consoles
  // clear a value that way) rather than dropping it, precisely so this derives
  // "present but unrecognised" instead of looking like an unmanaged device.
  it("is unknown for a cleared role, which the native layer emits as an empty string", () => {
    expect(deriveDeviceMode({ kiosk_device_role: "" })).toBe("unknown");
  });

  it("is unknown while Android reports restrictions_pending, even with a role already set", () => {
    expect(deriveDeviceMode({ restrictions_pending: true })).toBe("unknown");
    expect(
      deriveDeviceMode({ restrictions_pending: true, kiosk_device_role: "customer_kiosk" }),
    ).toBe("unknown");
  });

  it("treats an explicit restrictions_pending: false as settled", () => {
    expect(deriveDeviceMode({ restrictions_pending: false })).toBe("standard");
  });

  // Same reasoning as the role key: only a DPC sets this at all, so a value we
  // cannot interpret means a managed device we cannot read — not a settled one.
  it("is unknown for a PRESENT restrictions_pending that is not a boolean", () => {
    expect(deriveDeviceMode({ restrictions_pending: "true" })).toBe("unknown");
    expect(deriveDeviceMode({ restrictions_pending: 1 })).toBe("unknown");
    expect(deriveDeviceMode({ restrictions_pending: "" })).toBe("unknown");
  });
});

const deviceModes = ["standard", "customer-kiosk", "unknown", "unavailable"] as const;

describe.each(["customer", "preparation"] as const)("deviceRoleAccess — %s", (role) => {
  it.each(deviceModes)("allows the account's experience when device mode is %s", (mode) => {
    expect(deviceRoleAccess(role, mode)).toBe("allowed");
  });
});

describe("deviceRoleAccess — other roles", () => {
  it.each(deviceModes)("blocks admin when device mode is %s", (mode) => {
    expect(deviceRoleAccess("admin", mode)).toBe("blocked");
  });
});
