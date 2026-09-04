import * as Crypto from "expo-crypto";
import { create } from "zustand";

import { isAppError, toAppError, type AppError, type AppErrorKind } from "@/core/errors";
import { createLogger } from "@/core/logging";
import {
  storage,
  storageKey,
  type JsonStorage,
  type StorageReadResult,
  type StorageWriteResult,
} from "@/core/storage";
import {
  clearCartDurable,
  hydrateCart,
  lockCart,
  unlockCart,
  type CartLine,
} from "@/features/cart";

import type { CreateOrderResponse } from "../model/create-order-response.schema";
import { checkoutAttemptSchema, type CheckoutAttempt } from "../model/checkout-attempt.schema";
import type { NormalizedOrderItem, NormalizedRequest } from "../model/normalized-request";
import { submitOrder, type SubmitOrderInput } from "../api/submit-order";

const log = createLogger("checkout.attempt");

// Plan decision D1: ONE durable attempt record under ONE key. At most one
// attempt is ever on disk, and the payload itself (T03's schema) carries the
// owner — the restore can always tell whose attempt it is.
const STORAGE_KEY = storageKey("checkout", "attempt");

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Note `persistence`: KISOK deliberately surfaces storage-write failures rather
 * than swallowing them. If a write fails the change is still in memory, but the
 * UI must be able to say so — telling a customer their order attempt is saved
 * when it is not is a correctness bug. This is why the store writes through
 * `@/core/storage` instead of zustand's `persist` middleware, which has no hook
 * for reporting a failed write.
 *
 * For THIS key the honest statuses mean: `persisted` — the in-memory record is
 * exactly what is on disk; `memoryOnly` — a write failed, so the in-memory
 * record is AHEAD of disk (disk may still hold the unresolved record — which
 * is SAFE: a restart replays the same idempotency identity, never a new order);
 * `clearFailed` — a discard failed, so a record that must be GONE still sits on
 * disk and the next restore will trip over it. `memoryOnly` and `clearFailed`
 * must never be collapsed into each other: one is a nuisance, the other is a
 * shared-kiosk safety issue.
 */
export type PersistenceStatus = "unknown" | "persisted" | "memoryOnly" | "clearFailed";

/**
 * The six phases of the checkout state machine (plan D8 — the store is the
 * single phase authority; screens and the recovery gate render THIS machine):
 *
 * - `idle` — review; nothing in flight this session.
 * - `submitting` — a submission (first attempt or replay) is in flight; the UI
 *   is locked against double taps and back navigation (AC-04).
 * - `stock-conflict` — a definite no-order outcome; the cart is preserved
 *   (AC-08).
 * - `unknown` — an unresolved/ambiguous result; a durable record exists and
 *   the cart stays locked (AC-09).
 * - `failed` — a definite failure; the server answered with an exception
 *   (AC-10).
 * - `confirmed` — a server-confirmed order (AC-07/AC-11); the record carries
 *   the success payload and the cleanup tracker.
 */
export type AttemptPhase =
  | "idle"
  | "submitting"
  | "stock-conflict"
  | "unknown"
  | "failed"
  | "confirmed";

/** One stock-conflict entry, exactly the wire shape `create_order` returns. */
export type StockConflictItem = Extract<
  CreateOrderResponse,
  { kind: "stock_conflict" }
>["conflicts"][number];

/** The `kind: "success"` family of the `create_order` response. */
export type OrderSuccessResponse = Extract<CreateOrderResponse, { kind: "success" }>;

/**
 * The ephemeral failure payload for the UI (AC-10) — PLAIN DATA, never an
 * `Error` instance: zustand state must stay serializable and renderable, and a
 * screen must never have to branch on `instanceof`.
 */
export type AttemptFailure = {
  /** The AppError kind of the definite failure — the UI's wording/retry signal. */
  kind: AppErrorKind;
  userMessage: string;
  retryable: boolean;
};

/**
 * What `prepareAttempt` hands back to the submission flow. Failure reasons,
 * in refusal order:
 *
 * - `"recovery-pending"` — the first durable read has not completed this
 *   session (F-06-02): an unresolved record may exist on disk that this
 *   session has never seen, so minting here could overwrite a live
 *   idempotency identity — a possible duplicate order. Mirrors the cart
 *   store's `!hydrated` mutation gate (R-T03R2-01); retry after `recover()`.
 * - `"unresolved-attempt-exists"` — a different logical request is already
 *   in flight; an identity is never silently rebound.
 * - `"confirmed-attempt-present"` — the success flow owns the session until
 *   the Next Customer reset.
 * - `"persist-failed"` — the pre-submit durable write was rejected; the
 *   network call never happens (AC-06), and `error` carries the honest
 *   AppError.
 */
