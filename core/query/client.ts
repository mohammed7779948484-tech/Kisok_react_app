import { QueryClient } from "@tanstack/react-query";

import { shouldRetry } from "@/core/errors";

/**
 * TanStack Query is the ONLY server-state cache in this app. Do not build a
 * parallel store that mirrors data from Supabase — put remote data here and
 * client-owned data in a Zustand store. See docs/state-management.md.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Retries only errors that could plausibly succeed next time. A
        // `forbidden` or `validation` failure surfaces immediately.
        retry: (failureCount, error) => shouldRetry(failureCount, error),
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        // The kiosk catalog is a snapshot that changes rarely; a short stale
        // time avoids a refetch storm as a customer moves between screens.
        staleTime: 30_000,
        // `focusManager` is wired in QueryProvider, so focus refetching is
        // meaningful on native rather than a no-op.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        // Mutations are never retried automatically. Checkout in particular must
        // control its own retry so it can reuse the same client_request_id.
        retry: false,
      },
    },
  });
}

/**
 * Clear every cached query and mutation. Call on sign-out so the next store
 * account cannot see the previous session's data.
 */
export function clearQueryCache(queryClient: QueryClient) {
  queryClient.clear();
}
