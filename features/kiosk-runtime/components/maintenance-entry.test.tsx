import { resetLogging, setLogSink, type LogRecord } from "@/core/logging";
import { clearKisokStorage, createJsonStorage, storage } from "@/core/storage";
import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { MaintenanceEntry } from "./maintenance-entry";

/**
 * lucide-react-native ships an ESM build the repo's jest config does not
 * transform (this entry is the first TESTED lucide consumer — the jest-config
 * fix belongs to the repo owners, not this feature). The icon is decorative:
 * these tests assert the accessible contract (name, long-press gesture), not
 * SVG rendering, so the library is stubbed at the dependency seam.
 */
jest.mock("lucide-react-native", () => ({
  Wrench: () => null,
}));

/**
 * The corner affordance is PRESENTATIONAL (AC-05): visibility is handed down by
 * the overlay (kiosk-only), and the only thing it reports upward is a
 * DELIBERATE long press — a tap must do nothing. It owns no policy, no store,
 * no data; these tests pin that contract plus the negative space (nothing
 * logged, nothing persisted — there is nothing here to persist, and it must
 * stay that way).
 */

jest.mock("@/core/storage", () => ({
  storage: { read: jest.fn(), write: jest.fn(), remove: jest.fn() },
  storageKey: jest.fn((feature: string, name: string) => `kisok:${feature}:${name}`),
  createJsonStorage: jest.fn(),
  clearKisokStorage: jest.fn(),
}));

const storageMock = {
  read: storage.read as unknown as jest.Mock,
  write: storage.write as unknown as jest.Mock,
  remove: storage.remove as unknown as jest.Mock,
};
const createJsonStorageMock = createJsonStorage as unknown as jest.Mock;
const clearKisokStorageMock = clearKisokStorage as unknown as jest.Mock;

const ENTRY_NAME = "Maintenance";

let logRecords: LogRecord[] = [];

beforeEach(() => {
  logRecords = [];
  setLogSink((record) => logRecords.push(record));
});

afterEach(() => {
  resetLogging();
});

describe("MaintenanceEntry", () => {
  it("renders a labelled affordance when visible", async () => {
    await renderWithProviders(<MaintenanceEntry visible onLongPress={jest.fn()} />);

    // Accessible name says what it is, without advertising anything louder
    // than a small corner affordance should.
    expect(screen.getByRole("button", { name: ENTRY_NAME })).toBeOnTheScreen();
  });

  it("renders nothing when not visible — the overlay owns that decision", async () => {
    await renderWithProviders(<MaintenanceEntry visible={false} onLongPress={jest.fn()} />);

    expect(screen.queryByRole("button", { name: ENTRY_NAME })).toBeNull();
  });

  it("reports a long press upward", async () => {
    const onLongPress = jest.fn();
    await renderWithProviders(<MaintenanceEntry visible onLongPress={onLongPress} />);

    await userEvent.setup().longPress(screen.getByRole("button", { name: ENTRY_NAME }));

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("ignores a plain tap — the affordance is deliberately hard to trigger", async () => {
    const onLongPress = jest.fn();
    await renderWithProviders(<MaintenanceEntry visible onLongPress={onLongPress} />);

    await userEvent.setup().press(screen.getByRole("button", { name: ENTRY_NAME }));

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("logs nothing and touches no storage surface", async () => {
    await renderWithProviders(<MaintenanceEntry visible onLongPress={jest.fn()} />);

    await userEvent.setup().longPress(screen.getByRole("button", { name: ENTRY_NAME }));

    expect(logRecords).toEqual([]);
    expect(storageMock.read).not.toHaveBeenCalled();
    expect(storageMock.write).not.toHaveBeenCalled();
    expect(storageMock.remove).not.toHaveBeenCalled();
    expect(createJsonStorageMock).not.toHaveBeenCalled();
    expect(clearKisokStorageMock).not.toHaveBeenCalled();
  });
});
