// `URL`/`URLSearchParams` are incomplete in the React Native runtime and
// supabase-js depends on them. This polyfill must be imported before the client.
import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import { getEnv } from "@/core/env";
import { createLogger } from "@/core/logging";

import type { Database } from "./database.types";

const log = createLogger("supabase.client");

export type KisokSupabaseClient = SupabaseClient<Database>;

/**
 * Build a Supabase client configured for Expo.
 *
 * - `storage: AsyncStorage` persists the session on Android and, via
 *   localStorage, on the react-native-web dev preview — one adapter, both
 *   platforms.
 * - `detectSessionInUrl: false` because KISOK uses email+password for manually
 *   provisioned store accounts. There is no OAuth redirect to parse, and leaving
 *   it on would make the web preview try to read tokens out of the URL.
 * - Only the PUBLISHABLE key is ever used here. The secret key must never reach
 *   a client bundle; Row Level Security is the real boundary.
 */
export function createSupabaseClient(): KisokSupabaseClient {
  const env = getEnv();

  return createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

let client: KisokSupabaseClient | null = null;
let autoRefreshBound = false;

/**
 * The app-wide client. Created lazily so that importing this module does not
 * require a valid environment — tests and the Ignite generator can load the
 * surrounding code without credentials.
 *
 * Only feature `api/` modules may call this. ESLint blocks it from routes,
 * screens, and components.
 */
export function getSupabaseClient(): KisokSupabaseClient {
  if (!client) {
    client = createSupabaseClient();
    bindAutoRefresh(client);
  }
  return client;
}

/**
 * On React Native, `autoRefreshToken` alone is not enough: the timer must be
 * stopped while the app is backgrounded and restarted on resume, otherwise a
 * tablet left asleep overnight wakes with an expired session.
 *
 * Not applied on web, where the browser keeps timers running and Supabase's own
 * guidance scopes this to non-browser environments.
 */
function bindAutoRefresh(instance: KisokSupabaseClient) {
  if (autoRefreshBound || Platform.OS === "web") return;
  autoRefreshBound = true;

  instance.auth.startAutoRefresh();
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      instance.auth.startAutoRefresh();
    } else {
      instance.auth.stopAutoRefresh();
    }
  });

  log.debug("Bound Supabase auto-refresh to AppState");
}

/** Test seam: install a client (usually a mock) and forget the real one. */
export function setSupabaseClient(next: KisokSupabaseClient | null) {
  client = next;
}
