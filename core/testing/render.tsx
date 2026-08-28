import { render, type RenderOptions } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { PortalHost } from "@rn-primitives/portal";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/core/auth";

import { createTestQueryClient } from "./query";

/**
 * Render a component inside the providers it needs in production.
 *
 * Use this instead of the bare RNTL `render` — a component that reads
 * TanStack Query, safe-area insets, or renders a dialog will otherwise throw in
 * a way that looks like a component bug.
 *
 * Returns a promise: RNTL v14's `render` is async, so `await` this call.
 *
 * `AuthProvider` is opt-in via `withAuth`, because it talks to Supabase. Install
 * a fake session first — `installMockAuth()` from `@/core/testing` — then pass
 * `{ withAuth: true }`. Most feature screens sit behind the auth gate, so this is
 * the common case.
 */
export async function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderOptions & { queryClient?: QueryClient; withAuth?: boolean },
) {
  const queryClient = options?.queryClient ?? createTestQueryClient();
  const withAuth = options?.withAuth ?? false;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 1024, height: 768 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <QueryClientProvider client={queryClient}>
          {withAuth ? <AuthProvider>{children}</AuthProvider> : children}
          <PortalHost />
        </QueryClientProvider>
      </SafeAreaProvider>
    );
  }

  // `render` is ASYNC in @testing-library/react-native v14 — it awaits the
  // initial `act()`. Forgetting to await it leaves `screen` unset and produces
  // stray act warnings, so always `await renderWithProviders(...)`.
  const result = await render(ui, { wrapper: Wrapper, ...options });

  return { queryClient, ...result };
}

export * from "@testing-library/react-native";
