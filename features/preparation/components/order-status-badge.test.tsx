import type { OrderStatus } from "../model/store-day";
import { OrderStatusBadge, orderStatusLabel } from "./order-status-badge";

import { renderWithProviders, screen } from "@/core/testing";

/**
 * The status → label + variant mapping is this component's entire contract
 * (AC-03/AC-07/AC-08 support: the status is communicated in words, never by
 * colour alone).
 *
 * Label: asserted through the rendered text — the badge text IS the accessible
 * name of the badge.
 *
 * Variant: asserted through the Badge View's `className` prop — the composition
 * input the design names ("bg-secondary", "bg-primary", …). That is the
 * variant mapping this component owns. It is NOT an assertion on NativeWind's
 * resolved styles, which are brittle and test nothing a customer notices
 * (see .claude/rules/tests.md).
 */
const STATUS_CASES: readonly {
  status: OrderStatus;
  label: string;
  /** The Badge variant's distinguishing token class for this status. */
  variantClass: string;
}[] = [
  { status: "new", label: "New", variantClass: "bg-secondary" },
  { status: "preparing", label: "Preparing", variantClass: "bg-primary" },
  { status: "ready", label: "Ready", variantClass: "bg-success" },
  { status: "completed", label: "Completed", variantClass: "bg-transparent" },
  { status: "cancelled", label: "Cancelled", variantClass: "bg-destructive" },
];

describe("orderStatusLabel", () => {
  it("exposes the badge's own label for composing accessible names elsewhere", () => {
    // One representative mapping: the render tests above pin the whole table
    // (the badge renders through this function), so this only pins the export
    // surface the order card's accessible name consumes.
    expect(orderStatusLabel("preparing")).toBe("Preparing");
  });
});

describe("OrderStatusBadge", () => {
  it.each([...STATUS_CASES])(
    "shows the $label status for a $status order",
    async ({ status, label, variantClass }) => {
      await renderWithProviders(<OrderStatusBadge status={status} />);

      // The text label is always present — colour never carries the status
      // alone, and the badge text is its accessible name.
      expect(screen.getByText(label)).toBeOnTheScreen();

      // The Badge variant the design maps this status to, observed on the
      // Badge View's className (the composition input, not resolved styles).
      const badgeView = screen.getByText(label).parent;
      expect(badgeView?.props.className).toContain(variantClass);
    },
  );
});
