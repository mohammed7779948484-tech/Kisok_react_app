import { resetLogging, setLogSink } from "@/core/logging";

import { readDeviceMode, subscribeToManagedConfigurationChanges } from "./managed-configuration";

const getManagedConfiguration = jest.fn();
const addListener = jest.fn();

jest.mock("@/modules/kiosk-policy/src", () => ({
  getKioskPolicyModule: jest.fn(),
}));

// Mutable Platform, so the Android branch can be exercised from a suite that
// jest-expo otherwise runs as ios.
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getKioskPolicyModule } = require("@/modules/kiosk-policy/src") as {
  getKioskPolicyModule: jest.Mock;
};

function installModule() {
  const remove = jest.fn();
  addListener.mockReturnValue({ remove });
  getKioskPolicyModule.mockReturnValue({ getManagedConfiguration, addListener });
  return { remove };
}

beforeEach(() => {
  jest.clearAllMocks();
  // The fail-closed paths log by design; the suite runs with no console output.
  setLogSink(() => {});
});

afterEach(() => resetLogging());

describe("readDeviceMode", () => {
  it("is standard where the native module does not exist on a NON-Android platform", async () => {
    // Managed configurations are an Android Enterprise capability. On web and
    // in jest there is no DPC at all, so absence is the platform's answer.
    getKioskPolicyModule.mockReturnValue(null);

    await expect(readDeviceMode()).resolves.toBe("standard");
  });

  it("is unknown when the module is missing ON ANDROID — that is a broken build, not an ordinary tablet", async () => {
    // A kiosk APK whose module failed to register would otherwise enable
    // Preparation on the locked tablet. Fail closed instead.
    const { Platform } = jest.requireMock("react-native") as { Platform: { OS: string } };
    const previous = Platform.OS;
    Platform.OS = "android";
    getKioskPolicyModule.mockReturnValue(null);

    await expect(readDeviceMode()).resolves.toBe("unknown");

    Platform.OS = previous;
  });

  it("derives customer-kiosk from the MDM-pushed managed configuration", async () => {
    installModule();
    getManagedConfiguration.mockResolvedValue({
      restrictions: { kiosk_device_role: "customer_kiosk" },
    });

    await expect(readDeviceMode()).resolves.toBe("customer-kiosk");
  });

  it("derives standard from an empty managed configuration on a real device", async () => {
    installModule();
    getManagedConfiguration.mockResolvedValue({ restrictions: {} });

    await expect(readDeviceMode()).resolves.toBe("standard");
  });

  it("fails closed to unknown when the native payload does not match the contract", async () => {
    installModule();
    getManagedConfiguration.mockResolvedValue({ restrictions: { role: { nested: true } } });

    await expect(readDeviceMode()).resolves.toBe("unknown");
  });

  it("fails closed to unknown when the native read rejects, and says so", async () => {
    installModule();
    getManagedConfiguration.mockRejectedValue(new Error("binder died"));
    const logged: { level: string; message: string }[] = [];
    setLogSink((entry) => logged.push({ level: entry.level, message: entry.message }));

    await expect(readDeviceMode()).resolves.toBe("unknown");

    // A device that silently reports "unknown" with nothing in the log is
    // indistinguishable from one that was never read.
    expect(logged.some((entry) => entry.level === "error")).toBe(true);
  });
});

describe("subscribeToManagedConfigurationChanges", () => {
  it("subscribes to the documented restrictions-changed event and forwards it", () => {
    installModule();
    const onChange = jest.fn();

    subscribeToManagedConfigurationChanges(onChange);

    expect(addListener).toHaveBeenCalledWith("onManagedConfigurationChanged", expect.any(Function));
    addListener.mock.calls[0]![1]();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("removes the native subscription when unsubscribed", () => {
    const { remove } = installModule();

    subscribeToManagedConfigurationChanges(jest.fn())();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("is a no-op where the native module does not exist", () => {
    getKioskPolicyModule.mockReturnValue(null);

    expect(() => subscribeToManagedConfigurationChanges(jest.fn())()).not.toThrow();
    expect(addListener).not.toHaveBeenCalled();
  });
});
