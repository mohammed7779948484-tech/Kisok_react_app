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
});
