import type { AppRole, AuthStatus } from "@/core/auth";

import { resolveRootTarget, type RootTarget } from "./root-guard";

/**
 * AC-03 / AC-04 — the pure root-target resolver, table-driven over
 * (auth status × profile role × device-policy role × policy readiness).
 *
 * Behavior-change discipline, as three halves of one table:
 * - The standard rows assert equality with TODAY's routing (AC-04: an
 *   employee tablet behaves exactly as before) — they are no-drift pins, not
 *   new behavior.
 * - The `customer-kiosk` veto: `ready + preparation + "customer-kiosk"` →
 *   `"kiosk-mismatch"` (AC-03): on a customer kiosk the preparation experience
 *   is never the visible target, so it never mounts. A kiosk verdict is
 *   affirmative on its own — it is NOT gated on readiness (RD-02: a
 *   provisional snapshot with live LOCKED corroboration derives kiosk).
 * - THE one behavior CHANGE of the readiness remediation (RD-01/IR-01):
 *   `ready + preparation + "standard" + "pending"` → `"startup"`. The native
 *   restrictions read is disk I/O that "may take several seconds" with no
 *   ordering guarantee against auth resolution, so a fast auth must hold
 *   Preparation at the startup target until the policy read resolves. Every
 *   other row is byte-identical to the pre-readiness table.
 *
 * The `pending` rows OUTSIDE the preparation section are CHARACTERIZATION
 * rows: they pin RD-01's negative decision — readiness gates NOTHING but the
 * preparation row. Sign-in, unauthorized, and customer targets are identical
 * while a read is pending (employee-facing and signed-out flows are never
 * delayed by the first policy read), so a future change that widens the gate
 * fails these rows.
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
  policyReadiness: "pending" | "resolved",
  expected: RootTarget,
];

const ROWS: ResolverRow[] = [
  // ── Startup: total-mapping rows; callers early-return before consulting the target ──
  [
    "resolving → startup (whatever role/policy arrives)",
    "resolving",
    "customer",
    "standard",
    "resolved",
    "startup",
  ],
  [
    "resolving on a customer kiosk → startup",
    "resolving",
    "preparation",
    "customer-kiosk",
    "resolved",
    "startup",
  ],
  ["error → startup", "error", "customer", "standard", "resolved", "startup"],
  [
    "error on a customer kiosk → startup",
    "error",
    "preparation",
    "customer-kiosk",
    "resolved",
    "startup",
  ],

  // ── Sign-in: device policy NEVER blocks sign-in — a signed-out kiosk is a
  //    locked tablet showing the sign-in screen (brief: "Signing out shows the
  //    sign-in screen inside the same locked device") ──
  [
    "signedOut (standard) → sign-in — today's routing",
    "signedOut",
    undefined,
    "standard",
    "resolved",
    "sign-in",
  ],
  [
    "signedOut (customer-kiosk) → sign-in — policy never blocks sign-in",
    "signedOut",
    undefined,
    "customer-kiosk",
    "resolved",
    "sign-in",
  ],
  [
    "signedOut (standard, pending) → sign-in — readiness gates NOTHING but the preparation row (RD-01 characterization)",
    "signedOut",
    undefined,
    "standard",
    "pending",
    "sign-in",
  ],

  // ── Unauthorized: today's routing, policy-independent (a non-tablet account
  //    has no experience on EITHER device kind) ──
  [
    "unauthorized without a profile (standard) → unauthorized — today's routing",
    "unauthorized",
    undefined,
    "standard",
    "resolved",
    "unauthorized",
  ],
  [
    "unauthorized without a profile (customer-kiosk) → unauthorized",
    "unauthorized",
    undefined,
    "customer-kiosk",
    "resolved",
    "unauthorized",
  ],
  [
    "unauthorized with an admin profile (standard) → unauthorized — today's routing",
    "unauthorized",
    "admin",
    "standard",
    "resolved",
    "unauthorized",
  ],
  [
    "unauthorized with an admin profile (customer-kiosk) → unauthorized",
    "unauthorized",
    "admin",
    "customer-kiosk",
    "resolved",
    "unauthorized",
  ],
  [
    "unauthorized without a profile (standard, pending) → unauthorized — readiness gates nothing here either (RD-01 characterization)",
    "unauthorized",
    undefined,
    "standard",
    "pending",
    "unauthorized",
  ],

  // ── Customer: both policy roles — a customer kiosk runs the customer
  //    experience; that IS the product ──
  [
    "ready + customer (standard) → customer — today's routing",
    "ready",
    "customer",
    "standard",
    "resolved",
    "customer",
  ],
  [
    "ready + customer (customer-kiosk) → customer — the kiosk experience",
    "ready",
    "customer",
    "customer-kiosk",
    "resolved",
    "customer",
  ],
  [
    "ready + customer (standard, pending) → customer — readiness gates NOTHING but the preparation row (RD-01 characterization)",
    "ready",
    "customer",
    "standard",
    "pending",
    "customer",
  ],

  // ── Preparation: the kiosk veto (not readiness-gated) + THE one new
  //    behavior row of the readiness remediation ──
  [
    "ready + preparation (standard, resolved) → preparation — EXACTLY today's routing",
    "ready",
    "preparation",
    "standard",
    "resolved",
    "preparation",
  ],
  [
    "ready + preparation (standard, pending) → startup — THE new behavior (RD-01/IR-01: the policy read has not resolved, so Preparation must not mount)",
    "ready",
    "preparation",
    "standard",
    "pending",
    "startup",
  ],
  [
    "ready + preparation (customer-kiosk) → kiosk-mismatch — THE kiosk veto (AC-03)",
    "ready",
    "preparation",
    "customer-kiosk",
    "resolved",
    "kiosk-mismatch",
  ],
  [
    "ready + preparation (customer-kiosk, pending) → kiosk-mismatch — a kiosk verdict is affirmative and NOT readiness-gated (RD-02)",
    "ready",
    "preparation",
    "customer-kiosk",
    "pending",
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
    "resolved",
    "unauthorized",
  ],
  [
    "ready + undefined role (customer-kiosk) → unauthorized (defensive; unreachable via useAuth)",
    "ready",
    undefined,
    "customer-kiosk",
    "resolved",
    "unauthorized",
  ],
  [
    "ready + admin (standard) → unauthorized (defensive; unreachable via useAuth)",
    "ready",
    "admin",
    "standard",
    "resolved",
    "unauthorized",
  ],
  [
    "ready + admin (customer-kiosk) → unauthorized (defensive; unreachable via useAuth)",
    "ready",
    "admin",
    "customer-kiosk",
    "resolved",
    "unauthorized",
  ],
];

describe("resolveRootTarget (status × role × policyRole × policyReadiness → visible target)", () => {
  it.each(ROWS)("%s", (_description, status, role, policyRole, policyReadiness, expected) => {
    expect(resolveRootTarget(status, role, policyRole, policyReadiness)).toBe(expected);
  });

  it("covers every RootTarget value through the table above", () => {
    // Guard the table itself: every RootTarget literal must appear as some
    // row's expectation, otherwise a target could exist that no row pins.
    const covered = new Set(ROWS.map((row) => row[5]));
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
