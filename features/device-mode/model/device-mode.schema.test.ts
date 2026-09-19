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

  // BEHAVIOUR CHANGE. These rows previously asserted "standard", which was a
  // fail-OPEN: a present-but-unrecognised value only ever comes from an MDM
  // that manages this device, and calling that an ordinary employee tablet is
  // the one wrong answer. An ordinary tablet has NO managed configuration at
  // all, so absence — not a wrong value — is what means "standard".
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
