import { useAuth } from "@/core/auth";

import { resolveRootTarget, type RootTarget } from "../model/root-guard";
import { useDevicePolicyStore } from "./device-policy-store";

/**
 * The sanctioned channel from `app/**` to the device policy (plan Design
 * decision 6): `app/**` may not import Zustand, so the feature owns the store
 * and exposes this hook instead — `.claude/rules/routes.md`: "Own the store
 * inside the feature and expose a hook".
 *
 * Subscription and derivation only — no state is created here. The policy
 * role is read through a live `useDevicePolicyStore` subscription (a snapshot
 * applied by the sync hook re-derives the target without a remount), and the
 * auth half comes from `useAuth()`. The decision itself is the pure
 * `resolveRootTarget` table (`../model/root-guard`).
 */
export function useRootTarget(): RootTarget {
  const { status, profile } = useAuth();
  const policyRole = useDevicePolicyStore((state) => state.policy.role);

  return resolveRootTarget(status, profile?.role, policyRole);
}
