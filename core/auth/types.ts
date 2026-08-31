import { z } from "zod";

import type { Enums } from "@/core/supabase";

/** Mirrors `public.app_role`. */
export const appRoleSchema = z.enum(["admin", "preparation", "customer"]);
export type AppRole = Enums<"app_role">;

/**
 * Projection returned by `current_active_profile()`.
 * The function returns ZERO ROWS when the profile is missing or inactive —
 * that is the intended "no operational access" signal, not an error.
 */
export const activeProfileSchema = z.object({
  id: z.uuid(),
  display_name: z.string(),
  role: appRoleSchema,
  is_active: z.boolean(),
});

export type ActiveProfile = z.infer<typeof activeProfileSchema>;

export const activeProfileRowsSchema = z.array(activeProfileSchema);

/**
 * Startup / session state machine.
 *
 * `unauthorized` is distinct from `signedOut` on purpose: the credentials are
 * valid but this account has no place in the tablet app (inactive profile, or
 * the `admin` role, which belongs to the separate web admin application).
 * Showing "please sign in" there would be a lie and would loop the user.
 */
export type AuthStatus = "resolving" | "signedOut" | "unauthorized" | "ready" | "error";

/** Roles that have an experience in this tablet client. */
export const TABLET_ROLES = ["customer", "preparation"] as const;
export type TabletRole = (typeof TABLET_ROLES)[number];

export function isTabletRole(role: AppRole): role is TabletRole {
  return (TABLET_ROLES as readonly string[]).includes(role);
}