export type PrepareResult =
  | { ok: true; request: { clientRequestId: string; items: NormalizedOrderItem[] } }
  | {
      ok: false;
      reason:
        | "persist-failed"
        | "recovery-pending"
        | "unresolved-attempt-exists"
        | "confirmed-attempt-present";
      error?: AppError;
    };

/** What the submission flow hands to `prepareAttempt`. */
export type PrepareInput = {
  ownerId: string;
  lines: CartLine[];
  normalized: NormalizedRequest;
};

/** The server fields a validated success response contributes (camelCased). */
export type OrderSuccessCapture = {
  orderId: string;
  displayNumber: string;
  createdAt: string;
};

/** What `recover` found on disk — the recovery gate's routing signal (D7). */
export type RecoveryOutcome =
  | "none"
  | "unresolved"
  | "confirmed-cleanup-pending"
  | "confirmed-cleanup-done"
  | "discarded-foreign"
  | "discarded-corrupt";

/**
 * The classified result of ONE submit attempt — the D3 ambiguity boundary in
 * one place, used by BOTH the screen's submission path and the store's
 * recovery replay so they can never disagree about what an outcome means.
 */
export type SubmitOutcome =
  | { kind: "success"; response: OrderSuccessResponse }
  | { kind: "stock-conflict"; conflicts: StockConflictItem[] }
  | { kind: "definite-failure"; error: AppError }
  | { kind: "unknown" };

/**
 * Classify a submit outcome (plan D3 — the ONE ambiguity boundary):
 *
 * - a response is the server ANSWERING: `kind: "success"` → success,
 *   `kind: "stock_conflict"` → conflict (a normal JSON return, no order).
 * - an `AppError` is DEFINITE (the server answered with an exception) for
 *   every kind EXCEPT `network` and `unknown`, which are AMBIGUOUS — the
 *   request never provably reached (or failed to reach) the server.
 * - a non-AppError error is classified `unknown` — fail-safe ambiguous. The
 *   `api/` contract (submit-order.ts) promises every rejection is an AppError;
 *   this classifier deliberately does not trust that promise, because the
 *   cost of wrongly treating an ambiguous result as definite (discarding the
 *   identity, minting a new one — a possible DUPLICATE order) is far higher
 *   than the cost of conservatively holding an attempt unresolved.
 *
 * Pure: no store access, no IO — trivially testable and safe to call from any
 * context.
 */
export function classifySubmitOutcome(result: {
  response?: CreateOrderResponse;
  error?: unknown;
}): SubmitOutcome {
  if (result.response !== undefined) {
    // A response always outranks a simultaneous error: the server answered.
    if (result.response.kind === "success") {
      return { kind: "success", response: result.response };
    }
    return { kind: "stock-conflict", conflicts: result.response.conflicts };
  }
  if (isAppError(result.error)) {
    if (result.error.kind === "network" || result.error.kind === "unknown") {
      return { kind: "unknown" };
    }
    return { kind: "definite-failure", error: result.error };
  }
  return { kind: "unknown" };
}

/**
 * The injectable seams of the attempt lifecycle. Defaults bind the REAL
 * production seams — never the Supabase client and never the cart store
 * directly (plan D13/D5): `submit` is the feature's own api module (the single
 * Supabase door), `clearCart`/`hydrateCart`/`lockCart`/`unlockCart` go through
 * the Cart feature's public API, and `idFactory` is expo-crypto's uuid.
 */
export type AttemptStoreDeps = {
  /** Mints the idempotency identity (client_request_id) before first submit. */
  idFactory: () => string;
  /** The T05 awaitable durable cart clear (plan D5). */
  clearCart: () => Promise<StorageWriteResult>;
  /**
   * The cart's public owner-scoped restore. Awaited BEFORE `clearCart` on
   * every post-confirmation clear (F-06-01): the recovery path (recover →
   * replay → resolveSuccess, and retryCleanup) can reach the clear while the
   * cart's own restore is still in flight — a clear awaited mid-restore
   * resolves honest-on-disk but the restore's apply resurrects the
   * just-cleared lines in memory (the T05 review's carried requirement).
   * Same-owner hydrate is idempotent, so the in-session path is unchanged.
   */
  hydrateCart: (ownerId: string) => Promise<void>;
  /** The single api door for `create_order` (plan D13). */
  submit: (input: SubmitOrderInput) => Promise<CreateOrderResponse>;
  /** Locks user-driven cart edits for the critical operation. */
  lockCart: () => void;
  /** Re-enables user-driven cart edits. */
  unlockCart: () => void;
};

