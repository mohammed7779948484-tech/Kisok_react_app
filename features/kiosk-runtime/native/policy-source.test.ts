import { Platform } from "react-native";

import { getKioskPolicyModule } from "@/modules/kiosk-policy";

import {
  isPolicyModuleAbsenceExpected,
  readDevicePolicySnapshot,
  subscribeToRestrictionsChanges,
} from "./policy-source";

/**
 * AC-02 — the feature's platform-IO boundary over the native KioskPolicy
 * module.
 *
 * The ONLY seam these tests mock is `@/modules/kiosk-policy` itself: the
 * source is the feature's single import of it, which is exactly what makes
 * the module controllable from tests. A fake native module drives every
 * case — absent (web/jest), present with a snapshot, present with a
 * rejection, and `addListener` wiring.
 *
 * The source layer must stay dumb transport: passthrough reads, propagation
 * of rejections, and subscription plumbing. Validation, derivation, and
 * failure policy live downstream (T02 model, T03 store, and the sync hook).
 *
 * RD5-01 (R5-01): the seam ALSO owns the platform discrimination for a null
 * module — `isPolicyModuleAbsenceExpected` — because Expo's
 * `requireOptionalNativeModule` returns one silent null for every absence
 * cause (no reason code exists), so `Platform.OS` is the only sanctioned
 * discriminator between "expected platform absence" (non-Android) and
 * "broken Android build" (fail-closed hold).
 */
jest.mock("@/modules/kiosk-policy", () => ({
  getKioskPolicyModule: jest.fn(),
}));

const getKioskPolicyModuleMock = getKioskPolicyModule as unknown as jest.Mock;

/** The fake native module plus everything it captured. */
type FakeNativeModule = {
  getDevicePolicySnapshot: jest.Mock;
  addListener: jest.Mock;
  /** Listeners the module received, index-aligned with `subscriptions`. */
  listeners: (() => void)[];
  /** Subscriptions the module handed back, index-aligned with `listeners`. */
  subscriptions: { remove: jest.Mock }[];
};

/** Install a present, controllable native module. */
function installFakeNativeModule(): FakeNativeModule {
  const listeners: (() => void)[] = [];
  const subscriptions: { remove: jest.Mock }[] = [];

  const getDevicePolicySnapshot = jest.fn();
  const addListener = jest.fn((_eventName: string, listener: () => void) => {
    const subscription = { remove: jest.fn() };
    listeners.push(listener);
    subscriptions.push(subscription);
    return subscription;
  });

  getKioskPolicyModuleMock.mockReturnValue({ getDevicePolicySnapshot, addListener });
  return { getDevicePolicySnapshot, addListener, listeners, subscriptions };
}

/** Install module ABSENCE — what web, jest, and non-Android platforms see. */
function installNativeModuleAbsent() {
  getKioskPolicyModuleMock.mockReturnValue(null);
}

/**
 * Platform.OS mocking mechanism (RD5-01 — the R5-A2 "one tricky bit"):
 * jest-expo's default platform is iOS, and react-native's `Platform.OS` is a
 * plain WRITABLE data property under the preset (no getter), so tests assign
 * it directly and restore the original afterwards. The seam imports
 * `Platform` from the same "react-native" module instance this file mutates,
 * so the assignment reaches the code under test. Both the ios-default and
 * the android-mocked variants are pinned (plan Round 5 risk row).
 */
const ORIGINAL_PLATFORM_OS = Platform.OS;

/** Point the platform at `os` for the current test (restored in afterEach). */
function setPlatformOS(os: string): void {
  (Platform as { OS: string }).OS = os;
}

afterEach(() => {
  setPlatformOS(ORIGINAL_PLATFORM_OS);
});

const NATIVE_SNAPSHOT = {
  restrictions: { kiosk_device_role: "customer_kiosk" },
  lockTaskPermitted: true,
  lockTaskModeState: "locked",
} as const;

describe("readDevicePolicySnapshot", () => {
  it("passes the module's snapshot through when the native module is available", async () => {
    const fake = installFakeNativeModule();
    fake.getDevicePolicySnapshot.mockResolvedValue(NATIVE_SNAPSHOT);

    await expect(readDevicePolicySnapshot()).resolves.toBe(NATIVE_SNAPSHOT);
    expect(fake.getDevicePolicySnapshot).toHaveBeenCalledTimes(1);
  });

  it("resolves null when the native module is unavailable (web, jest, non-Android)", async () => {
    installNativeModuleAbsent();

    await expect(readDevicePolicySnapshot()).resolves.toBeNull();
  });

  it("propagates a read rejection to the caller — the source never decides failure behavior", async () => {
    const fake = installFakeNativeModule();
    const failure = new Error("native restrictions read failed");
    fake.getDevicePolicySnapshot.mockRejectedValue(failure);

    await expect(readDevicePolicySnapshot()).rejects.toBe(failure);
  });
});

describe("isPolicyModuleAbsenceExpected (RD5-01 — the platform discriminator)", () => {
  // The query is platform-derived ONLY — it never consults the module, so
  // these rows deliberately leave the module mock alone. It answers the
  // question a NULL read raises: "if the module is missing here, is that the
  // expected platform verdict, or a broken Android build?"

  it("reports absence as EXPECTED on the jest-default platform — jest-expo runs this suite as iOS, so the suite itself can never hold at the startup target", () => {
    // No mutation: this is exactly the platform every other suite runs as.
    expect(isPolicyModuleAbsenceExpected()).toBe(true);
  });

  it("reports absence as EXPECTED on ios — no native kiosk build ever targets it", () => {
    setPlatformOS("ios");

    expect(isPolicyModuleAbsenceExpected()).toBe(true);
  });

  it("reports absence as EXPECTED on web (react-native-web) — the module cannot exist there", () => {
    setPlatformOS("web");

    expect(isPolicyModuleAbsenceExpected()).toBe(true);
  });

  it("reports absence as UNEXPECTED on android — a kiosk build MUST carry the module; its absence is a broken build (autolinking miss, broken dev client, Expo Go, JSI failure), never a verdict", () => {
    setPlatformOS("android");

    expect(isPolicyModuleAbsenceExpected()).toBe(false);
  });

  it("keeps the READ dumb transport on android with the module absent: null still resolves, and the discrimination stays in the query", async () => {
    setPlatformOS("android");
    installNativeModuleAbsent();

    await expect(readDevicePolicySnapshot()).resolves.toBeNull();
    expect(isPolicyModuleAbsenceExpected()).toBe(false);
  });
});

describe("subscribeToRestrictionsChanges", () => {
  it("subscribes via onRestrictionsChanged, fires the listener when the native event fires, and unsubscribes on demand", () => {
    const fake = installFakeNativeModule();
    const listener = jest.fn();

    const unsubscribe = subscribeToRestrictionsChanges(listener);

    expect(fake.addListener).toHaveBeenCalledTimes(1);
    expect(fake.addListener).toHaveBeenCalledWith("onRestrictionsChanged", listener);

    // The native side fires a restrictions-changed event.
    const nativeListener = fake.listeners[0];
    if (!nativeListener) throw new Error("the module never received a listener");
    nativeListener();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    const nativeSubscription = fake.subscriptions[0];
    if (!nativeSubscription) throw new Error("the module never created a subscription");
    expect(nativeSubscription.remove).toHaveBeenCalledTimes(1);
  });

  it("returns a no-op unsubscribe when the native module is unavailable — nothing to observe", () => {
    installNativeModuleAbsent();
    const listener = jest.fn();

    const unsubscribe = subscribeToRestrictionsChanges(listener);

    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});
