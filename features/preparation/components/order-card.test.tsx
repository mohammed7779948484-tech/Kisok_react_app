import type { ActiveOrderRow } from "../api/fetch-active-orders";
import { OrderCard } from "./order-card";

import { renderWithProviders, screen, userEvent } from "@/core/testing";

/**
 * AC-03: the order card's whole observable contract — content hierarchy, the
 * assignment indicator, action visibility per T07's rules, the card-press that
 * opens details, and the read-only mode history reuses.
 *
 * The card is presentational: props go straight in, NOTHING is mocked, and the
 * assertions go through roles, labels and text — never styles.
 *
 * The action matrix cases (which buttons a status/assignment combination may
 * offer) mirror the T07 model tests; they live here again because a button the
 * card fails to RENDER is a different defect from an eligibility rule that is
 * wrong, and both would hurt on the board.
 */

/** The signed-in employee, and a colleague to be assigned against. */
const ACTOR_ID = "3d0e9c14-64e8-4b6b-9d55-1f7d2a9c0e88";
const COLLEAGUE_ID = "9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d";

/** One item row — the migration-07 snapshot shape, `{type, value}` options. */
function makeItem(id: string, variantSku: string): ActiveOrderRow["order_items"][number] {
  return {
    id,
    order_id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
    product_id: "d1e2f3a4-5b6c-4d7e-8f9a-0b1c2d3e4f5a",
    variant_id: "e2f3a4b5-6c7d-4e8f-9a0b-1c2d3e4f5a6b",
    product_name: "Single Origin Coffee",
    variant_name: "250g · Whole Bean",
    variant_sku: variantSku,
    variant_options: [{ type: "Grind", value: "Whole bean" }],
    brand_name: "Kisok Roasters",
    image_public_id: null,
    image_secure_url: null,
    quantity: 2,
  };
}

/**
 * A minimal board-shaped order row, the T02 api-test fixture shape. Defaults to
 * the board's entry point: a NEW, unassigned order with one item.
 */
function makeOrder(overrides: Partial<ActiveOrderRow> = {}): ActiveOrderRow {
  return {
    id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
    display_number: "AB2CD4",
    client_request_id: "0d4a9d2e-7f3b-4c5a-8e6f-1a2b3c4d5e6f",
    request_fingerprint: "8f2b1c0d4e6a",
    status: "new",
    created_by: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    assigned_preparation_id: null,
    completed_by: null,
    completed_at: null,
    cancelled_by: null,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: "2026-08-26T05:00:08.123456+00:00",
    updated_at: "2026-08-26T05:01:41.000000+00:00",
    order_items: [makeItem("c7d8e9f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f", "SO-250G-WB")],
    ...overrides,
  };
}

/** Assert an action button's presence or absence, with a readable failure. */
function expectAction(name: string, expected: boolean) {
  if (expected) {
    expect(screen.getByRole("button", { name })).toBeOnTheScreen();
  } else {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }
}

describe("OrderCard content", () => {
  it("shows the display number, created time, item summary and status of a new order", async () => {
    await renderWithProviders(
      <OrderCard
        order={makeOrder()}
        actorPreparationId={ACTOR_ID}
        createdAtLabel="10:24"
        itemSummaryLabel="2 × Single Origin Coffee · Whole bean"
      />,
    );

    expect(screen.getByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.getByText("10:24")).toBeOnTheScreen();
    expect(screen.getByText("2 × Single Origin Coffee · Whole bean")).toBeOnTheScreen();
    expect(screen.getByText("New")).toBeOnTheScreen();
    // A new order is unassigned — no assignment indicator either way.
    expect(screen.queryByText("You")).toBeNull();
    expect(screen.queryByText("Assigned to another employee")).toBeNull();
  });

  it("falls back to a plain item count when the screen passes no summary label", async () => {
    const oneItem = await renderWithProviders(
      <OrderCard order={makeOrder()} actorPreparationId={ACTOR_ID} />,
    );
    expect(screen.getByText("1 item")).toBeOnTheScreen();
    // unmount is async in RNTL v14 — a synchronous call leaves overlapping act
    // scopes that corrupt every render after it (the realtime-test precedent).
    await oneItem.unmount();

    const twoItems = makeOrder({
      order_items: [
        makeItem("c7d8e9f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f", "SO-250G-WB"),
        makeItem("d8e9f0a1-2b3c-4d5e-8f9a-6a7b8c9d0e2f", "SO-250G-GR"),
      ],
    });
    await renderWithProviders(<OrderCard order={twoItems} actorPreparationId={ACTOR_ID} />);
    expect(screen.getByText("2 items")).toBeOnTheScreen();
  });

  it("marks the order as yours when it is assigned to the signed-in employee", async () => {
    const order = makeOrder({ status: "preparing", assigned_preparation_id: ACTOR_ID });
    await renderWithProviders(<OrderCard order={order} actorPreparationId={ACTOR_ID} />);

    expect(screen.getByText("You")).toBeOnTheScreen();
    expect(screen.queryByText("Assigned to another employee")).toBeNull();
  });

  it("marks the order as another employee's when it is assigned to a colleague", async () => {
    const order = makeOrder({ status: "preparing", assigned_preparation_id: COLLEAGUE_ID });
    await renderWithProviders(<OrderCard order={order} actorPreparationId={ACTOR_ID} />);

    expect(screen.getByText("Assigned to another employee")).toBeOnTheScreen();
    expect(screen.queryByText("You")).toBeNull();
  });
});

