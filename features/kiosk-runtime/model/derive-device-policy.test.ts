import { deriveDevicePolicy } from "./derive-device-policy";

import type { DevicePolicySnapshot } from "./device-policy.schema";

/**
 * AC-02 — the fail-closed device-policy derivation, table-driven over snapshot
 * fixtures.
 *
 * The invariant under test: nothing except an affirmative MDM signal yields
 * `customer-kiosk` — the restrictions bundle and the DPC allowlist must be
 * NON-provisional, while `lockTaskModeState === "locked"` is live OS evidence
 * and is affirmative even while the bundle is provisional (RD-02). The
 * derivation's ONLY input is the snapshot — there is no auth/session parameter
 * to pass, so Supabase auth state cannot influence device policy (structural,
 * checked by the import list and the signature).
 */

type Restrictions = Record<string, string | number | boolean>;

function snapshot(
  restrictions: Restrictions = {},
  options: { lockTaskPermitted?: boolean; lockTaskModeState?: "none" | "locked" | "pinned" } = {},
): DevicePolicySnapshot {
  return {
    restrictions,
    lockTaskPermitted: options.lockTaskPermitted ?? false,
    lockTaskModeState: options.lockTaskModeState ?? "none",
  };
}

describe("deriveDevicePolicy (fail-closed role derivation)", () => {
  it.each([
    ["empty restrictions without allowlist → standard", snapshot(), "standard"],
    [
      "explicit customer_kiosk without allowlist → customer-kiosk",
      snapshot({ kiosk_device_role: "customer_kiosk" }),
      "customer-kiosk",
    ],
    [
      "explicit customer_kiosk with allowlist → customer-kiosk",
      snapshot({ kiosk_device_role: "customer_kiosk" }, { lockTaskPermitted: true }),
      "customer-kiosk",
    ],
    [
      "explicit standard with allowlist → customer-kiosk (contradiction resolves toward kiosk)",
      snapshot({ kiosk_device_role: "standard" }, { lockTaskPermitted: true }),
      "customer-kiosk",
    ],
    [
      "explicit standard without allowlist → standard",
      snapshot({ kiosk_device_role: "standard" }),
      "standard",
    ],
    [
      "unknown role value without allowlist → standard",
      snapshot({ kiosk_device_role: "admin" }),
      "standard",
    ],
    [
      "wrong-case role value → standard",
      snapshot({ kiosk_device_role: "CUSTOMER_KIOSK" }),
      "standard",
    ],
    ["non-string role value (number) → standard", snapshot({ kiosk_device_role: 42 }), "standard"],
    [
      "non-string role value (boolean) → standard",
      snapshot({ kiosk_device_role: true }),
      "standard",
    ],
    [
      "allowlist only, no role key → customer-kiosk",
      snapshot({}, { lockTaskPermitted: true }),
      "customer-kiosk",
    ],
    [
      "restrictions_pending true even with customer_kiosk + allowlist → standard (provisional)",
      snapshot(
        { kiosk_device_role: "customer_kiosk", restrictions_pending: true },
        { lockTaskPermitted: true },
      ),
      "standard",
    ],
    [
      "restrictions_pending false with customer_kiosk → customer-kiosk",
      snapshot({ kiosk_device_role: "customer_kiosk", restrictions_pending: false }),
      "customer-kiosk",
    ],
    [
      "truthy non-boolean restrictions_pending → standard (drifted marker still fails closed)",
      snapshot(
        { kiosk_device_role: "customer_kiosk", restrictions_pending: 1 },
        { lockTaskPermitted: true },
      ),
      "standard",
    ],
    [
      "lockTaskModeState 'pinned' alone → standard (screen pinning is user-exitable, never a kiosk signal)",
      snapshot({}, { lockTaskModeState: "pinned" }),
      "standard",
    ],
    [
      "lockTaskModeState 'locked' alone → customer-kiosk (RD-02: full lock task mode is DPC-enforced — an app can never reach it un-allowlisted)",
      snapshot({}, { lockTaskModeState: "locked" }),
      "customer-kiosk",
    ],
    [
      "restrictions_pending true + locked → customer-kiosk (live OS evidence is not provisional-suppressed — RD-02)",
      snapshot(
        { kiosk_device_role: "customer_kiosk", restrictions_pending: true },
        {
          lockTaskModeState: "locked",
        },
      ),
      "customer-kiosk",
    ],
    [
      "explicit standard with locked → customer-kiosk (locked corroborates like the allowlist; contradiction resolves toward kiosk)",
      snapshot({ kiosk_device_role: "standard" }, { lockTaskModeState: "locked" }),
      "customer-kiosk",
    ],
  ])("%s", (_name, given, expectedRole) => {
    expect(deriveDevicePolicy(given).role).toBe(expectedRole);
  });
});

