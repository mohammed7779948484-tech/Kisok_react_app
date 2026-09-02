import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { installMockSupabase } from "@/core/testing";

import { createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";

import { fetchCatalog } from "./fetch-catalog";

let supabase: ReturnType<typeof installMockSupabase> | undefined;

beforeEach(() => {
  setLogSink(() => {});
});

afterEach(() => {
  supabase?.restore();
  supabase = undefined;
  resetLogging();
});

describe("fetchCatalog", () => {
  it("calls the zero-argument customer Catalog RPC exactly once and returns its validated snapshot", async () => {
    const snapshot = createCatalogSnapshotFixture();
    supabase = installMockSupabase({
      rpc: {
        get_customer_catalog: () => ({ data: snapshot, error: null }),
      },
    });

    await expect(fetchCatalog()).resolves.toEqual(snapshot);
    expect(supabase.calls).toEqual([{ name: "get_customer_catalog", args: undefined }]);
  });

  it("rejects a malformed Catalog payload as an AppError", async () => {
    const malformedSnapshot = {
      ...createCatalogSnapshotFixture(),
      schema_version: "kiosk.catalog.lean.v0",
    };
    supabase = installMockSupabase({
      rpc: {
        get_customer_catalog: () => ({ data: malformedSnapshot, error: null }),
      },
    });

    const failure = await fetchCatalog().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ kind: "server", code: "RPC_SCHEMA_MISMATCH" });
  });

  it("propagates the AppError normalized by callRpc for an RPC failure", async () => {
    supabase = installMockSupabase({
      rpc: {
        get_customer_catalog: () => ({
          data: null,
          error: {
            code: "42501",
            message: "An active Customer profile is required.",
            details: "",
            hint: "",
            name: "PostgrestError",
          },
        }),
      },
    });

    const failure = await fetchCatalog().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ kind: "forbidden", code: "42501" });
  });
});
