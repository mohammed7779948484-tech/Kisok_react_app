import type { AppRole, AuthStatus } from "@/core/auth";

import { resolveRootTarget, type RootTarget } from "./root-guard";

/**
 * AC-03 / AC-04 — the pure root-target resolver, table-driven over
 * (auth status × profile role × device-policy role).
 *
 * Behavior-change discipline, as two halves of one table:
 * - The standard rows assert equality with TODAY's routing (AC-04: an
 *   employee tablet behaves exactly as before) — they are no-drift pins, not
 *   new behavior.
 * - The one NEW row is `ready + preparation + "customer-kiosk" →
 *   "kiosk-mismatch"` (AC-03): on a customer kiosk the preparation experience
 *   is never the visible target, so it never mounts.
 *
 * "startup" rows exist so the resolver stays TOTAL. The app's callers
 * early-return on `resolving`/`error` themselves; the rows keep the mapping
 * complete so a future caller cannot mishandle those statuses by accident.
 *
 * The last four rows are deliberately defensive: `ready` with an `undefined`
 * or `admin` role is unreachable via `useAuth` today — `core/auth` marks a
 * missing profile and every non-tablet role `unauthorized` BEFORE `ready` —
 * but a pure function must not have a hole where a role drifts through.
 */

type ResolverRow = [
  description: string,
  status: AuthStatus,
  role: AppRole | undefined,
  policyRole: "customer-kiosk" | "standard",
  expected: RootTarget,
];

const ROWS: ResolverRow[] = [
  // ── Startup: total-mapping rows; callers early-return before consulting the target ──
  [
    "resolving → startup (whatever role/policy arrives)",
    "resolving",
    "customer",
    "standard",
    "startup",
  ],
  [
    "resolving on a customer kiosk → startup",
    "resolving",
    "preparation",
    "customer-kiosk",
    "startup",
  ],
  ["error → startup", "error", "customer", "standard", "startup"],
  ["error on a customer kiosk → startup", "error", "preparation", "customer-kiosk", "startup"],

  // ── Sign-in: device policy NEVER blocks sign-in — a signed-out kiosk is a
  //    locked tablet showing the sign-in screen (brief: "Signing out shows the
  //    sign-in screen inside the same locked device") ──
  [
    "signedOut (standard) → sign-in — today's routing",
    "signedOut",
    undefined,
    "standard",
    "sign-in",
  ],
  [
    "signedOut (customer-kiosk) → sign-in — policy never blocks sign-in",
    "signedOut",
    undefined,
    "customer-kiosk",
    "sign-in",
  ],

  // ── Unauthorized: today's routing, policy-independent (a non-tablet account
  //    has no experience on EITHER device kind) ──
  [
    "unauthorized without a profile (standard) → unauthorized — today's routing",
    "unauthorized",
    undefined,
    "standard",
    "unauthorized",
  ],
  [
    "unauthorized without a profile (customer-kiosk) → unauthorized",
    "unauthorized",
    undefined,
    "customer-kiosk",
    "unauthorized",
  ],
  [
    "unauthorized with an admin profile (standard) → unauthorized — today's routing",
    "unauthorized",
    "admin",
    "standard",
    "unauthorized",
  ],
  [
    "unauthorized with an admin profile (customer-kiosk) → unauthorized",
    "unauthorized",
    "admin",
    "customer-kiosk",
    "unauthorized",
  ],

  // ── Customer: both policy roles — a customer kiosk runs the customer
  //    experience; that IS the product ──
  [
    "ready + customer (standard) → customer — today's routing",
    "ready",
    "customer",
    "standard",
    "customer",
  ],
  [
    "ready + customer (customer-kiosk) → customer — the kiosk experience",
    "ready",
    "customer",
    "customer-kiosk",
    "customer",
  ],

  // ── Preparation: the one behavior CHANGE in this table ──
  [
    "ready + preparation (standard) → preparation — EXACTLY today's routing",
    "ready",
    "preparation",
    "standard",
    "preparation",
  ],
  [
    "ready + preparation (customer-kiosk) → kiosk-mismatch — THE new behavior (AC-03)",
    "ready",
    "preparation",
    "customer-kiosk",
    "kiosk-mismatch",
  ],

  // ── Defensive rows: unreachable via useAuth today. core/auth resolves a
  //    missing profile and every non-tablet role to `unauthorized` BEFORE
  //    `ready`, so `ready` always carries a tablet role. Pinned anyway: a
  //    resolver with a silent hole invites exactly the drift this table
  //    exists to catch. ──
  [
    "ready + undefined role (standard) → unauthorized (defensive; unreachable via useAuth)",
    "ready",
    undefined,
    "standard",
    "unauthorized",
  ],
  [
    "ready + undefined role (customer-kiosk) → unauthorized (defensive; unreachable via useAuth)",
    "ready",
    undefined,
    "customer-kiosk",
    "unauthorized",
  ],
  [
    "ready + admin (standard) → unauthorized (defensive; unreachable via useAuth)",
    "ready",
    "admin",
    "standard",
    "unauthorized",
  ],
  [
    "ready + admin (customer-kiosk) → unauthorized (defensive; unreachable via useAuth)",
    "ready",
    "admin",
    "customer-kiosk",
    "unauthorized",
  ],
];

describe("resolveRootTarget (status × role × policyRole → visible target)", () => {
  it.each(ROWS)("%s", (_description, status, role, policyRole, expected) => {
    expect(resolveRootTarget(status, role, policyRole)).toBe(expected);
  });

  it("covers every RootTarget value through the table above", () => {
    // Guard the table itself: every RootTarget literal must appear as some
    // row's expectation, otherwise a target could exist that no row pins.
    const covered = new Set(ROWS.map((row) => row[4]));
    expect(covered).toEqual(
      new Set<RootTarget>([
        "startup",
        "sign-in",
        "unauthorized",
        "customer",
        "preparation",
        "kiosk-mismatch",
      ]),
    );
  });
});
