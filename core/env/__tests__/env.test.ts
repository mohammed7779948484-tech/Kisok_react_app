import fs from "node:fs";
import path from "node:path";

import { parseEnv } from "@/core/env";

const valid = {
  supabaseUrl: "https://example.supabase.co",
  supabasePublishableKey: "sb_publishable_example",
  environment: "local",
};

describe("environment validation", () => {
  it("accepts a complete configuration", () => {
    expect(parseEnv(valid).success).toBe(true);
  });

  it("rejects a missing publishable key with an actionable message", () => {
    const result = parseEnv({ ...valid, supabasePublishableKey: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("rejects a URL that is not a URL", () => {
    expect(parseEnv({ ...valid, supabaseUrl: "example.supabase.co" }).success).toBe(false);
  });

  it("rejects an unknown environment label", () => {
    expect(parseEnv({ ...valid, environment: "prod" }).success).toBe(false);
  });

  it.each(["local", "test", "staging", "production"])("accepts %s", (environment) => {
    expect(parseEnv({ ...valid, environment }).success).toBe(true);
  });

  // `.env` is COMMITTED and is what a fresh clone runs against. If it stops
  // satisfying this schema, every clone boots to "Configuration required" and
  // the first person to notice is a feature agent who cannot run the app.
  it("the committed .env satisfies the schema", () => {
    const source = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const values = Object.fromEntries(
      source
        .split(/\r?\n/)
        .filter((line) => /^\s*EXPO_PUBLIC_/.test(line))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    );

    const result = parseEnv({
      supabaseUrl: values.EXPO_PUBLIC_SUPABASE_URL,
      supabasePublishableKey: values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      environment: values.EXPO_PUBLIC_ENVIRONMENT,
    });

    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  // The whole point of committing .env is that it is safe to. A secret in there
  // would ship in the APK and be readable by anyone holding it.
  it("the committed .env carries no secret", () => {
    const source = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const declared = source
      .split(/\r?\n/)
      .filter((line) => /^\s*[A-Z_]+\s*=/.test(line))
      .map((line) => line.split("=")[0]?.trim());

    // Only EXPO_PUBLIC_* may be here: anything else is not inlined by Metro
    // anyway, so its only effect would be to sit in the repository looking
    // like a credential.
    expect(declared.filter((name) => !name?.startsWith("EXPO_PUBLIC_"))).toEqual([]);

    // Comments are stripped first — the file names the forbidden things in
    // order to forbid them, and matching that prose would fail on the warning
    // rather than on a value.
    const assignments = source
      .split(/\r?\n/)
      .filter((line) => !/^\s*#/.test(line))
      .join("\n");
    expect(assignments).not.toMatch(/service_role|sb_secret_|JWT_SECRET|postgres:\/\//i);
  });
});
