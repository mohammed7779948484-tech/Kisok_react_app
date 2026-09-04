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
 * role AND the store-level readiness verdict are read through live
 * `useDevicePolicyStore` subscriptions (a snapshot applied by the sync hook
 * re-derives the target without a remount; readiness is the IR-01
 * remediation — while the first native read has not produced a verdict, a
 * standard policy holds the target at "startup" so a fast auth can never
 * mount Preparation against an unread device), and the auth half comes from
 * `useAuth()`. The decision itself is the pure `resolveRootTarget` table
 * (`../model/root-guard`), which takes both policy inputs explicitly.
 */
export function useRootTarget(): RootTarget {
  const { status, profile } = useAuth();
  const policyRole = useDevicePolicyStore((state) => state.policy.role);
  const policyReadiness = useDevicePolicyStore((state) => state.readiness);

  return resolveRootTarget(status, profile?.role, policyRole, policyReadiness);
}
