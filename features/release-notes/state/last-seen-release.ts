import AsyncStorage from "@react-native-async-storage/async-storage";

import { createLogger } from "@/core/logging";

import { LAST_SEEN_RELEASE_KEY } from "../model/release-notes";

const log = createLogger("release-notes");

/**
 * The last release this tablet acknowledged, or null when nothing is stored.
 *
 * A read failure returns `undefined`, which is NOT the same as `null`. `null`
 * means "no release stored — first install"; `undefined` means "could not
 * tell". The caller stays silent on `undefined` rather than treating an
 * unreadable store as a first install or as an update.
 */
export async function readLastSeenRelease(): Promise<string | null | undefined> {
  try {
    return await AsyncStorage.getItem(LAST_SEEN_RELEASE_KEY);
  } catch (caught) {
    log.error("Could not read the last seen release", {
      message: caught instanceof Error ? caught.message : String(caught),
    });
    return undefined;
  }
}

/**
 * Record a release as acknowledged.
 *
 * Never throws. A tablet that cannot persist this will show the message again
 * after a restart, which is a nuisance; a throw here would propagate into
 * startup or into a button handler, which is a broken kiosk.
 */
export async function writeLastSeenRelease(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SEEN_RELEASE_KEY, token);
  } catch (caught) {
    log.error("Could not record the last seen release", {
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }
}
