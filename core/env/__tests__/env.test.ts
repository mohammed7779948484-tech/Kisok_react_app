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

    // ...and it must point at the shared TEST project. The whole argument for
    // committing this file is that it is disposable and non-production; a
    // committed production URL and key would satisfy the schema perfectly and
    // silently invalidate that argument.
    expect(values.EXPO_PUBLIC_ENVIRONMENT).toBe("test");
    expect(values.EXPO_PUBLIC_SUPABASE_URL).toBe("https://akxigjsifwyolkadofnj.supabase.co");
    expect(values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_/);
  });

  // The whole point of committing .env is that it is safe to. A secret in there
  // would ship in the APK and be readable by anyone holding it.
  it("the committed .env carries no secret", () => {
    const source = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    // Case-insensitive, and tolerant of a leading `export ` — an uppercase-only
    // pattern cannot see `db_password=…`, and an anchored one cannot see
    // `export DB_PASSWORD=…`. Both are ordinary ways to write a stray
    // credential, and dotenv loads both.
    const declared = source
      .split(/\r?\n/)
      .filter((line) => /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line))
      .map((line) =>
        line
          .replace(/^\s*(?:export\s+)?/, "")
          .split("=")[0]
          ?.trim(),
      );

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

    // A legacy service_role key is a JWT and never contains the literal string
    // "service_role" — it is base64. Since this project uses `sb_publishable_`
    // keys, no value here has any business being a JWT at all, whatever its
    // payload says.
    // The quote is optional: `X="eyJ..."` is the same secret as `X=eyJ...`.
    expect(assignments).not.toMatch(/=\s*["']?eyJ/);
  });
});
