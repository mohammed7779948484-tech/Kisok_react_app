import { QueryClient } from "@tanstack/react-query";

/**
 * QueryClient for tests.
 *
 * Retries are off so a failing-query test asserts immediately instead of
 * waiting out the exponential backoff, and `gcTime: Infinity` keeps data
 * around for the length of a test.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}
