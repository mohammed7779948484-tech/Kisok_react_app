import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { CancelOrderDialog } from "./cancel-order-dialog";

/**
 * AC-06's confirmation half: cancelling an order asks a destructive question
 * first, states what cancelling does, offers an optional one-tap reason, and
 * hands the decision to the screen.
 *
 * The dialog is presentational: it never calls the mutation itself and never
 * renders error state — the screen owns the mutation, `open`, and the
 * rejected-transition refresh. What this test pins is the callback contract
 * (with or without a reason), the destructive copy, and the busy pass-through.
 */

/** The minimal target shape — a board order is structurally this. */
const ORDER = { display_number: "AB2CD4" };

describe("CancelOrderDialog", () => {
  describe("confirmation copy", () => {
    it("asks the destructive question and states what cancelling does", async () => {
      await renderWithProviders(
        <CancelOrderDialog open order={ORDER} onOpenChange={jest.fn()} onCancelOrder={jest.fn()} />,
      );

      expect(screen.getByText("Cancel order AB2CD4?")).toBeOnTheScreen();
      expect(
        screen.getByText("Its items go back to stock. This can’t be undone."),
      ).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Cancel order" })).toBeOnTheScreen();
      // "Keep order", not "Cancel" — a Cancel button inside a cancel dialog is
      // ambiguous about which meaning of the word applies.
      expect(screen.getByRole("button", { name: "Keep order" })).toBeOnTheScreen();
    });
  });

  describe("the decision", () => {
    it("reports a confirm press with no reason and leaves closing to the screen", async () => {
      const onCancelOrder = jest.fn();
      const onOpenChange = jest.fn();
      const user = userEvent.setup();

      await renderWithProviders(
        <CancelOrderDialog
          open
          order={ORDER}
          onOpenChange={onOpenChange}
          onCancelOrder={onCancelOrder}
        />,
      );

      await user.press(screen.getByRole("button", { name: "Cancel order" }));

      // No reason was chosen — and never the press event leaking through.
      expect(onCancelOrder).toHaveBeenCalledTimes(1);
      expect(onCancelOrder).toHaveBeenCalledWith(undefined);
      // Confirm does not close the dialog: the pending state must stay
      // visible until the mutation settles and the screen closes on success.
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("passes the chosen reason with the confirm press", async () => {
      const onCancelOrder = jest.fn();
      const user = userEvent.setup();

      await renderWithProviders(
        <CancelOrderDialog
          open
          order={ORDER}
          onOpenChange={jest.fn()}
          onCancelOrder={onCancelOrder}
        />,
      );

      const outOfStock = screen.getByRole("radio", { name: "Out of stock" });
      expect(outOfStock).not.toBeChecked();
      await user.press(outOfStock);
      expect(screen.getByRole("radio", { name: "Out of stock" })).toBeChecked();

      await user.press(screen.getByRole("button", { name: "Cancel order" }));

      expect(onCancelOrder).toHaveBeenCalledTimes(1);
      expect(onCancelOrder).toHaveBeenCalledWith("Out of stock");
    });

    it("offers the reasons as a single choice that can be changed or cleared", async () => {
      const onCancelOrder = jest.fn();
      const user = userEvent.setup();

      await renderWithProviders(
        <CancelOrderDialog
          open
          order={ORDER}
          onOpenChange={jest.fn()}
          onCancelOrder={onCancelOrder}
        />,
      );

      for (const reason of ["Out of stock", "Customer left", "Duplicate order", "Damaged item"]) {
        expect(screen.getByRole("radio", { name: reason })).toBeOnTheScreen();
      }

      await user.press(screen.getByRole("radio", { name: "Customer left" }));
      await user.press(screen.getByRole("radio", { name: "Damaged item" }));
      expect(screen.getByRole("radio", { name: "Customer left" })).not.toBeChecked();
      expect(screen.getByRole("radio", { name: "Damaged item" })).toBeChecked();

      // Pressing the chosen reason again clears it — the reason is optional.
      await user.press(screen.getByRole("radio", { name: "Damaged item" }));
      expect(screen.getByRole("radio", { name: "Damaged item" })).not.toBeChecked();

      await user.press(screen.getByRole("button", { name: "Cancel order" }));
      expect(onCancelOrder).toHaveBeenCalledWith(undefined);
    });

    it("forgets a previous reason when the dialog is opened again", async () => {
      const onCancelOrder = jest.fn();
      const user = userEvent.setup();
      const props = { order: ORDER, onOpenChange: jest.fn(), onCancelOrder };

      const view = await renderWithProviders(<CancelOrderDialog open {...props} />);
      await user.press(screen.getByRole("radio", { name: "Duplicate order" }));
      expect(screen.getByRole("radio", { name: "Duplicate order" })).toBeChecked();

      await view.rerender(<CancelOrderDialog open={false} {...props} />);
      await view.rerender(<CancelOrderDialog open {...props} />);

      expect(screen.getByRole("radio", { name: "Duplicate order" })).not.toBeChecked();
    });

    it("dismisses through Keep order without cancelling", async () => {
      const onCancelOrder = jest.fn();
      const onOpenChange = jest.fn();
      const user = userEvent.setup();

      await renderWithProviders(
        <CancelOrderDialog
          open
          order={ORDER}
          onOpenChange={onOpenChange}
          onCancelOrder={onCancelOrder}
        />,
      );

      await user.press(screen.getByRole("button", { name: "Keep order" }));

      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onCancelOrder).not.toHaveBeenCalled();
    });
  });

  describe("pending cancel", () => {
    it("disables every control, swaps the confirm label to Cancelling…, and ignores presses", async () => {
      const onCancelOrder = jest.fn();
      const user = userEvent.setup();

      await renderWithProviders(
        <CancelOrderDialog
          open
          order={ORDER}
          busy
          onOpenChange={jest.fn()}
          onCancelOrder={onCancelOrder}
        />,
      );

      // The label is SWAPPED, not duplicated — while busy the confirm button's
      // accessible name is the pending one.
      const confirm = screen.getByRole("button", { name: "Cancelling…" });
      expect(confirm).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
      expect(screen.getByRole("button", { name: "Keep order" })).toBeDisabled();
      expect(screen.getByRole("radio", { name: "Out of stock" })).toBeDisabled();

      await user.press(confirm);
      expect(onCancelOrder).not.toHaveBeenCalled();
    });
  });

  describe("no target", () => {
    it("renders nothing meaningful when open without an order, or closed with one", async () => {
      // Open with no order: `open` is the screen's, and a dialog with no
      // target has nothing to confirm.
      const openNoTarget = await renderWithProviders(
        <CancelOrderDialog open order={null} onOpenChange={jest.fn()} onCancelOrder={jest.fn()} />,
      );
      expect(screen.queryByText(/Cancel order/)).toBeNull();
      // unmount is async in RNTL v14 — a synchronous call leaves overlapping
      // act scopes that corrupt every render after it (the realtime precedent).
      await openNoTarget.unmount();

      await renderWithProviders(
        <CancelOrderDialog
          open={false}
          order={ORDER}
          onOpenChange={jest.fn()}
          onCancelOrder={jest.fn()}
        />,
      );
      expect(screen.queryByText(/Cancel order/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Keep order" })).toBeNull();
    });
  });
});
