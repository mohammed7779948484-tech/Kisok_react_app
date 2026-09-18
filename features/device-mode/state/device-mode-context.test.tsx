import { render, screen, waitFor, act } from "@testing-library/react-native";
import { Text } from "react-native";

import { DeviceModeProvider, useDeviceMode } from "./device-mode-context";

jest.mock("../native/managed-configuration", () => ({
  readDeviceMode: jest.fn(),
  subscribeToManagedConfigurationChanges: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativeSource = require("../native/managed-configuration") as {
  readDeviceMode: jest.Mock;
  subscribeToManagedConfigurationChanges: jest.Mock;
};

function Probe() {
  return <Text>{useDeviceMode()}</Text>;
}

// RNTL v14's `render` is async — it awaits the initial act().
async function renderProvider() {
  return render(
    <DeviceModeProvider>
      <Probe />
    </DeviceModeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  nativeSource.subscribeToManagedConfigurationChanges.mockReturnValue(jest.fn());
});

it("starts as unknown before the first read resolves, rather than guessing", async () => {
  let resolveRead: (mode: string) => void = () => {};
  nativeSource.readDeviceMode.mockReturnValue(
    new Promise((resolve) => {
      resolveRead = resolve as (mode: string) => void;
    }),
  );

  await renderProvider();

  expect(await screen.findByText("unknown")).toBeTruthy();

  await act(async () => {
    resolveRead("standard");
  });
  expect(screen.getByText("standard")).toBeTruthy();
});

it("publishes the mode the platform reported", async () => {
  nativeSource.readDeviceMode.mockResolvedValue("customer-kiosk");

  await renderProvider();

  expect(await screen.findByText("customer-kiosk")).toBeTruthy();
});

it("re-reads when the system reports a managed-configuration change", async () => {
  nativeSource.readDeviceMode.mockResolvedValue("standard");
  await renderProvider();
  expect(await screen.findByText("standard")).toBeTruthy();

  const notify = nativeSource.subscribeToManagedConfigurationChanges.mock
    .calls[0]![0] as () => void;
  nativeSource.readDeviceMode.mockResolvedValue("customer-kiosk");
  await act(async () => {
    notify();
  });

  await waitFor(() => expect(screen.getByText("customer-kiosk")).toBeTruthy());
});

it("unsubscribes from the native event when unmounted", async () => {
  const unsubscribe = jest.fn();
  nativeSource.subscribeToManagedConfigurationChanges.mockReturnValue(unsubscribe);
  nativeSource.readDeviceMode.mockResolvedValue("standard");

  const view = await renderProvider();
  expect(await screen.findByText("standard")).toBeTruthy();
  await view.unmount();

  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it("never lets a slow earlier read overwrite a newer one", async () => {
  // Two change broadcasts in quick succession: the FIRST read is slow and
  // resolves LAST. Publishing it would silently downgrade a kiosk tablet to
  // "standard" — the exact fail-open this feature exists to prevent.
  let resolveFirst: (mode: string) => void = () => {};
  nativeSource.readDeviceMode
    .mockReturnValueOnce(Promise.resolve("standard"))
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve as (mode: string) => void;
      }),
    )
    .mockReturnValueOnce(Promise.resolve("customer-kiosk"));

  await renderProvider();
  const notify = nativeSource.subscribeToManagedConfigurationChanges.mock
    .calls[0]![0] as () => void;

  await act(async () => {
    notify();
    notify();
  });
  await waitFor(() => expect(screen.getByText("customer-kiosk")).toBeTruthy());

  await act(async () => {
    resolveFirst("standard");
  });

  expect(screen.getByText("customer-kiosk")).toBeTruthy();
});

it("reports unknown outside the provider rather than throwing on a store tablet", async () => {
  await render(<Probe />);

  expect(screen.getByText("unknown")).toBeTruthy();
});

describe("a read that keeps failing", () => {
  it("retries, then settles on unavailable instead of holding on unknown forever", async () => {
    jest.useFakeTimers();
    nativeSource.readDeviceMode.mockResolvedValue("unknown");

    await renderProvider();
    expect(screen.getByText("unknown")).toBeTruthy();

    // Drain every scheduled retry.
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
    }

    expect(screen.getByText("unavailable")).toBeTruthy();
    expect(nativeSource.readDeviceMode.mock.calls.length).toBeGreaterThan(1);
    jest.useRealTimers();
  });

  it("recovers if a retry succeeds — no unavailable state is published", async () => {
    jest.useFakeTimers();
    nativeSource.readDeviceMode
      .mockResolvedValueOnce("unknown")
      .mockResolvedValue("customer-kiosk");

    await renderProvider();
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
    }

    expect(screen.getByText("customer-kiosk")).toBeTruthy();
    jest.useRealTimers();
  });

  it("a managed-configuration change restarts the attempts after it gave up", async () => {
    jest.useFakeTimers();
    nativeSource.readDeviceMode.mockResolvedValue("unknown");
    await renderProvider();
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
    }
    expect(screen.getByText("unavailable")).toBeTruthy();

    const notify = nativeSource.subscribeToManagedConfigurationChanges.mock
      .calls[0]![0] as () => void;
    nativeSource.readDeviceMode.mockResolvedValue("standard");
    await act(async () => {
      notify();
    });

    expect(screen.getByText("standard")).toBeTruthy();
    jest.useRealTimers();
  });
});