describe("deriveDevicePolicy (maintenance credential)", () => {
  it.each([
    [
      "kiosk with code and timeout → both derived",
      snapshot({
        kiosk_device_role: "customer_kiosk",
        maintenance_unlock_code: "4481",
        maintenance_unlock_timeout_seconds: 120,
      }),
      "4481",
      120,
    ],
    [
      "kiosk without maintenance keys → null code, default timeout",
      snapshot({ kiosk_device_role: "customer_kiosk" }),
      null,
      90,
    ],
    [
      "standard with code present → null code (no maintenance credential on standard devices)",
      snapshot({ kiosk_device_role: "standard", maintenance_unlock_code: "4481" }),
      null,
      90,
    ],
    [
      "pending snapshot with code present → null code (provisional devices expose no credential)",
      snapshot(
        {
          kiosk_device_role: "customer_kiosk",
          maintenance_unlock_code: "4481",
          restrictions_pending: true,
        },
        { lockTaskPermitted: true },
      ),
      null,
      90,
    ],
    [
      "allowlist-only kiosk with code → code derived",
      snapshot({ maintenance_unlock_code: "4481" }, { lockTaskPermitted: true }),
      "4481",
      90,
    ],
    [
      "provisional + locked with code → code still DERIVED (the policy self-describes) but restrictionsSettled: false — the bundle is not final credential material, the gate is the store's tryUnlock (RD5-04 supersedes the Round 4 RD-02 credential corollary)",
      snapshot(
        {
          kiosk_device_role: "customer_kiosk",
          maintenance_unlock_code: "4481",
          restrictions_pending: true,
        },
        { lockTaskModeState: "locked" },
      ),
      "4481",
      90,
    ],
    [
      "kiosk with non-string code → null (invalid value, never coerced)",
      snapshot({ kiosk_device_role: "customer_kiosk", maintenance_unlock_code: 4481 }),
      null,
      90,
    ],
    [
      "kiosk with empty-string code → null (degenerate value treated as unset)",
      snapshot({ kiosk_device_role: "customer_kiosk", maintenance_unlock_code: "" }),
      null,
      90,
    ],
  ])("%s", (_name, given, expectedCode, expectedTimeout) => {
    const policy = deriveDevicePolicy(given);

    expect(policy.maintenance.code).toBe(expectedCode);
    expect(policy.maintenance.timeoutSeconds).toBe(expectedTimeout);
  });
});

