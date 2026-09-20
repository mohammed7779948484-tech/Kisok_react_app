import AsyncStorage from "@react-native-async-storage/async-storage";

import { renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

import { LAST_SEEN_RELEASE_KEY } from "../model/release-notes";

import { WhatsNewGate } from "./whats-new-gate";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.1.0", android: { versionCode: 4 } } },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Constants = require("expo-constants").default as { expoConfig: unknown };

const CURRENT = "1.1.0+4";

beforeEach(async () => {
  Constants.expoConfig = { version: "1.1.0", android: { versionCode: 4 } };
  await AsyncStorage.clear();
});

describe("WhatsNewGate", () => {
  it("says nothing on a FIRST install, and records the release", async () => {
    // Nothing was updated — the tablet was just set up. Claiming an update
    // would be a lie, and it would happen on every new tablet.
    await renderWithProviders(<WhatsNewGate />);

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(LAST_SEEN_RELEASE_KEY)).toBe(CURRENT),
    );
    expect(screen.queryByText("KISOK has been updated")).not.toBeOnTheScreen();
  });

  it("announces once when the installed release differs from the stored one", async () => {
    await AsyncStorage.setItem(LAST_SEEN_RELEASE_KEY, "1.0.0+1");

    await renderWithProviders(<WhatsNewGate />);

    expect(await screen.findByText("KISOK has been updated")).toBeOnTheScreen();
    expect(screen.getByText("Version 1.1.0")).toBeOnTheScreen();
  });

  it("persists the new release only when the customer taps Continue", async () => {
    await AsyncStorage.setItem(LAST_SEEN_RELEASE_KEY, "1.0.0+1");
    await renderWithProviders(<WhatsNewGate />);
    await screen.findByText("KISOK has been updated");
    // Still the OLD token while the dialog is open: dismissal is the ack.
    expect(await AsyncStorage.getItem(LAST_SEEN_RELEASE_KEY)).toBe("1.0.0+1");

    await userEvent.press(screen.getByText("Continue"));

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(LAST_SEEN_RELEASE_KEY)).toBe(CURRENT),
    );
  });

  it("does not reappear on a restart after Continue", async () => {
    await AsyncStorage.setItem(LAST_SEEN_RELEASE_KEY, CURRENT);

    await renderWithProviders(<WhatsNewGate />);

    await waitFor(() => expect(screen.queryByText("Continue")).not.toBeOnTheScreen());
    expect(screen.queryByText("KISOK has been updated")).not.toBeOnTheScreen();
  });

  it("stays silent and never blocks startup when the store cannot be READ", async () => {
    // An unreadable store is not a first install and not an update. Guessing
    // either way would show the dialog on a tablet that was never updated.
    jest
      .spyOn(AsyncStorage, "getItem")
      .mockImplementationOnce(() => Promise.reject(new Error("SecurityException")));

    await renderWithProviders(<WhatsNewGate />);

    await waitFor(() => expect(screen.queryByText("KISOK has been updated")).not.toBeOnTheScreen());
  });

  it("still dismisses for this session when the store cannot be WRITTEN", async () => {
    // The customer must never be trapped behind the dialog because the tablet
    // ran out of disk. It will reappear after a restart; that is the nuisance
    // we accept over a stuck kiosk.
    await AsyncStorage.setItem(LAST_SEEN_RELEASE_KEY, "1.0.0+1");
    jest
      .spyOn(AsyncStorage, "setItem")
      .mockImplementationOnce(() => Promise.reject(new Error("disk full")));
    await renderWithProviders(<WhatsNewGate />);
    await screen.findByText("KISOK has been updated");

    await userEvent.press(screen.getByText("Continue"));

    await waitFor(() => expect(screen.queryByText("KISOK has been updated")).not.toBeOnTheScreen());
  });

  it("renders nothing when the running build has no readable version identity", async () => {
    Constants.expoConfig = {};
    await AsyncStorage.setItem(LAST_SEEN_RELEASE_KEY, "1.0.0+1");

    await renderWithProviders(<WhatsNewGate />);

    await waitFor(() => expect(screen.queryByText("KISOK has been updated")).not.toBeOnTheScreen());
  });

  it("falls back to a generic line when a release shipped without notes", async () => {
    await AsyncStorage.setItem(LAST_SEEN_RELEASE_KEY, "1.0.0+1");

    await renderWithProviders(<WhatsNewGate />);
    await screen.findByText("KISOK has been updated");

    expect(screen.getByText("KISOK has been updated to version 1.1.0.")).toBeOnTheScreen();
  });
});

describe("where the gate is mounted", () => {
  // Structural, because the mount POINT is the requirement: this is a customer
  // message, and the layouts are what decide who sees it. Rendering the
  // preparation stack would prove less and need the whole provider tree.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require("node:path") as typeof import("node:path");
  const appDir = join(__dirname, "..", "..", "..", "app");

  it("is mounted in the CUSTOMER layout", () => {
    const customer = readFileSync(join(appDir, "(customer)", "_layout.tsx"), "utf8");

    expect(customer).toContain("<WhatsNewGate />");
  });

  it("is NOT mounted in the preparation layout", () => {
    const preparation = readFileSync(join(appDir, "(preparation)", "_layout.tsx"), "utf8");

    expect(preparation).not.toContain("WhatsNewGate");
    expect(preparation).not.toContain("release-notes");
  });

  it("is NOT mounted at the root, in front of sign-in or the mismatch screen", () => {
    // At the root it would appear before auth resolves, and on the
    // device-mismatch screen an employee would be told about a customer app.
    const root = readFileSync(join(appDir, "_layout.tsx"), "utf8");

    expect(root).not.toContain("WhatsNewGate");
    expect(root).not.toContain("release-notes");
  });
});
