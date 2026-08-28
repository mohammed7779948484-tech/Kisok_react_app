import { render, type RenderOptions } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { PortalHost } from "@rn-primitives/portal";
import { SafeAreaProvider } from "react-native-safe-area-context";

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
 * Note `AuthProvider` is NOT included: it talks to Supabase. Tests that need a
 * session should mock the client with `installMockSupabase` and wrap in
 * `AuthProvider` explicitly, or pass the profile into the component under test.
 */
export async function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderOptions & { queryClient?: QueryClient },
) {
  const queryClient = options?.queryClient ?? createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 1024, height: 768 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <QueryClientProvider client={queryClient}>
          {children}
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