const defaultAttemptDeps: AttemptStoreDeps = {
  // expo-crypto under jest-expo: the generated ExpoCrypto native-module mock
  // stubs `randomUUID()` to return `undefined` (verified by probe during T06 —
  // the mock's own source declares `randomUUID(): any {}`). Referencing it
  // LAZILY through the module namespace inside this factory, instead of a
  // top-level named import, keeps the seam controllable with
  // `jest.mock("expo-crypto")` for the downstream screen suites while
  // production resolves the real native module. This store's own tests always
  // inject a deterministic fake idFactory.
  idFactory: () => Crypto.randomUUID(),
  clearCart: clearCartDurable,
  hydrateCart,
  submit: submitOrder,
  lockCart,
  unlockCart,
};

export type AttemptState = {
  /** The durable payload (T03 schema), null when no attempt exists. */
  record: CheckoutAttempt | null;
  /** `recover()` has completed at least once this session. */
  recordLoaded: boolean;
  /** Write-honesty for the record key (see `PersistenceStatus`). */
  persistence: PersistenceStatus;
  /** The single phase authority (plan D8). */
  phase: AttemptPhase;
  /** Ephemeral conflict payload for the UI (AC-08), plain data. */
  conflict: StockConflictItem[] | null;
  /** Ephemeral failure payload for the UI (AC-10), plain data. */
  failure: AttemptFailure | null;
  prepareAttempt: (input: PrepareInput) => Promise<PrepareResult>;
  resolveSuccess: (response: OrderSuccessCapture) => Promise<void>;
  resolveStockConflict: (conflicts: StockConflictItem[]) => Promise<void>;
  resolveDefiniteFailure: (error: AppError) => Promise<void>;
  resolveUnknown: () => void;
  replayAttempt: () => Promise<void>;
  recover: (ownerId: string) => Promise<RecoveryOutcome>;
  retryCleanup: () => Promise<void>;
  resetForNextCustomer: () => Promise<StorageWriteResult>;
  enterReview: () => void;
};

/**
 * A factory, not a bare `create(...)`, so a test can inject a fake backend AND
 * fake deps instead of the real AsyncStorage singleton, the real cart seam,
 * and the real api module — in particular
 * `createJsonStorage(createMemoryStore({ failOn: "setItem" }))` from
 * `@/core/storage` and `@/core/testing`, which exists specifically to prove
 * the AC-06 invariant: a persistence failure BEFORE the first submit prevents
 * the network call. Real code never passes arguments here; see
 * `useAttemptStore` below.
 */