describe("deriveDevicePolicy (restrictionsSettled — RD5-04, R5-11)", () => {
  it.each([
    ["settled kiosk snapshot → settled", snapshot({ kiosk_device_role: "customer_kiosk" }), true],
    [
      "settled standard snapshot → settled (settled-ness describes the SNAPSHOT, not the role — routing never consumes it)",
      snapshot({ kiosk_device_role: "standard" }),
      true,
    ],
    ["empty snapshot (the fail-closed default) → settled", snapshot(), true],
    [
      "explicit restrictions_pending false → settled",
      snapshot({ kiosk_device_role: "customer_kiosk", restrictions_pending: false }),
      true,
    ],
    [
      "provisional snapshot → unsettled",
      snapshot({ kiosk_device_role: "customer_kiosk", restrictions_pending: true }),
      false,
    ],
    [
      "truthy drifted pending marker (1) → unsettled (one definition, drift included)",
      snapshot({ kiosk_device_role: "customer_kiosk", restrictions_pending: 1 }),
      false,
    ],
    [
      "provisional + LOCKED → unsettled (live LOCKED is ROUTING corroboration only; the bundle is still not credential material)",
      snapshot({ restrictions_pending: true }, { lockTaskModeState: "locked" }),
      false,
    ],
  ])("%s", (_name, given, expectedSettled) => {
    expect(deriveDevicePolicy(given).restrictionsSettled).toBe(expectedSettled);
  });

  it("provisional+LOCKED with a code self-describes completely: role kiosk (routing unchanged), code derived, restrictionsSettled false — the credential GATE lives in the store's tryUnlock (RD5-04 supersedes the Round 4 RD-02 credential corollary)", () => {
    expect(
      deriveDevicePolicy(
        snapshot(
          {
            kiosk_device_role: "customer_kiosk",
            maintenance_unlock_code: "4481",
            restrictions_pending: true,
          },
          { lockTaskModeState: "locked" },
        ),
      ),
    ).toEqual({
      role: "customer-kiosk",
      restrictionsSettled: false,
      maintenance: { code: "4481", timeoutSeconds: 90 },
    });
  });
});

describe("deriveDevicePolicy (maintenance timeout)", () => {
  it.each([
    ["missing", snapshot({ kiosk_device_role: "customer_kiosk" }), 90],
    [
      "non-number (string)",
      snapshot({ kiosk_device_role: "customer_kiosk", maintenance_unlock_timeout_seconds: "90" }),
      90,
    ],
    [
      "non-number (boolean)",
      snapshot({ kiosk_device_role: "customer_kiosk", maintenance_unlock_timeout_seconds: true }),
      90,
    ],
    [
      "non-integer number (45.5)",
      snapshot({
        kiosk_device_role: "customer_kiosk",
        maintenance_unlock_timeout_seconds: 45.5,
      }),
      90,
    ],
    [
      "below the floor (5)",
      snapshot({
        kiosk_device_role: "customer_kiosk",
        maintenance_unlock_timeout_seconds: 5,
      }),
      15,
    ],
    [
      "at the floor (15)",
      snapshot({
        kiosk_device_role: "customer_kiosk",
        maintenance_unlock_timeout_seconds: 15,
      }),
      15,
    ],
    [
      "within range (120)",
      snapshot({
        kiosk_device_role: "customer_kiosk",
        maintenance_unlock_timeout_seconds: 120,
      }),
      120,
    ],
    [
      "at the ceiling (600)",
      snapshot({
        kiosk_device_role: "customer_kiosk",
        maintenance_unlock_timeout_seconds: 600,
      }),
      600,
    ],
    [
      "above the ceiling (100000)",
      snapshot({
        kiosk_device_role: "customer_kiosk",
        maintenance_unlock_timeout_seconds: 100000,
      }),
      600,
    ],
    [
      "on a standard device (derived, inert — standard exposes no code)",
      snapshot({ maintenance_unlock_timeout_seconds: 45 }),
      45,
    ],
  ])("timeout %s", (_label, given, expectedTimeout) => {
    expect(deriveDevicePolicy(given).maintenance.timeoutSeconds).toBe(expectedTimeout);
  });
});

describe("deriveDevicePolicy (purity)", () => {
  it("returns the full policy shape for a fully-populated kiosk snapshot", () => {
    expect(
      deriveDevicePolicy(
        snapshot({
          kiosk_device_role: "customer_kiosk",
          maintenance_unlock_code: "4481",
          maintenance_unlock_timeout_seconds: 120,
        }),
      ),
    ).toEqual({
      role: "customer-kiosk",
      restrictionsSettled: true,
      maintenance: { code: "4481", timeoutSeconds: 120 },
    });
  });

  it("does not mutate the input snapshot", () => {
    const given = snapshot({
      kiosk_device_role: "customer_kiosk",
      maintenance_unlock_code: "4481",
      maintenance_unlock_timeout_seconds: 120,
      restrictions_pending: false,
    });
    const before = JSON.parse(JSON.stringify(given)) as DevicePolicySnapshot;

    deriveDevicePolicy(given);

    expect(given).toEqual(before);
  });
});
