import AsyncStorage from "@react-native-async-storage/async-storage";

import { createLogger } from "@/core/logging";

const log = createLogger("storage");

/**
 * Durable key/value storage for client-owned state.
 *
 * Backed by AsyncStorage, which works unchanged on Android and on
 * react-native-web (localStorage). MMKV was rejected because it needs a native
 * build and is unavailable in Expo Go — see docs/adr/0003-client-state.md.
 *
 * The API returns a RESULT instead of throwing, because some state (the cart)
 * must be able to tell the user "this change is in memory but was not saved".
 * Swallowing a write failure is a correctness bug for KISOK, not a nuisance.
 */
export type StorageWriteResult = { status: "persisted" } | { status: "rejected"; error: Error };

export type StorageReadResult<T> =
  | { status: "hit"; value: T }
  | { status: "miss" }
  | { status: "rejected"; error: Error };

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** Prefix reserved for KISOK-owned client state. */
export const KISOK_STORAGE_PREFIX = "kisok:";

/** Namespaced so a feature cannot accidentally collide with another's keys. */
export function storageKey(feature: string, name: string): string {
  return `${KISOK_STORAGE_PREFIX}${feature}:${name}`;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Create a JSON-serialising store over any KeyValueStore. Pass a fake backend
 * in tests (see `core/testing/storage.ts`) instead of mocking AsyncStorage.
 */
export function createJsonStorage(backend: KeyValueStore = AsyncStorage) {
  return {
    async read<T>(key: string, parse: (raw: unknown) => T): Promise<StorageReadResult<T>> {
      try {
        const raw = await backend.getItem(key);
        if (raw === null) return { status: "miss" };
        return { status: "hit", value: parse(JSON.parse(raw)) };
      } catch (error) {
        // A corrupt or schema-drifted payload is REJECTED, not a miss, and never
        // a crash: the app must still start, and the caller can tell "nothing
        // stored" from "something stored that we could not read".
        log.warn("Failed to read persisted value", { key, error: asError(error).message });
        return { status: "rejected", error: asError(error) };
      }
    },

    async write(key: string, value: unknown): Promise<StorageWriteResult> {
      try {
        await backend.setItem(key, JSON.stringify(value));
        return { status: "persisted" };
      } catch (error) {
        log.error("Failed to persist value", { key, error: asError(error).message });
        return { status: "rejected", error: asError(error) };
      }
    },

    async remove(key: string): Promise<StorageWriteResult> {
      try {
        await backend.removeItem(key);
        return { status: "persisted" };
      } catch (error) {
        log.error("Failed to remove persisted value", { key, error: asError(error).message });
        return { status: "rejected", error: asError(error) };
      }
    },
  };
}

export type JsonStorage = ReturnType<typeof createJsonStorage>;

/** The app-wide instance. Features should use this rather than AsyncStorage directly. */
export const storage = createJsonStorage();

/**
 * Emergency kiosk handoff reset. Removes only KISOK-owned client state, never
 * arbitrary browser/device storage. This is the fallback when a feature-level
 * cleanup cannot prove that the previous customer's durable state was erased.
 */
export async function clearKisokStorage(): Promise<StorageWriteResult> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ownedKeys = keys.filter((key) => key.startsWith(KISOK_STORAGE_PREFIX));
    if (ownedKeys.length > 0) await AsyncStorage.multiRemove(ownedKeys);
    return { status: "persisted" };
  } catch (error) {
    log.error("Failed to clear KISOK storage namespace", { error: asError(error).message });
    return { status: "rejected", error: asError(error) };
  }
}
