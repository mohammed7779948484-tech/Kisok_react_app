import { readDeviceMode, subscribeToManagedConfigurationChanges } from "./managed-configuration";

const getManagedConfiguration = jest.fn();
const addListener = jest.fn();

jest.mock("@/modules/kiosk-policy/src", () => ({
  getKioskPolicyModule: jest.fn(),
}));

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
});

describe("readDeviceMode", () => {
  it("is standard where the native module does not exist — web, jest, any non-Android platform", async () => {
    getKioskPolicyModule.mockReturnValue(null);

    await expect(readDeviceMode()).resolves.toBe("standard");
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

  it("fails closed to unknown when the native read rejects", async () => {
    installModule();
    getManagedConfiguration.mockRejectedValue(new Error("binder died"));

    await expect(readDeviceMode()).resolves.toBe("unknown");
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