describe("OrderCard actions", () => {
  // The T07 affordance matrix, observed through which buttons actually render.
  // Every callback is wired in every case, so a missing button is always an
  // eligibility decision, never a missing prop.
  const ACTION_CASES: readonly {
    stake: string;
    order: ActiveOrderRow;
    start: boolean;
    ready: boolean;
    cancel: boolean;
  }[] = [
    {
      stake: "an unassigned new order",
      order: makeOrder(),
      start: true,
      ready: false,
      cancel: true,
    },
    {
      stake: "a preparing order assigned to the actor",
      order: makeOrder({ status: "preparing", assigned_preparation_id: ACTOR_ID }),
      start: false,
      ready: true,
      cancel: true,
    },
    {
      stake: "a preparing order assigned to a colleague",
      order: makeOrder({ status: "preparing", assigned_preparation_id: COLLEAGUE_ID }),
      start: false,
      ready: false,
      cancel: true,
    },
    {
      stake: "a ready order",
      order: makeOrder({ status: "ready", assigned_preparation_id: ACTOR_ID }),
      start: false,
      ready: false,
      cancel: false,
    },
  ];

  it.each([...ACTION_CASES])(
    "offers the allowed actions for $stake",
    async ({ order, start, ready, cancel }) => {
      await renderWithProviders(
        <OrderCard
          order={order}
          actorPreparationId={ACTOR_ID}
          onStartPreparing={jest.fn()}
          onMarkReady={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      expectAction("Start Preparing", start);
      expectAction("Mark Ready", ready);
      expectAction("Cancel", cancel);
    },
  );

  it("hides every action in read-only mode even when the order is eligible", async () => {
    // A new order would otherwise offer Start Preparing and Cancel.
    await renderWithProviders(
      <OrderCard
        order={makeOrder()}
        actorPreparationId={ACTOR_ID}
        readOnly
        onStartPreparing={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders no button for an affordance whose callback the screen did not wire", async () => {
    // Mark Ready is granted and wired; Cancel is granted but has no callback.
    const order = makeOrder({ status: "preparing", assigned_preparation_id: ACTOR_ID });
    await renderWithProviders(
      <OrderCard order={order} actorPreparationId={ACTOR_ID} onMarkReady={jest.fn()} />,
    );

    expectAction("Mark Ready", true);
    expectAction("Cancel", false);
  });
});

describe("OrderCard interactions", () => {
  it("reports Start Preparing with the order, without opening details", async () => {
    const onStartPreparing = jest.fn();
    const onPress = jest.fn();
    const order = makeOrder();
    const user = userEvent.setup();

    await renderWithProviders(
      <OrderCard
        order={order}
        actorPreparationId={ACTOR_ID}
        onStartPreparing={onStartPreparing}
        onCancel={jest.fn()}
        onPress={onPress}
      />,
    );

    await user.press(screen.getByRole("button", { name: "Start Preparing" }));

    expect(onStartPreparing).toHaveBeenCalledTimes(1);
    expect(onStartPreparing).toHaveBeenCalledWith(order);
    // An action press is not a card press — details must not open.
    expect(onPress).not.toHaveBeenCalled();
  });

  it("opens details with the order when the card body is pressed", async () => {
    const onPress = jest.fn();
    const order = makeOrder();
    const user = userEvent.setup();

    await renderWithProviders(
      <OrderCard order={order} actorPreparationId={ACTOR_ID} onPress={onPress} />,
    );

    await user.press(screen.getByRole("button", { name: "Order AB2CD4, New" }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(order);
  });

  it("carries the display number, status and assignment in the card's accessible name", async () => {
    const order = makeOrder({ status: "preparing", assigned_preparation_id: COLLEAGUE_ID });
    await renderWithProviders(
      <OrderCard order={order} actorPreparationId={ACTOR_ID} onPress={jest.fn()} />,
    );

    // The status word comes from T08's label mapping (the same words the badge
    // renders), so the name and the badge can never drift apart.
    expect(
      screen.getByRole("button", { name: "Order AB2CD4, Preparing, assigned to another employee" }),
    ).toBeOnTheScreen();
  });

  it("says assigned to you in the accessible name when the order is the actor's", async () => {
    const order = makeOrder({ status: "preparing", assigned_preparation_id: ACTOR_ID });
    await renderWithProviders(
      <OrderCard order={order} actorPreparationId={ACTOR_ID} onPress={jest.fn()} />,
    );

    expect(
      screen.getByRole("button", { name: "Order AB2CD4, Preparing, assigned to you" }),
    ).toBeOnTheScreen();
  });
});

describe("OrderCard pending actions", () => {
  /**
   * Plan decision 5's per-card in-flight state: the disabled action + label
   * swap the sign-in-form convention uses. The card renders the state; the
   * screens (T11/T13) drive it from their mutation's pending flag and add
   * their own repeat-tap guard on top — a disabled button already ignores
   * presses.
   */

  it("disables Start Preparing with a pending label and ignores repeat presses", async () => {
    const onStartPreparing = jest.fn();
    const user = userEvent.setup();

    await renderWithProviders(
      <OrderCard
        order={makeOrder()}
        actorPreparationId={ACTOR_ID}
        pendingAction="startPreparing"
        onStartPreparing={onStartPreparing}
        onCancel={jest.fn()}
      />,
    );

    // The label is SWAPPED, not duplicated — the pending label replaces the
    // action's own words, so the button's accessible name is the pending one.
    const startButton = screen.getByRole("button", { name: "Starting…" });
    expect(startButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Start Preparing" })).toBeNull();

    await user.press(startButton);
    expect(onStartPreparing).not.toHaveBeenCalled();

    // Per-card pending is per-ACTION: the other affordance stays enabled,
    // because the screen drives one mutation at a time per card.
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("disables Mark Ready with a pending label and ignores repeat presses", async () => {
    const onMarkReady = jest.fn();
    const order = makeOrder({ status: "preparing", assigned_preparation_id: ACTOR_ID });
    const user = userEvent.setup();

    await renderWithProviders(
      <OrderCard
        order={order}
        actorPreparationId={ACTOR_ID}
        pendingAction="markReady"
        onMarkReady={onMarkReady}
        onCancel={jest.fn()}
      />,
    );

    const markReadyButton = screen.getByRole("button", { name: "Marking ready…" });
    expect(markReadyButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Mark Ready" })).toBeNull();

    await user.press(markReadyButton);
    expect(onMarkReady).not.toHaveBeenCalled();

    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("disables Cancel with a pending label when the cancel mutation is in flight", async () => {
    // Cancel's pending normally lives in T10's dialog, but the affordance set
    // is total — the card must render any of the three as pending.
    await renderWithProviders(
      <OrderCard
        order={makeOrder()}
        actorPreparationId={ACTOR_ID}
        pendingAction="cancel"
        onStartPreparing={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Cancelling…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    // The other affordance is untouched.
    expect(screen.getByRole("button", { name: "Start Preparing" })).toBeEnabled();
  });
});

describe("OrderCard read-only mode", () => {
  it("renders a terminal history row as plain display with no interactive elements", async () => {
    // The shape history feeds the card: terminal status, read-only, no press
    // handler, no callbacks.
    const order = makeOrder({ status: "cancelled", assigned_preparation_id: ACTOR_ID });
    await renderWithProviders(<OrderCard order={order} actorPreparationId={ACTOR_ID} readOnly />);

    // No card button (no Pressable wrapper) and no action buttons.
    expect(screen.queryByRole("button")).toBeNull();
    // The content is still there — a history row is a display row.
    expect(screen.getByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.getByText("Cancelled")).toBeOnTheScreen();
    expect(screen.getByText("You")).toBeOnTheScreen();
  });
});
