import {
  allowedOrderActions,
  canCancel,
  canMarkReady,
  canStartPreparing,
  type OrderActionOrder,
} from "./status-actions";
import type { OrderStatus } from "./store-day";

/**
 * The action-eligibility matrix (T07): which order actions the Preparation UI
 * may OFFER, mirroring migration 20260826050008's `update_order_status`
 * transition rules for an active preparation employee (the actor):
 *
 * - new + unassigned → start preparing (the claim assigns the actor; the RPC
 *   K1004s a new order that is somehow already assigned — migration 04's
 *   orders_assignment_coherent makes that impossible server-side, but the
 *   model mirrors the rule, not the constraint).
 * - preparing + assigned to the actor → mark ready (assignee-only; another
 *   employee's mark-ready is 42501).
 * - new | preparing → cancel — NOT assignment-restricted: the RPC's cancel
 *   branch checks only the status, so any active preparation employee may
 *   cancel any eligible order, including a colleague's.
 * - ready → nothing (display-only; completion is admin-only, there is no
 *   ready→preparing path).
 * - completed | cancelled → nothing (terminal; the RPC refuses with K1004
 *   before any branch).
 *
 * The matrix below is the full cross-product of the model's input type
 * (status × assignment ∈ {unassigned, you, another employee}), including the
 * combinations the server's coherence constraints make impossible — the model
 * is total, so every expressible row is pinned. These rules only decide which
 * buttons to show; the RPC stays the authority.
 */

/** The signed-in preparation employee the rules are evaluated for. */
const ACTOR = "11111111-2222-4333-8444-555555555555";
/** A second preparation employee — assignment "another employee". */
const COLLEAGUE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

type ExpectedActions = {
  startPreparing: boolean;
  markReady: boolean;
  cancel: boolean;
};

/** What a terminal or display-only order affords: nothing at all. */
const NOTHING: ExpectedActions = { startPreparing: false, markReady: false, cancel: false };

type MatrixCase = {
  status: OrderStatus;
  assigned: string | null;
  expected: ExpectedActions;
};

const MATRIX: MatrixCase[] = [
  // `new`: a coherent new row is always unassigned (migration 04's
  // orders_assignment_coherent). The RPC's claim branch assigns the actor and
  // raises K1004 for an already-assigned new order — the model mirrors the
  // rule, so the incoherent assigned rows still refuse Start preparing.
  {
    status: "new",
    assigned: null,
    expected: { startPreparing: true, markReady: false, cancel: true },
  },
  {
    status: "new",
    assigned: ACTOR,
    expected: { startPreparing: false, markReady: false, cancel: true },
  },
  {
    status: "new",
    assigned: COLLEAGUE,
    expected: { startPreparing: false, markReady: false, cancel: true },
  },

  // `preparing`: requires an assignee server-side
  // (orders_active_assignment_required). preparing→ready is assignee-only —
  // the RPC raises 42501 when assigned_preparation_id IS DISTINCT FROM the
  // actor, and a null assignment is distinct from any actor, so the
  // incoherent unassigned row refuses Mark ready.
  {
    status: "preparing",
    assigned: ACTOR,
    expected: { startPreparing: false, markReady: true, cancel: true },
  },
  {
    status: "preparing",
    assigned: COLLEAGUE,
    expected: { startPreparing: false, markReady: false, cancel: true },
  },
  {
    status: "preparing",
    assigned: null,
    expected: { startPreparing: false, markReady: false, cancel: true },
  },

  // `ready`: display-only on the tablet — completion is admin-only in the
  // separate web app, there is no ready→preparing path, and preparation
  // cannot cancel a ready order (K1004). Assignment never matters.
  { status: "ready", assigned: ACTOR, expected: NOTHING },
  { status: "ready", assigned: COLLEAGUE, expected: NOTHING },
  { status: "ready", assigned: null, expected: NOTHING },

  // Terminal: the RPC refuses everything with K1004 "already final" before any
  // branch runs. cancelled is the one terminal status whose assignment is
  // unconstrained server-side, so all three of its rows are reachable.
  { status: "completed", assigned: ACTOR, expected: NOTHING },
  { status: "completed", assigned: COLLEAGUE, expected: NOTHING },
  { status: "completed", assigned: null, expected: NOTHING },
  { status: "cancelled", assigned: ACTOR, expected: NOTHING },
  { status: "cancelled", assigned: COLLEAGUE, expected: NOTHING },
  { status: "cancelled", assigned: null, expected: NOTHING },
];

/** How the assignment reads from the actor's perspective. */
function assignmentLabel(assigned: string | null): string {
  if (assigned === null) return "unassigned";
  return assigned === ACTOR ? "you" : "another employee";
}

/** The expectation rendered for the test name, e.g. "start ✗ ready ✗ cancel ✓". */
function flags(expected: ExpectedActions): string {
  const mark = (allowed: boolean) => (allowed ? "✓" : "✗");
  return `start ${mark(expected.startPreparing)} ready ${mark(expected.markReady)} cancel ${mark(expected.cancel)}`;
}

describe("the migration-08 action matrix (status × assignment)", () => {
  for (const { status, assigned, expected } of MATRIX) {
    it(`${status} / ${assignmentLabel(assigned)} → ${flags(expected)}`, () => {
      const order: OrderActionOrder = { status, assigned_preparation_id: assigned };

      expect(canStartPreparing(order)).toBe(expected.startPreparing);
      expect(canMarkReady(order, ACTOR)).toBe(expected.markReady);
      expect(canCancel(order)).toBe(expected.cancel);
      // The one-call convenience must agree with the three rules — it exists
      // so the screens consume a single eligibility source, and can never
      // drift from the individual functions.
      expect(allowedOrderActions(order, ACTOR)).toEqual(expected);
    });
  }
});

describe("canCancel — the assignment-independent rule", () => {
  it("a colleague's preparing order is cancel-eligible: cancellation is NOT assignment-restricted", () => {
    // The Lead-confirmed contract fact, pinned beyond the matrix row: the
    // RPC's cancel branch checks only `status in ('new','preparing')` for the
    // preparation role — no assignee check — so any active preparation
    // employee may cancel any eligible order, including one assigned to a
    // colleague.
    const colleaguesOrder: OrderActionOrder = {
      status: "preparing",
      assigned_preparation_id: COLLEAGUE,
    };

    expect(canCancel(colleaguesOrder)).toBe(true);
  });
});

describe("totality beyond the enum", () => {
  it("a foreign status affords nothing — grants are positive status matches, never exclusions", () => {
    // OrderStatus is a closed union, so typed callers cannot pass a foreign
    // status; this loosely-typed row guards a future server-side enum
    // widening and pins the implementation shape: each rule grants by
    // positive status match. An exclusion-based canCancel ("anything but
    // ready/completed/cancelled") would pass the matrix above and fail here.
    const foreign: OrderActionOrder = {
      status: "suspended" as unknown as OrderStatus,
      assigned_preparation_id: ACTOR,
    };

    expect(canStartPreparing(foreign)).toBe(false);
    expect(canMarkReady(foreign, ACTOR)).toBe(false);
    expect(canCancel(foreign)).toBe(false);
    expect(allowedOrderActions(foreign, ACTOR)).toEqual(NOTHING);
  });
});
