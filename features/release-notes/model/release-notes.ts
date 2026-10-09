import Constants from "expo-constants";

/**
 * The identity of an installed KISOK build, and the notes that go with it.
 *
 * This feature shows a one-time "what changed" message AFTER ManageEngine has
 * already installed a new build. It is NOT an updater: nothing here checks for,
 * downloads, or installs anything, and nothing talks to ManageEngine or a
 * backend. It reads the version the running binary reports and compares it with
 * the last one this tablet acknowledged.
 */

/** The single local key. Namespaced so it cannot collide with cart or auth state. */
export const LAST_SEEN_RELEASE_KEY = "kisok:last_seen_release";

/**
 * A release is identified by versionName AND android.versionCode.
 *
 * versionCode alone is what Android actually enforces for N→N+1, and a release
 * may ship a new versionCode without changing the marketing version — so a
 * token built from versionName only would silently miss it.
 */
export interface ReleaseIdentity {
  /** The stable token stored and compared. */
  token: string;
  /** What the customer is shown, e.g. "1.1.0". */
  versionName: string;
}

/**
 * Read the running build's identity from the evaluated Expo config.
 *
 * Returns undefined when neither field can be read. That is not an error to
 * recover from: with no identity there is nothing meaningful to compare, so the
 * feature stays silent rather than guessing that an update happened.
 */
export function readReleaseIdentity(): ReleaseIdentity | undefined {
  const config = Constants.expoConfig;
  const androidVersion = config?.android?.version;
  const versionName =
    typeof androidVersion === "string"
      ? androidVersion
      : typeof config?.version === "string"
        ? config.version
        : undefined;
  const versionCode = config?.android?.versionCode;
  const code = typeof versionCode === "number" ? String(versionCode) : undefined;

  if (versionName === undefined && code === undefined) return undefined;

  return {
    token: `${versionName ?? "?"}+${code ?? "?"}`,
    versionName: versionName ?? (code === undefined ? "?" : `build ${code}`),
  };
}

/** What to show for a release, keyed by the same token `readReleaseIdentity` builds. */
const RELEASE_NOTES: Record<string, readonly string[]> = {
  // Add an entry when a release is worth explaining. A release with no entry
  // still shows the dialog, with the generic line below — a forgotten note is
  // not a reason to hide that the tablet changed.
  "1.1.0+2": [
    "A redesigned catalog makes products, categories, brands, and search easier to explore.",
    "Product options and variants are easier to browse and select, including products with large option sets.",
    "Cart, checkout, offline feedback, and the overall kiosk experience have been refined.",
  ],
  "1.2.0+7": [
    "New: Help me choose. Answer a few quick questions and see only the products that have an option matching everything you picked.",
    "Products with many flavors or options now open into a full, searchable list, with available options shown first.",
    "Your chosen option and quantity stay put while you browse, and Help me choose points you straight to the options that match.",
  ],
};

/**
 * The bullets for a release, or an empty list when none were written.
 *
 * Kept as a plain record on purpose. This is bundled static copy: a CMS, an
 * API or a changelog service would be a backend for three lines of text.
 */
export function releaseNotesFor(token: string): readonly string[] {
  return RELEASE_NOTES[token] ?? [];
}

/**
 * Should the "what changed" message be shown?
 *
 * - No stored release — this is a FIRST INSTALL. The tablet has not been
 *   updated, it has just been set up, so claiming an update would be a lie.
 *   The current release is recorded silently instead.
 * - A stored release that differs — an update happened. Show it once.
 * - The same release — already acknowledged. Stay silent.
 */
export function shouldAnnounce(
  current: ReleaseIdentity | undefined,
  lastSeen: string | null,
): boolean {
  if (current === undefined) return false;
  if (lastSeen === null) return false;
  return lastSeen !== current.token;
}
