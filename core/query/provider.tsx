import NetInfo from "@react-native-community/netinfo";
import {
  QueryClientProvider,
  focusManager,
  onlineManager,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";

import { createQueryClient } from "./client";

/**
 * `onlineManager` has no idea what "online" means in React Native unless we
 * tell it. Registered at module scope so it is installed exactly once, before
 * any query runs.
 */
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isConnected));
  }),
);

function onAppStateChange(status: AppStateStatus) {
  // On web the browser's own visibility handling already drives focusManager.
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
}

export function QueryProvider({
  children,
  client,
}: {
  children: React.ReactNode;
  /** Inject a client in tests; production creates one that lives for the app's lifetime. */
  client?: QueryClient;
}) {
  const [queryClient] = useState(() => client ?? createQueryClient());

  useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
