import { QueryClient } from "@tanstack/react-query";

/**
 * QueryClient for tests.
 *
 * Retries are off so a failing-query test asserts immediately instead of
 * waiting out the exponential backoff, and `gcTime: Infinity` keeps data
 * around for the length of a test. The same cap applies to MUTATIONS: a
 * completed mutation schedules its default 5-minute GC timer the moment its
 * last observer unmounts (RNTL cleanup), and that timer keeps the jest
 * process alive long after the suite passes — invisible to
 * --detectOpenHandles, because timers are not handles. Capping mutation
 * gcTime here removes the class; per-suite destroy() loops (the
 * use-submit-order-mutation precedent) remain harmless belt-and-braces.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}