export function createAttemptStore(
  backend: JsonStorage = storage,
  deps: AttemptStoreDeps = defaultAttemptDeps,
) {
  return create<AttemptState>((set, get) => {
    // ---- ONE serialized durable-operation chain (cart-store precedent) -----
    // Every durable op on STORAGE_KEY — prepare's write, the resolve
    // sequences, the replay, the restore read+discard, the reset remove —
    // runs strictly one at a time, in call order, and an op that throws never
    // breaks the chain. This is what makes the machine safe against the races
    // the lifecycle admits in the wild: a double-tapped prepare waits for the
    // first to settle and then REUSES its record (idempotent, no second id);
    // a replay requested while a resolve is still running lands after it; a
    // `recover()` fired by the recovery gate and not awaited still completes
    // before any later `prepareAttempt` reads state, so the gate's ordering
    // guarantee (D7) holds even without the caller awaiting it.
    let durableChain: Promise<void> = Promise.resolve();
    const runSerialized = <T>(op: () => Promise<T>): Promise<T> => {
      const attempt = () => op();
      const next = durableChain.then(attempt, attempt);
      durableChain = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    };

    /**
     * Read the durable record through the T03 schema. A payload that fails
     * `checkoutAttemptSchema.parse` comes back as a REJECTED result — a
     * corrupt record, never a half-parsed lifecycle decision (JsonStorage
     * already maps its own failures that way; the try/catch mirrors the cart
     * store's belt-and-braces handling of a backend that throws outright).
     */
    const readDurableRecord = async (): Promise<StorageReadResult<CheckoutAttempt>> => {
      try {
        return await backend.read(STORAGE_KEY, (raw) => checkoutAttemptSchema.parse(raw));
      } catch (error) {
        return { status: "rejected", error: asError(error) };
      }
    };

    /** Report a failed write honestly — a standing clearFailed outranks it. */
    const reportWriteFailure = (reason: string) => {
      if (get().persistence === "clearFailed") {
        // The previous record is still on disk — the bigger hazard. Keep the
        // stronger status (docs/state-management.md precedence).
        log.warn(
          "attempt write failed while the durable discard had also failed; keeping clearFailed",
          {
            reason,
          },
        );
        return;
      }
      set({ persistence: "memoryOnly" });
    };

    /**
     * Discard the durable record: a plain remove with an honest result. No
     * fallback overwrite (unlike the cart's clear): any value this store could
     * write under the key IS an attempt record, and writing a deliberately
     * invalid one would just leave the next restore a corrupt blob to trip
     * over. On remove failure the stale record is reported `clearFailed`; a
     * stale UNRESOLVED record is still SAFE — a later replay sends the same
     * id, and `create_order`'s idempotency deduplicates it server-side.
     */
    const discardRecord = async (): Promise<StorageWriteResult> => {
      const removed = await backend.remove(STORAGE_KEY);
      if (removed.status === "persisted") {
        set({ persistence: "persisted" });
        return removed;
      }
      log.error(
        "Failed to durably discard the checkout attempt record; stale data remains on disk",
        {
          key: STORAGE_KEY,
          reason: removed.error.message,
        },
      );
      set({ persistence: "clearFailed" });
      return removed;
    };

    // ---- prepareAttempt (AC-06) ----------------------------------------------
    const applyPrepare = async (input: PrepareInput): Promise<PrepareResult> => {
      // F-06-02: the guards below read the IN-MEMORY record. Until the first
      // durable read has completed (`recordLoaded`), an unresolved record can
      // be sitting on disk that this session has never seen — minting here
      // would OVERWRITE that stale identity, and if its ambiguous submission
      // actually landed server-side, the new submission creates a second
      // order. Mirrors the cart store's `!hydrated` mutation gate (R-T03R2-01):
      // refuse until recovery has completed. The plan's risk table words the
      // invariant as "any new submission is refused while an unresolved record
      // exists" — this makes it true against DISK, not just memory, without
      // resting on caller ordering.
      if (!get().recordLoaded) {
        log.warn(
          "prepareAttempt refused: the durable attempt record has not been read yet this session (recovery pending)",
        );
        return { ok: false, reason: "recovery-pending" };
      }

      const { record } = get();

      if (record?.status === "unresolved") {
        if (record.fingerprint === input.normalized.fingerprint) {
          // Same logical request — a RETRY of the same submission. The record
          // is already durable: that IS the retry-safety, so NO new write and
          // NO new id — the exact payload is handed back for resubmission.
          set({ phase: "submitting", conflict: null, failure: null });
          deps.lockCart();
          return {
            ok: true,
            request: { clientRequestId: record.clientRequestId, items: record.items },
          };
        }
        // Defensive (the flow never allows cart edits while unresolved), but
        // the store must not silently rebind an identity to a changed request
        // — that could mint a second order for a customer who already has one
        // in flight (AC-06).
        log.warn(
          "prepareAttempt refused: an unresolved attempt exists for a different logical request",
        );
        return { ok: false, reason: "unresolved-attempt-exists" };
      }

      if (record?.status === "confirmed") {
        // The success flow owns the session until the Next Customer reset
        // (AC-07/AC-11): no new submission may start from under it.
        log.warn("prepareAttempt refused: a confirmed attempt owns this session until reset");
        return { ok: false, reason: "confirmed-attempt-present" };
      }

      // No record: mint the identity and PERSIST BEFORE SUBMIT (AC-06 — the
      // safety core). The screen only gets a request to submit once this
      // write has landed, so an ambiguous result can always be recovered by
      // replaying the durable id.
      const minted: CheckoutAttempt = {
        version: 1,
        ownerId: input.ownerId,
        clientRequestId: deps.idFactory(),
        items: input.normalized.items,
        fingerprint: input.normalized.fingerprint,
        lineSnapshots: input.lines,
        status: "unresolved",
      };
      const written = await backend.write(STORAGE_KEY, minted);
      if (written.status === "rejected") {
        // No record in memory, phase stays idle, cart NOT locked: the network
        // call must not happen (AC-06). `persistence` is left untouched — with
        // no record in memory there is nothing to call "memoryOnly", and the
        // failure is reported honestly through the returned result; a standing
        // `clearFailed` (stale record still on disk) must not be downgraded.
        log.error("prepareAttempt aborted: the attempt could not be made durable before submit", {
          key: STORAGE_KEY,
          reason: written.error.message,
        });
        return {
          ok: false,
          reason: "persist-failed",
          error: toAppError(
            written.error,
            "We couldn't save your order on this device, so it was not submitted.",
          ),
        };
      }
      set({
        record: minted,
        phase: "submitting",
        conflict: null,
        failure: null,
        persistence: "persisted",
      });
      deps.lockCart();
      return {
        ok: true,
        request: { clientRequestId: minted.clientRequestId, items: minted.items },
      };
    };

    // ---- resolveSuccess (D4: capture → durably confirm → clear) -------------
    const applyResolveSuccess = async (response: OrderSuccessCapture): Promise<void> => {
      const record = get().record;
      if (!record) {
        log.warn("resolveSuccess ignored: there is no attempt record to confirm");
        return;
      }
      if (record.status === "confirmed") {
        log.warn("resolveSuccess ignored: the attempt is already confirmed");
        return;
      }

      // (a) The confirmed record: keep everything the unresolved record bound
      // (identity, request, snapshots, owner), add the server's fields and the
      // cleanup tracker.
      const confirmed: CheckoutAttempt = {
        ...record,
        status: "confirmed",
        success: {
          orderId: response.orderId,
          displayNumber: response.displayNumber,
          createdAt: response.createdAt,
        },
        cleanup: { cartClear: "pending" },
      };

      // (b) Durably confirm BEFORE any clearing. If this write fails, the
      // DURABLE record stays unresolved — a restart replays the same
      // clientRequestId and `create_order` re-confirms idempotently, so no
      // duplicate order is possible. That is D4's design: the failure is
      // survivable precisely because the identity never changed.
      const confirmedWrite = await backend.write(STORAGE_KEY, confirmed);
      const durablyConfirmed = confirmedWrite.status === "persisted";

      // The SERVER confirmed: in memory the attempt is confirmed regardless
      // of the write outcome — the phase must never regress to submitting.
      set({ record: confirmed, phase: "confirmed", conflict: null, failure: null });
      if (durablyConfirmed) {
        set({ persistence: "persisted" });
      } else {
        log.error(
          "The confirmed attempt record could not be made durable; disk still holds the unresolved record",
          { key: STORAGE_KEY, reason: confirmedWrite.error.message },
        );
        reportWriteFailure(confirmedWrite.error.message);
      }

      // (c) Clear the cart — allowed now: the server confirmed; the outcome is
      // tracked as done/failed in the record (AC-11: a failed clear keeps the
      // order CONFIRMED and blocks the Next Customer reset until retried).
      // F-06-01: hydrate the cart for this attempt's owner FIRST. The recovery
      // path (recover → replay → resolveSuccess) can reach this clear while
      // the cart's own restore is still in flight; a clear awaited mid-restore
      // resolves honest-on-disk but the restore's apply can resurrect the
      // confirmed order's lines in memory (and back onto disk on the next
      // write) — the T05 review's carried requirement, enforceable only here.
      // `hydrateCart` is idempotent for the same owner, so the in-session path
      // is unchanged, and this store's serialized chain keeps the ordering
      // deterministic.
      await deps.hydrateCart(record.ownerId);
      const cleared = await deps.clearCart();
      const cartClear: "done" | "failed" = cleared.status === "persisted" ? "done" : "failed";
      const updated: CheckoutAttempt = { ...confirmed, cleanup: { cartClear } };
      set({ record: updated });
      if (cleared.status === "rejected") {
        log.error(
          "The cart clear after a confirmed order failed; cleanup stays tracked as failed",
          {
            reason: cleared.error.message,
          },
        );
      }

      if (durablyConfirmed) {
        // Persist the cleanup outcome (both done and failed — a restart must
        // know whether the kiosk is safe to reset). A failure here keeps the
        // tracked outcome in memory and reports it honestly; `retryCleanup`
        // and the recovery flow exist for exactly this.
        const cleanupWrite = await backend.write(STORAGE_KEY, updated);
        if (cleanupWrite.status === "persisted") {
          set({ persistence: "persisted" });
        } else {
          log.error("Failed to persist the cleanup outcome on the confirmed attempt record", {
            key: STORAGE_KEY,
            reason: cleanupWrite.error.message,
          });
          reportWriteFailure(cleanupWrite.error.message);
        }
      }

      // (d) The flow is over: the cart is empty, or the cleanup failure is
      // surfaced by the confirmed state + tracker.
      deps.unlockCart();
    };

    // ---- definite outcomes (AC-08, AC-10, D11) --------------------------------
    const applyResolveStockConflict = async (conflicts: StockConflictItem[]): Promise<void> => {
      if (get().record?.status === "confirmed") {
        // A confirmed record IS the Order Success payload (D1) — a defensive
        // late conflict resolve must never destroy it.
        log.error(
          "resolveStockConflict refused: the attempt is already confirmed; its record is kept",
        );
        return;
      }
      // A definite no-order outcome: the record is discarded (a stale
      // unresolved record from a failed remove would replay idempotently to
      // the same conflict — safe), the cart is NEVER cleared (AC-08), and the
      // cart unlocks so the customer can correct it.
      await discardRecord();
      set({ record: null, phase: "stock-conflict", conflict: conflicts, failure: null });
      deps.unlockCart();
    };

    const applyResolveDefiniteFailure = async (error: AppError): Promise<void> => {
      if (get().record?.status === "confirmed") {
        log.error(
          "resolveDefiniteFailure refused: the attempt is already confirmed; its record is kept",
        );
        return;
      }
      // Same discard semantics as a conflict: the server answered, the
      // identity has no recovery value (D1). The failure surfaces as plain
      // data (AC-10) — kind/userMessage/retryable — including K1003
      // idempotency conflicts, which are definite and never re-minted (D11).
      await discardRecord();
      set({
        record: null,
        phase: "failed",
        conflict: null,
        failure: { kind: error.kind, userMessage: error.userMessage, retryable: error.retryable },
      });
      deps.unlockCart();
    };

    // ---- resolveUnknown (AC-09) -----------------------------------------------
    // Synchronous and durable-op-free by design: the record is ALREADY the
    // unresolved payload on disk (prepare persisted it before submit), so the
    // only work is the phase transition. The cart STAYS locked — editing is
    // unsafe while the outcome is unknown.
    const applyResolveUnknown = () => {
      const { record } = get();
      if (!record || record.status !== "unresolved") {
        log.warn("resolveUnknown ignored: there is no unresolved attempt to preserve");
        return;
      }
      set({ phase: "unknown", conflict: null, failure: null });
    };

    // ---- replayAttempt (AC-09 safe retry; AC-13 recovery replay) --------------
    const applyReplay = async (): Promise<void> => {
      const record = get().record;
      if (!record || record.status !== "unresolved") {
        log.debug("replayAttempt skipped: there is no unresolved attempt to replay");
        return;
      }
      // The serialized op covers the whole flight, so a resolve requested
      // while the replay is in flight lands AFTER it.
      set({ phase: "submitting", conflict: null, failure: null });
      let outcome: SubmitOutcome;
      try {
        const response = await deps.submit({
          clientRequestId: record.clientRequestId,
          items: record.items,
        });
        outcome = classifySubmitOutcome({ response });
      } catch (error) {
        outcome = classifySubmitOutcome({ error });
      }
      // Route through the SAME resolvers the screen path uses — the raw
      // implementations, not the enqueueing public actions (this op already
      // owns the chain; re-enqueueing would deadlock).
      switch (outcome.kind) {
        case "success":
          await applyResolveSuccess({
            orderId: outcome.response.order_id,
            displayNumber: outcome.response.display_number,
            createdAt: outcome.response.created_at,
          });
          return;
        case "stock-conflict":
          await applyResolveStockConflict(outcome.conflicts);
          return;
        case "definite-failure":
          await applyResolveDefiniteFailure(outcome.error);
          return;
        case "unknown":
          applyResolveUnknown();
          return;
      }
    };

    // ---- recover (AC-13, D7) ----------------------------------------------------
    /** What the CURRENT in-memory record classifies as (idempotent recover). */
    const classifyLoaded = (): RecoveryOutcome => {
      const { record } = get();
      if (!record) return "none";
      if (record.status === "unresolved") return "unresolved";
      return record.cleanup.cartClear === "done"
        ? "confirmed-cleanup-done"
        : "confirmed-cleanup-pending";
    };

    const applyRecover = async (ownerId: string): Promise<RecoveryOutcome> => {
      // Idempotent: a second call (the gate re-mounting, a hot reload)
      // re-classifies without re-reading, re-locking, or re-discarding.
      if (get().recordLoaded) return classifyLoaded();

      // F-06-03: never interrupt an in-flight submission. If the machine is
      // already "submitting" when the recovery read completes, the load still
      // lands (record/recordLoaded/persistence) but NO phase mutation and NO
      // lock fire — setting phase "unknown"/"confirmed" would clobber the
      // live submission's state, and locking again would double-lock the cart
      // (the submission already holds it). recover() classifies; the
      // submission in flight owns the phase until it resolves.
      const preserveInFlight = get().phase === "submitting";

      /** The post-load reset shared by the miss/corrupt/foreign branches. */
      const loadEmpty = () => {
        if (preserveInFlight) {
          // Keep the in-flight phase; only mark the read complete.
          set({ recordLoaded: true, record: null });
          return;
        }
        set({ recordLoaded: true, record: null, phase: "idle" });
      };

      const result = await readDurableRecord();

      if (result.status === "miss") {
        // Nothing persisted is normal on a fresh tablet — not a failure.
        loadEmpty();
        return "none";
      }

      if (result.status === "rejected") {
        // A corrupt record (schema-drifted, foreign build, or truly corrupt):
        // log + treat as absent AND durably discard it. TRADEOFF, documented
        // (D1/cart corrupt-payload precedent): the record may have held a real
        // unresolved order, but an unparseable record cannot be replayed — we
        // cannot even read its id — so keeping it would block every future
        // restore while recovering nothing. Discarding is the only safe move;
        // the server's own idempotency ledger still holds the truth.
        log.warn("The persisted checkout attempt was unreadable; discarding it", {
          key: STORAGE_KEY,
          reason: result.error.message,
        });
        const discarded = await backend.remove(STORAGE_KEY);
        if (discarded.status === "rejected") {
          log.error("Failed to durably discard the corrupt attempt record", {
            key: STORAGE_KEY,
            reason: discarded.error.message,
          });
          set({ persistence: "clearFailed" });
        }
        loadEmpty();
        return "discarded-corrupt";
      }

      const record = result.value;
      if (record.ownerId !== ownerId) {
        // Foreign owner (D7): discard WITHOUT replay — no path from a
        // foreign-owner replay can be safe (it would create the order under
        // the wrong actor or K1003). Log, durably discard, continue.
        log.warn(
          "The persisted checkout attempt belongs to a different profile; discarding it without replay",
        );
        const discarded = await backend.remove(STORAGE_KEY);
        if (discarded.status === "rejected") {
          log.error("Failed to durably discard the foreign-owner attempt record", {
            key: STORAGE_KEY,
            reason: discarded.error.message,
          });
          set({ persistence: "clearFailed" });
        }
        loadEmpty();
        return "discarded-foreign";
      }

      // This profile's own attempt: the record IS the state. It is provably
      // on disk (we just read and validated it), so `persistence` is honest
      // as "persisted"; the phase is set per-branch below (unless an
      // in-flight submission owns it — F-06-03).
      set({ recordLoaded: true, record, persistence: "persisted" });
      if (record.status === "unresolved") {
        // The outcome is unknown — editing is unsafe (AC-09/AC-13). The gate
        // renders the recovery surface and auto-replays once with this
        // identity.
        if (!preserveInFlight) {
          set({ phase: "unknown" });
          deps.lockCart();
        }
        return "unresolved";
      }
      if (!preserveInFlight) {
        set({ phase: "confirmed" });
      }
      if (record.cleanup.cartClear === "done") {
        // Safe to show the success flow straight away; the reset gate opens.
        return "confirmed-cleanup-done";
      }
      // Pending or failed cleanup: the success flow must finish cleanup
      // before the kiosk resets (AC-11/AC-13) — keep the cart locked.
      if (!preserveInFlight) {
        deps.lockCart();
      }
      return "confirmed-cleanup-pending";
    };

    // ---- retryCleanup (AC-11) ----------------------------------------------------
    const applyRetryCleanup = async (): Promise<void> => {
      const record = get().record;
      if (!record || record.status !== "confirmed" || record.cleanup.cartClear === "done") {
        log.debug("retryCleanup skipped: no confirmed attempt with pending or failed cleanup");
        return;
      }
      // F-06-01: retryCleanup is BY CONSTRUCTION a recovery-path clear — the
      // app crashed between confirmation and cleanup, so the cart's restore
      // may still be in flight. Await the cart's hydration for the record's
      // owner BEFORE clearing, so a clear racing the restore's apply cannot
      // resurrect the confirmed order's lines in memory (same-owner hydrate
      // is idempotent in-session).
      await deps.hydrateCart(record.ownerId);
      const cleared = await deps.clearCart();
      const cartClear: "done" | "failed" = cleared.status === "persisted" ? "done" : "failed";
      const updated: CheckoutAttempt = { ...record, cleanup: { cartClear } };
      set({ record: updated });
      if (cleared.status === "rejected") {
        log.error("The retried cart clear failed; cleanup stays tracked as failed", {
          reason: cleared.error.message,
        });
      }
      // Persist as in resolveSuccess (c): a restart must know cleanup is safe.
      const written = await backend.write(STORAGE_KEY, updated);
      if (written.status === "persisted") {
        set({ persistence: "persisted" });
      } else {
        log.error("Failed to persist the retried cleanup outcome", {
          key: STORAGE_KEY,
          reason: written.error.message,
        });
        reportWriteFailure(written.error.message);
      }
      if (cartClear === "done") {
        // Unlock only on success: while cleanup is unsafe the recovery
        // surface owns the session. (In the same-session case the cart is
        // already unlocked — unlock is idempotent.)
        deps.unlockCart();
      }
    };

    // ---- resetForNextCustomer (AC-14 gate) -----------------------------------------
    const applyReset = async (): Promise<StorageWriteResult> => {
      const { record, phase } = get();
      const gateOpen =
        record?.status === "confirmed" &&
        record.cleanup.cartClear === "done" &&
        phase === "confirmed";
      if (!gateOpen) {
        // Defensive: the reset must never run while an attempt is unresolved
        // (a restart would lose it) or while confirmed cleanup is unsafe
        // (AC-11/AC-14). Touch NOTHING — the gate caller surfaces the result.
        log.warn(
          "resetForNextCustomer refused: the attempt is not a confirmed order with proven-safe cleanup",
        );
        return {
          status: "rejected",
          error: new Error(
            "The kiosk reset was refused: the checkout attempt is not confirmed with safe cleanup.",
          ),
        };
      }
      const removed = await backend.remove(STORAGE_KEY);
      if (removed.status === "persisted") {
        // Checkout-owned attempt data is cleared at reset (AC-14); the
        // outcome payloads go with it.
        set({
          record: null,
          phase: "idle",
          conflict: null,
          failure: null,
          persistence: "persisted",
        });
        return removed;
      }
      // A failed remove KEEPS the record (in memory and on disk) with an
      // honest status — the next reset attempt retries. Never report this as
      // `memoryOnly` (see PersistenceStatus).
      log.error(
        "Failed to durably remove the confirmed attempt record; it is kept for the next reset",
        {
          key: STORAGE_KEY,
          reason: removed.error.message,
        },
      );
      set({ persistence: "clearFailed" });
      return removed;
    };

    return {
      record: null,
      recordLoaded: false,
      persistence: "unknown",
      phase: "idle",
      conflict: null,
      failure: null,

      // Every durable-touching action runs as ONE serialized op: see the chain
      // above. `resolveUnknown` and `enterReview` touch no backend and stay
      // synchronous.
      prepareAttempt: (input: PrepareInput): Promise<PrepareResult> =>
        runSerialized(() => applyPrepare(input)),

      resolveSuccess: (response: OrderSuccessCapture): Promise<void> =>
        runSerialized(() => applyResolveSuccess(response)),

      resolveStockConflict: (conflicts: StockConflictItem[]): Promise<void> =>
        runSerialized(() => applyResolveStockConflict(conflicts)),

      resolveDefiniteFailure: (error: AppError): Promise<void> =>
        runSerialized(() => applyResolveDefiniteFailure(error)),

      resolveUnknown: () => applyResolveUnknown(),

      replayAttempt: (): Promise<void> => runSerialized(() => applyReplay()),

      recover: (ownerId: string): Promise<RecoveryOutcome> =>
        runSerialized(() => applyRecover(ownerId)),

      retryCleanup: (): Promise<void> => runSerialized(() => applyRetryCleanup()),

      resetForNextCustomer: (): Promise<StorageWriteResult> => runSerialized(() => applyReset()),

      enterReview: () => {
        const { phase } = get();
        if (phase !== "stock-conflict" && phase !== "failed") {
          // Only DEFINITE outcomes leave a clean path back to review; from
          // submitting/unknown/confirmed the machine owns the session.
          log.debug("enterReview refused from the current phase", { phase });
          return;
        }
        set({ phase: "idle", conflict: null, failure: null });
      },
    };
  });
}

export const useAttemptStore = createAttemptStore();
