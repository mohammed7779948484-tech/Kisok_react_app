/**
 * Query keys for this feature.
 *
 * Owned locally on purpose: a central key registry would be edited by every
 * feature agent and conflict on every merge. Export these through the feature's
 * public API only if another feature genuinely needs to invalidate them.
 *
 * Shape is general-to-specific, so `invalidateQueries({ queryKey:
 * checkoutKeys.all })` clears everything this feature owns.
 */
export const checkoutKeys = {
  all: ["checkout"] as const,
  /** One entry per read. Add a factory here when you add a query. */
  detail: (id: string) => [...checkoutKeys.all, "detail", id] as const,
};
