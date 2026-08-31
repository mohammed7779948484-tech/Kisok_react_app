import { z } from "zod";

/**
 * Validated public client configuration.
 *
 * `EXPO_PUBLIC_*` variables are inlined into the bundle by Metro at build time,
 * so they MUST be read as static `process.env.EXPO_PUBLIC_X` member
 * expressions — a dynamic lookup like `process.env[key]` silently yields
 * `undefined` in a production build.
 *
 * Everything here is public by definition. Secrets (the Supabase secret key,
 * the database password, the Cloudinary API secret) must never reach the
 * client; Row Level Security is what protects data. See docs/environment.md.
 */
const envSchema = z.object({
  supabaseUrl: z.url({
    error: "EXPO_PUBLIC_SUPABASE_URL must be a full URL, e.g. https://xyz.supabase.co",
  }),
  supabasePublishableKey: z
    .string()
    .min(1, { error: "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required" }),
  environment: z.enum(["local", "test", "staging", "production"]).default("local"),
});

export type Env = z.infer<typeof envSchema>;

const rawEnv = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? "local",
};

/**
 * Parse the environment. Exported separately from `env` so tests can exercise
 * failure messages without needing the module to blow up on import.
 */
export function parseEnv(input: unknown = rawEnv) {
  return envSchema.safeParse(input);
}

let cached: Env | null = null;

/**
 * Fail fast, with a message that tells a developer exactly what to do.
 * Call this from the root layout so a misconfigured tablet shows a real error
 * instead of an empty screen.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const result = parseEnv();
  if (!result.success) {
    const details = result.error.issues.map((issue) => `  - ${issue.message}`).join("\n");
    throw new Error(
      `Missing or invalid client configuration:\n${details}\n\n` +
        `Copy .env.example to .env.local and fill it in, then restart the bundler ` +
        `(EXPO_PUBLIC_* values are inlined at build time).`,
    );
  }

  cached = result.data;
  return cached;
}

/** Test helper: drop the memoised value so a new process.env can be read. */
export function resetEnvCache() {
  cached = null;
}
