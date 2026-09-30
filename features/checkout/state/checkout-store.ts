import * as Crypto from "expo-crypto";
import { create } from "zustand";

import { isAppError, type AppError } from "@/core/errors";
import { createLogger } from "@/core/logging";
import { storage, storageKey, type JsonStorage } from "@/core/storage";
import {
  clearCartAfterOrder,
  hydrateCart,
  lockCart,
  unlockCart,
  type CartLine,
} from "@/features/cart";

import { submitOrder, type SubmitOrderInput } from "../api/submit-order";
import type { CreateOrderResponse } from "../model/create-order-response.schema";
import { normalizeCartLines } from "../model/normalized-request";
import {
  savedCheckoutSchema,
  type ConfirmedOrder,
  type PendingOrder,
  type SavedCheckout,
} from "../model/pending-order.schema";

const log = createLogger("checkout.store");

const STORAGE_KEY = storageKey("checkout", "order");

/**
 * - `idle`: reviewing the cart.
 * - `submitting`: the order request is on its way (or being re-sent).
 * - `unknown`: the request may have reached the store, but no answer came
 *   back. The same request is kept and re-sent, so it can never become a
 *   second order.
 * - `conflict`: the store answered that some quantities are no longer
 *   available. No order was placed.
 * - `failure`: the store answered with an error. No order was placed.
 * - `confirmed`: the store confirmed the order.
 */
export type CheckoutPhase =
  | "idle"
  | "submitting"
  | "unknown"
  | "conflict"
  | "failure"
  | "confirmed";

export type StockConflictItem = Extract<
  CreateOrderResponse,
  { kind: "stock_conflict" }
>["conflicts"][number];

export type CheckoutFailure = { title: string; message: string; retryable: boolean };

export type CheckoutState = {
  /** The profile whose saved checkout has been read; null until then. */
  ownerId: string | null;
  ready: boolean;
  phase: CheckoutPhase;
  pending: PendingOrder | null;
  confirmed: ConfirmedOrder | null;
  /** The last stock conflict; kept after returning to the cart so lines can show it. */
  conflicts: StockConflictItem[] | null;
  failure: CheckoutFailure | null;
  /** Read this customer's saved checkout and resume it. Safe to call repeatedly. */
  recover: (ownerId: string) => Promise<void>;
  /** Place a new order from the cart. */
  submit: (lines: CartLine[]) => Promise<void>;
  /** Re-send the pending order with the same request id. */
  retry: () => Promise<void>;
  /** Leave a conflict or failure and go back to editing the cart. */
  backToCart: () => void;
  /** The customer is done with the confirmation; start fresh. */
  finish: () => Promise<void>;
};

type Deps = {
  newRequestId: () => string;
  submit: (input: SubmitOrderInput) => Promise<CreateOrderResponse>;
};

const defaultDeps: Deps = {
  newRequestId: () => Crypto.randomUUID(),
  submit: submitOrder,
};

/**
 * Which errors prove the store did NOT place the order. Network failures and
 * unexpected errors are ambiguous — the order may exist — and so is a
 * response that failed validation. Everything else is the server's own
 * definite answer.
 */
function isDefinite(error: unknown): error is AppError {
  if (!isAppError(error)) return false;
  if (error.kind === "network" || error.kind === "unknown") return false;
  if (error.kind === "server" && error.code === "RPC_SCHEMA_MISMATCH") return false;
  return true;
}

/**
 * For a request that may ALREADY have been placed (an earlier attempt had no
 * answer, or it was resumed after a restart), only an error `create_order`
 * raises from its payload or after its duplicate check proves no order exists
 * under this id. A server, session or role failure is raised before that
 * check, so it says nothing about the earlier attempt.
 */
function provesNoOrder(error: AppError): boolean {
  return (
    error.kind === "validation" ||
    error.kind === "unavailable" ||
    error.kind === "idempotency-conflict"
  );
}

