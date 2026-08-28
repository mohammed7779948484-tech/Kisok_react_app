import { resetLogging, setLogSink } from "@/core/logging";
import { createJsonStorage, storageKey } from "@/core/storage";
import { createMemoryStore } from "@/core/testing";

// These tests deliberately exercise failure paths, and the storage module logs
// them. Capture the output so an expected failure does not look like a broken
// test run.
beforeEach(() => setLogSink(() => {}));
afterEach(resetLogging);

describe("storageKey", () => {
  it("namespaces keys per feature so two features cannot collide", () => {
    expect(storageKey("cart", "lines")).toBe("kisok:cart:lines");
  });
});

describe("createJsonStorage", () => {
  it("round-trips a value", async () => {
    const storage = createJsonStorage(createMemoryStore());

    await storage.write("k", { count: 2 });

    await expect(storage.read("k", (raw) => raw as { count: number })).resolves.toEqual({
      status: "hit",
      value: { count: 2 },
    });
  });

  it("reports a miss for an unwritten key", async () => {
    const storage = createJsonStorage(createMemoryStore());

    await expect(storage.read("absent", (raw) => raw)).resolves.toEqual({ status: "miss" });
  });

  it("REPORTS a failed write instead of swallowing it", async () => {
    // This is the behaviour the cart depends on: telling a customer their cart
    // is saved when the write failed would be a correctness bug.
    const storage = createJsonStorage(createMemoryStore({ failOn: "setItem" }));

    const result = await storage.write("k", { count: 1 });

    expect(result.status).toBe("rejected");
  });

  it("reports a rejected read rather than throwing, so the app can still start", async () => {
    const storage = createJsonStorage(createMemoryStore({ failOn: "getItem" }));

    const result = await storage.read("k", (raw) => raw);

    expect(result.status).toBe("rejected");
  });

  it("treats an unparseable stored payload as rejected, not a crash", async () => {
    const backend = createMemoryStore();
    backend.map.set("k", "{ not json");
    const storage = createJsonStorage(backend);

    const result = await storage.read("k", (raw) => raw);

    expect(result.status).toBe("rejected");
  });
});
