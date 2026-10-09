import appConfig from "../../../app.config";
import { readReleaseIdentity, releaseNotesFor, shouldAnnounce } from "./release-notes";

jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: {} } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Constants = require("expo-constants").default as { expoConfig: unknown };

describe("readReleaseIdentity", () => {
  it("builds a token from versionName AND android.versionCode", () => {
    Constants.expoConfig = { version: "1.1.0", android: { versionCode: 4 } };

    expect(readReleaseIdentity()).toEqual({ token: "1.1.0+4", versionName: "1.1.0" });
  });

  it("prefers android.version over the root version when Android overrides it", () => {
    Constants.expoConfig = {
      version: "1.1.0",
      android: { version: "1.1.1", versionCode: 4 },
    };

    expect(readReleaseIdentity()).toEqual({ token: "1.1.1+4", versionName: "1.1.1" });
  });

  it("changes when ONLY versionCode moves", () => {
    // Android enforces N->N+1 on versionCode, so a release can ship a new
    // build without touching the marketing version. A versionName-only token
    // would miss it entirely.
    Constants.expoConfig = { version: "1.0.0", android: { versionCode: 1 } };
    const before = readReleaseIdentity();
    Constants.expoConfig = { version: "1.0.0", android: { versionCode: 2 } };

    expect(readReleaseIdentity()!.token).not.toBe(before!.token);
  });

  it("returns undefined when no version identity can be read at all", () => {
    Constants.expoConfig = {};

    expect(readReleaseIdentity()).toBeUndefined();
  });

  it("still yields a usable identity when only one field is present", () => {
    Constants.expoConfig = { android: { versionCode: 9 } };

    expect(readReleaseIdentity()).toEqual({ token: "?+9", versionName: "build 9" });
  });
});

describe("shouldAnnounce", () => {
  const current = { token: "1.1.0+4", versionName: "1.1.0" };

  it("stays silent on a FIRST install — nothing was updated", () => {
    expect(shouldAnnounce(current, null)).toBe(false);
  });

  it("announces when the stored release differs", () => {
    expect(shouldAnnounce(current, "1.0.0+1")).toBe(true);
  });

  it("stays silent once the current release has been acknowledged", () => {
    expect(shouldAnnounce(current, "1.1.0+4")).toBe(false);
  });

  it("stays silent when the running build has no readable identity", () => {
    // Guessing "updated" here would show the dialog on every launch.
    expect(shouldAnnounce(undefined, "1.0.0+1")).toBe(false);
  });
});

describe("releaseNotesFor", () => {
  it("returns an empty list for a release with no written notes", () => {
    // The dialog falls back to a generic line rather than breaking.
    expect(releaseNotesFor("9.9.9+99")).toEqual([]);
  });

  it("returns the written KISOK 1.1.0 notes at their exact release token", () => {
    // versionName 1.1.0, android.versionCode 2 — the redesign release.
    expect(releaseNotesFor("1.1.0+2")).toEqual([
      "A redesigned catalog makes products, categories, brands, and search easier to explore.",
      "Product options and variants are easier to browse and select, including products with large option sets.",
      "Cart, checkout, offline feedback, and the overall kiosk experience have been refined.",
    ]);
  });

  it("returns the written KISOK 1.2.0 notes at their exact release token", () => {
    // versionName 1.2.0, android.versionCode 7 — Help Me Choose and large variant sets.
    expect(releaseNotesFor("1.2.0+7")).toEqual([
      "New: Help me choose. Answer a few quick questions and see only the products that have an option matching everything you picked.",
      "Products with many flavors or options now open into a full, searchable list, with available options shown first.",
      "Your chosen option and quantity stay put while you browse, and Help me choose points you straight to the options that match.",
    ]);
  });

  it("has written notes for the release this app config builds", () => {
    // The identity the shipped binary will report, built exactly as
    // readReleaseIdentity does. Bumping the version without writing its
    // notes would ship the generic fallback line to every tablet.
    Constants.expoConfig = appConfig;
    const current = readReleaseIdentity();

    expect(current).toBeDefined();
    expect(releaseNotesFor(current!.token).length).toBeGreaterThan(0);
  });
});