function failureFor(error: AppError): CheckoutFailure {
  if (error.kind === "idempotency-conflict") {
    return {
      title: "Please check with staff",
      message:
        "This order may already have been placed. Please ask a member of staff before ordering again.",
      retryable: false,
    };
  }
  if (error.kind === "unavailable") {
    return {
      title: "Some items are no longer available",
      message: "Please review your cart and try again.",
      retryable: false,
    };
  }
  return {
    title: "Your order wasn't sent",
    message: error.userMessage,
    retryable: error.retryable,
  };
}

/**
 * Checkout: one saved record (`pending` or `confirmed`) and the phase the
 * screens render.
 *
 * The duplicate-order guarantee, end to end:
 * 1. a new order gets a fresh `client_request_id`;
 * 2. the id and the exact items are saved BEFORE the first request;
 * 3. an ambiguous result keeps them — and once a request may have been
 *    placed, only an answer proving no order exists under its id ends it;
 * 4. every retry — including after a restart — re-sends the SAME id and
 *    items, which `create_order` deduplicates server-side;
 * 5. the cart is cleared only after the server confirms.
 *
 * Everything else — authorization, stock, idempotency, snapshots — is the
 * server's job; this store does not re-check it.
 */
export function createCheckoutStore(backend: JsonStorage = storage, deps: Deps = defaultDeps) {
  return create<CheckoutState>((set, get) => {
    // One request at a time: a double tap or an overlapping retry is ignored.
    // `starting` spans the save that precedes the first send, so a second
    // press during that write cannot mint a second request id.
    let sending = false;
    let starting = false;
    // The request id that may already have reached the store: set once an
    // attempt ends without an answer, or when a saved request is resumed.
    let maybePlaced: string | null = null;
    let recovery: { ownerId: string; done: Promise<void> } | null = null;

    const save = (record: SavedCheckout) => backend.write(STORAGE_KEY, record);

    const discard = async (reason: string) => {
      const removed = await backend.remove(STORAGE_KEY);
      if (removed.status === "rejected") {
        log.warn("Could not remove the saved checkout record", { reason });
      }
    };

    /** Apply the store's answer to `pending`, unless another order has taken its place. */
    const resolve = async (pending: PendingOrder, response: CreateOrderResponse) => {
      if (get().pending?.requestId !== pending.requestId) return;

      if (response.kind === "stock_conflict") {
        await discard("stock conflict");
        unlockCart();
        set({ phase: "conflict", pending: null, conflicts: response.conflicts, failure: null });
        return;
      }

      const confirmed: ConfirmedOrder = {
        version: 1,
        state: "confirmed",
        ownerId: pending.ownerId,
        success: {
          orderId: response.order_id,
          displayNumber: response.display_number,
          createdAt: response.created_at,
        },
        lineSnapshots: pending.lineSnapshots,
      };
      // If this write fails the pending record stays on disk, which is safe:
      // a restart re-sends the same id and the server answers with this order.
      const written = await save(confirmed);
      if (written.status === "rejected") log.warn("Could not save the confirmed order record");
      set({ phase: "confirmed", pending: null, confirmed, conflicts: null, failure: null });
      await clearCartAfterOrder();
      unlockCart();
    };

    const send = async (pending: PendingOrder) => {
      if (sending) return;
      sending = true;
      set({ phase: "submitting", failure: null });
      try {
        const response = await deps.submit({
          clientRequestId: pending.requestId,
          items: pending.items,
        });
        await resolve(pending, response);
      } catch (error) {
        if (get().pending?.requestId !== pending.requestId) return;
        const definite =
          isDefinite(error) && (maybePlaced !== pending.requestId || provesNoOrder(error));
        if (definite) {
          await discard("definite failure");
          unlockCart();
          set({ phase: "failure", pending: null, failure: failureFor(error) });
        } else {
          log.warn("Order result unknown; keeping the request to re-send");
          maybePlaced = pending.requestId;
          set({ phase: "unknown" });
        }
      } finally {
        sending = false;
      }
    };

    const load = async (ownerId: string) => {
      // The cart must be restored before it can be locked or cleared.
      await hydrateCart(ownerId);
      const result = await backend.read(STORAGE_KEY, (raw) => savedCheckoutSchema.parse(raw));
      if (get().ownerId !== ownerId) return;

      if (result.status === "miss") {
        set({ ready: true });
        return;
      }
      if (result.status === "rejected" || result.value.ownerId !== ownerId) {
        // Unreadable, or another customer's: it cannot be resumed by this
        // profile (the server ties a request to its actor), so start clean.
        log.info("Discarding a saved checkout record this session cannot resume", {
          reason: result.status === "rejected" ? "unreadable" : "different customer",
        });
        await discard("unusable record");
        set({ ready: true });
        return;
      }

      const record = result.value;
      if (record.state === "confirmed") {
        // Finish what a restart may have interrupted: the cart clear.
        await clearCartAfterOrder();
        set({ ready: true, phase: "confirmed", confirmed: record });
        return;
      }
      // It may have been sent before the restart.
      maybePlaced = record.requestId;
      lockCart();
      set({ ready: true, pending: record });
      await send(record);
    };

    /**
     * Turn the cart into a pending order and save it. Null when nothing may
     * be sent — the phase already says why.
     */
    const prepare = async (ownerId: string, lines: CartLine[]): Promise<PendingOrder | null> => {
      let items;
      try {
        items = normalizeCartLines(lines);
      } catch {
        set({
          phase: "failure",
          failure: {
            title: "Too many different selections",
            message:
              "One order can include up to 100 different options. Remove a few and try again.",
            retryable: false,
          },
        });
        return null;
      }

      const next: PendingOrder = {
        version: 1,
        state: "pending",
        ownerId,
        requestId: deps.newRequestId(),
        items,
        lineSnapshots: lines,
      };
      // Saved BEFORE the request: without it a lost response could not be
      // re-sent under the same id, so nothing is sent if the save fails.
      const written = await save(next);
      if (written.status === "rejected") {
        set({
          phase: "failure",
          failure: {
            title: "Your order wasn't sent",
            message: "This tablet couldn't prepare your order. Please try again.",
            retryable: true,
          },
        });
        return null;
      }
      lockCart();
      set({ pending: next, conflicts: null });
      return next;
    };

    return {
      ownerId: null,
      ready: false,
      phase: "idle",
      pending: null,
      confirmed: null,
      conflicts: null,
      failure: null,

      recover: (ownerId) => {
        if (recovery?.ownerId === ownerId) return recovery.done;
        set({
          ownerId,
          ready: false,
          phase: "idle",
          pending: null,
          confirmed: null,
          conflicts: null,
          failure: null,
        });
        const done = load(ownerId).catch((error: unknown) => {
          log.error("Checkout recovery failed", { error: String(error) });
          set({ ready: true });
        });
        recovery = { ownerId, done };
        return done;
      },

      submit: async (lines) => {
        const { ready, phase, pending, ownerId } = get();
        if (!ready || !ownerId || pending || sending || starting) return;
        if (phase !== "idle" && phase !== "failure" && phase !== "conflict") return;
        starting = true;
        let next: PendingOrder | null;
        try {
          next = await prepare(ownerId, lines);
        } finally {
          starting = false;
        }
        if (next) await send(next);
      },

      retry: async () => {
        const { pending, phase } = get();
        if (!pending || phase !== "unknown") return;
        await send(pending);
      },

      backToCart: () => {
        const { phase } = get();
        if (phase !== "conflict" && phase !== "failure") return;
        set({ phase: "idle", failure: null });
      },

      finish: async () => {
        if (get().phase !== "confirmed") return;
        await discard("finished");
        set({ phase: "idle", confirmed: null });
      },
    };
  });
}

export const useCheckoutStore = createCheckoutStore();
