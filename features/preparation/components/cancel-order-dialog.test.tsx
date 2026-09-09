import { CancelOrderDialog } from "./cancel-order-dialog";

import { renderWithProviders, screen, userEvent } from "@/core/testing";

/**
 * AC-06's confirmation half: cancelling an order asks a destructive question
 * first, states what cancelling does, and hands the decision to the screen.
 *
 * The dialog is presentational (the repo's component convention — plan
 * decision 4 governs the copy): it composes the shared
 * ConfirmDialog, never calls the mutation itself, and never renders error
 * state — the screen (T11/T13) owns the mutation, `open`, and the
 * rejected-transition refresh (T05-R02). What this test pins is the callback
 * contract, the destructive copy, and the busy pass-through.
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
        screen.getByText(
          "This cancels the order and returns its items to stock. This cannot be undone.",
        ),
      ).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Cancel order" })).toBeOnTheScreen();
      // "Keep order", not "Cancel" — a Cancel button inside a cancel dialog is
      // ambiguous about which meaning of the word applies.
      expect(screen.getByRole("button", { name: "Keep order" })).toBeOnTheScreen();
    });
  });

  describe("the decision", () => {
    it("reports a confirm press with the order and leaves closing to the screen", async () => {
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

      // The ORDER, never the press event — the screen calls the mutation.
      expect(onCancelOrder).toHaveBeenCalledTimes(1);
      expect(onCancelOrder).toHaveBeenCalledWith(ORDER);
      // Confirm does not close the dialog: the pending state must stay
      // visible until the mutation settles and the screen closes on success.
      expect(onOpenChange).not.toHaveBeenCalled();
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
    it("disables both buttons, swaps the confirm label to Working…, and ignores presses", async () => {
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
      // accessible name is the pending one (ConfirmDialog's busy convention).
      const confirm = screen.getByRole("button", { name: "Working…" });
      expect(confirm).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
      expect(screen.getByRole("button", { name: "Keep order" })).toBeDisabled();

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
