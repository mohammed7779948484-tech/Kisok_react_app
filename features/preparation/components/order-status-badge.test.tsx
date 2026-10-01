import { renderWithProviders, screen } from "@/core/testing";

import type { OrderStatus } from "../model/store-day";
import { OrderStatusBadge, orderStatusLabel } from "./order-status-badge";

/**
 * A status is always communicated in words, never by colour alone
 * (AC-03/AC-07/AC-08 support). The word is this component's contract; its
 * tone classes are design detail and deliberately not asserted here
 * (see .claude/rules/tests.md).
 */
const STATUS_CASES: readonly { status: OrderStatus; label: string }[] = [
  { status: "new", label: "New" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "completed", label: "Completed" },
  { status: "cancelled", label: "Cancelled" },
];

describe("orderStatusLabel", () => {
  it.each([...STATUS_CASES])("names a $status order $label", ({ status, label }) => {
    expect(orderStatusLabel(status)).toBe(label);
  });
});

describe("OrderStatusBadge", () => {
  it.each([...STATUS_CASES])(
    "shows the $label status for a $status order",
    async ({ status, label }) => {
      await renderWithProviders(<OrderStatusBadge status={status} />);

      expect(screen.getByText(label)).toBeOnTheScreen();
    },
  );

  it("shows only its own status word", async () => {
    await renderWithProviders(<OrderStatusBadge status="ready" />);

    for (const other of STATUS_CASES.filter((c) => c.status !== "ready")) {
      expect(screen.queryByText(other.label)).not.toBeOnTheScreen();
    }
  });
});
