import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { catalogKeys } from "./keys";

/**
 * Marks the catalog snapshot stale so its next read refetches. Called after an
 * order is placed: the order lowered stock on the server, and the snapshot's
 * `available_quantity` should not keep offering units that are gone. The
 * server still re-validates stock on every order either way.
 */
export function useInvalidateCatalog(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
  }, [queryClient]);
}
