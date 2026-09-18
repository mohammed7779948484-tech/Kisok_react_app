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

  it("is standard for any other value of the key", () => {
    expect(deriveDeviceMode({ kiosk_device_role: "employee" })).toBe("standard");
    expect(deriveDeviceMode({ kiosk_device_role: "CUSTOMER_KIOSK" })).toBe("standard");
    expect(deriveDeviceMode({ kiosk_device_role: true })).toBe("standard");
  });

  it("is unknown while Android reports restrictions_pending, even with a role already set", () => {
    expect(deriveDeviceMode({ restrictions_pending: true })).toBe("unknown");
    expect(
      deriveDeviceMode({ restrictions_pending: true, kiosk_device_role: "customer_kiosk" }),
    ).toBe("unknown");
  });

  it("ignores a restrictions_pending that is not true", () => {
    expect(deriveDeviceMode({ restrictions_pending: false })).toBe("standard");
  });
});

describe("deviceRoleAccess", () => {
  it("always allows a customer profile, on every device mode", () => {
    expect(deviceRoleAccess("customer", "standard")).toBe("allowed");
    expect(deviceRoleAccess("customer", "customer-kiosk")).toBe("allowed");
    expect(deviceRoleAccess("customer", "unknown")).toBe("allowed");
  });

  it("allows preparation on an ordinary device — today's routing is unchanged", () => {
    expect(deviceRoleAccess("preparation", "standard")).toBe("allowed");
  });

  it("blocks preparation on a customer kiosk device", () => {
    expect(deviceRoleAccess("preparation", "customer-kiosk")).toBe("blocked");
  });

  it("holds preparation while the device mode is not known yet", () => {
    expect(deviceRoleAccess("preparation", "unknown")).toBe("pending");
  });

  it("blocks any role with no tablet experience, whatever the device", () => {
    expect(deviceRoleAccess("admin", "standard")).toBe("blocked");
  });
});

describe("deviceRoleAccess — a device whose configuration could not be read", () => {
  it("blocks preparation instead of holding it forever", () => {
    expect(deviceRoleAccess("preparation", "unavailable")).toBe("blocked");
  });

  it("still lets a customer use the tablet — the customer experience needs no device context", () => {
    expect(deviceRoleAccess("customer", "unavailable")).toBe("allowed");
  });
});
