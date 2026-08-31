import type { KeyValueStore } from "@/core/storage";

/**
 * In-memory storage backend for tests. Prefer this over mocking AsyncStorage:
 * it is real behaviour, and `failOn` lets you exercise the persistence-failure
 * paths that KISOK's cart must handle explicitly.
 */
export function createMemoryStore(options?: { failOn?: "setItem" | "getItem" | "removeItem" }) {
  const map = new Map<string, string>();

  const store: KeyValueStore & { map: Map<string, string> } = {
    map,
    async getItem(key) {
      if (options?.failOn === "getItem") throw new Error("storage getItem failed");
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      if (options?.failOn === "setItem") throw new Error("storage setItem failed");
      map.set(key, value);
    },
    async removeItem(key) {
      if (options?.failOn === "removeItem") throw new Error("storage removeItem failed");
      map.delete(key);
    },
  };

  return store;
}
