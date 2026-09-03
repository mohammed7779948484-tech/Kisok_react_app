/**
 * Query keys for this feature.
 *
 * Owned locally on purpose: a central key registry would be edited by every
 * feature agent and conflict on every merge. Export these through the feature's
 * public API only if another feature genuinely needs to invalidate them.
 *
 * Shape is general-to-specific, so `invalidateQueries({ queryKey:
 * catalogKeys.all })` clears everything this feature owns.
 */
export const catalogKeys = {
  all: ["catalog"] as const,
};
