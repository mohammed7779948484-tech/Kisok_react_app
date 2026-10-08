import {
  CUSTOMER_KIOSK_ROLE,
  KIOSK_DEVICE_ROLE_KEY,
} from "@/features/device-mode/model/device-mode.schema";

import { RESTRICTIONS_XML, STRINGS_XML } from "./with-managed-configuration";

// Only the schema strings are under test; the config-plugin machinery the
// module wires them into is not loaded here.
jest.mock("expo/config-plugins.js", () => ({
  __esModule: true,
  default: { AndroidConfig: {} },
  withAndroidManifest: jest.fn(),
  withDangerousMod: jest.fn(),
}));

/** The attributes of the one `<restriction>` element the schema declares. */
function restrictionAttributes(): Record<string, string> {
  const elements = RESTRICTIONS_XML.match(/<restriction\b[^>]*\/>/g) ?? [];
  expect(elements).toHaveLength(1);
  return Object.fromEntries(
    [...elements[0]!.matchAll(/android:(\w+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
  );
}

function arrayItems(name: string): string[] {
  const block = STRINGS_XML.match(
    new RegExp(`<string-array name="${name}">([\\s\\S]*?)</string-array>`),
  );
  return [...(block?.[1] ?? "").matchAll(/<item>([^<]*)<\/item>/g)].map(([, item]) => item!);
}

/**
 * The APK-side contract behind "Not Configured" in the MDM console, and the
 * three-way reading in device-mode.schema.ts: ABSENT → standard, exactly
 * customer_kiosk → customer-kiosk, any other present value → unknown.
 */
describe("kiosk_device_role managed-configuration schema", () => {
  it("declares the key the app reads, as a choice", () => {
    const attributes = restrictionAttributes();

    expect(attributes.key).toBe(KIOSK_DEVICE_ROLE_KEY);
    expect(attributes.restrictionType).toBe("choice");
  });

  it("declares no default value, so an unchanged configuration leaves the key absent", () => {
    // A default is sent as a real value when an administrator saves without
    // touching the field: customer_kiosk would make every such tablet a kiosk,
    // and anything else would read as unknown and withhold Preparation.
    expect(restrictionAttributes()).not.toHaveProperty("defaultValue");
  });

  it("offers exactly one value, the one the app treats as a kiosk — no empty or 'not configured' sentinel", () => {
    expect(arrayItems("kiosk_device_role_values")).toEqual([CUSTOMER_KIOSK_ROLE]);
    expect(arrayItems("kiosk_device_role_entries")).toEqual(["Customer kiosk tablet"]);
  });
});
