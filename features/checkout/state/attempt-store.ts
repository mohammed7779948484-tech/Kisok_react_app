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

/**
 * The TERMINAL record's failure kind: the DEFINITE subset of AppErrorKind —
 * exactly the seven kinds the attempt schema's terminal branch accepts
 * (`checkout-attempt.schema.ts` failureKindSchema; ambiguous kinds are an
 * oxymoron there, RT02-1). By construction only definite kinds reach the
 * terminal write: the classifier routes `network`/`unknown` errors to the
 * unknown outcome, and the K1003 branch returns before it. The cast
 * documents that invariant; the schema is the runtime backstop if it is
 * ever violated (a violating record would fail the next restore loudly and
 * land in the fail-closed unsafe hold).
 */
type TerminalFailureKind = Exclude<AppErrorKind, "network" | "unknown" | "idempotency-conflict">;

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
 * The phases of the checkout state machine (plan D8 — the store is the
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
 * - `held` — the K1003 fail-closed hold (F-04): the server proved an order
 *   already exists for this client_request_id under a different actor or
 *   fingerprint. The record is durable evidence (status "held"), the cart
 *   stays locked, and nothing may be re-resolved or re-minted from under it.
 * - `unsafe-recovery` — the F-05 fail-closed load: a corrupt, foreign, or
 *   foreign-unclean record was found on disk and is being HELD, not deleted;
 *   `state.unsafeHold` carries the reason. No submission, replay, or cleanup
 *   may run from under this phase.
 */
export type AttemptPhase =
  | "idle"
  | "submitting"
  | "stock-conflict"
  | "unknown"
  | "failed"
  | "confirmed"
  | "held"
  | "unsafe-recovery";

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
 * - `"held-attempt-present"` (F-04) — a K1003 hold owns the session: the
 *   server proved an order exists for the persisted identity, so minting a
 *   fresh one here could create a SECOND order. Never resolved client-side.
 * - `"unsafe-recovery"` (F-05) — a fail-closed recovery hold owns the
 *   session (corrupt, foreign, or foreign-unclean durable record): the
 *   record is held as evidence and nothing may be submitted from under it.
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
        | "confirmed-attempt-present"
        | "held-attempt-present"
        | "unsafe-recovery";
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
  | "held"
  | "terminal"
  | "unsafe-recovery"
  | "discarded-foreign";

/**
 * Why a session is held in the `unsafe-recovery` phase (F-05) — plain data
 * in state, never an Error instance (the AttemptFailure precedent). The
 * durable record that caused the hold is KEPT (evidence), never deleted.
 */
export type UnsafeHoldReason =
  /** The durable payload failed the attempt schema — unreadable evidence. */
  | "corrupt"
  /**
   * A foreign owner's unresolved record (or foreign held/terminal verdict —
   * a foreign hold is still a hold): an in-flight identity or durable
   * evidence that belongs to another profile.
   */
  | "foreign-unresolved"
  /** A foreign confirmed record whose cart clear is not proven done. */
  | "foreign-confirmed-unsafe-cleanup";

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
 *   One more AppError shape is ambiguous (F-03): kind `server` with code
 *   `RPC_SCHEMA_MISMATCH` — the server answered, but the RESPONSE payload
 *   failed validation; a malformed response does not prove the
 *   `create_order` transaction rolled back, so the order may exist. Every
 *   OTHER `server` error (K1006 and the like) is the server's own honest
 *   no-order verdict and stays definite.
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
    if (result.error.kind === "server" && result.error.code === "RPC_SCHEMA_MISMATCH") {
      // F-03: the server ANSWERED but the payload did not validate. A
      // malformed response does not prove the order transaction rolled
      // back — the order may exist. Hold ambiguous; the same-id replay
      // resolves the truth (an idempotent success or a definite K-code).
      // Strict runtime validation is unchanged: callRpc still THROWS on a
      // malformed payload — only the safety classification changes.
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
  /**
   * F-05: the in-memory fail-closed hold marker — set when `recover` found
   * a corrupt, foreign, or foreign-unclean durable record. Non-null means
   * the session is HELD: no prepare, no replay, no cleanup, no review
   * re-entry (phase `"unsafe-recovery"`), and the sign-out GUARD blocks the
   * wipe (R5-T04: the staff-hold family). Cleared only by the one
   * proven-inert foreign discard — never by a submission, because none can
   * start from under it, and never by the sign-out wipe, which the guard
   * refuses while the hold stands: the exit is staff intervention, by
   * design.
   */
  unsafeHold: { reason: UnsafeHoldReason } | null;
  prepareAttempt: (input: PrepareInput) => Promise<PrepareResult>;
  resolveSuccess: (response: OrderSuccessCapture) => Promise<void>;
  resolveStockConflict: (conflicts: StockConflictItem[]) => Promise<void>;
  resolveDefiniteFailure: (error: AppError) => Promise<void>;
  resolveUnknown: () => void;
  replayAttempt: () => Promise<void>;
  recover: (ownerId: string) => Promise<RecoveryOutcome>;
  retryCleanup: () => Promise<void>;
  resetForNextCustomer: () => Promise<StorageWriteResult>;
  /**
   * The UNGATED durable wipe the sign-out cleanup drives (AC-12, R2-01) —
   * see `applyClearForSignOut` below for the chain-enqueue reasoning and the
   * envelope-reset semantics.
   */
  clearForSignOut: () => Promise<StorageWriteResult>;
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

      if (get().phase === "unsafe-recovery" || get().unsafeHold !== null) {
        // F-05: a fail-closed recovery hold owns the session (a corrupt,
        // foreign, or foreign-unclean record is being HELD on disk). No
        // submission may start from under it — a mint here would overwrite
        // evidence of a possibly-live foreign identity and could create a
        // duplicate order for its real owner.
        log.warn("prepareAttempt refused: an unsafe recovery hold owns this session");
        return { ok: false, reason: "unsafe-recovery" };
      }

      if (record?.status === "held") {
        // F-04: a K1003 hold owns the session. The server PROVED an order
        // exists for the persisted identity (under a different actor or
        // fingerprint); minting a fresh client_request_id here could create a
        // SECOND order for the same logical request. The hold is durable
        // evidence and is never resolved client-side — the sign-out guard
        // (R5-T04) blocks the wipe while it stands, so the exit is staff
        // intervention, by design.
        log.warn("prepareAttempt refused: a held attempt owns this session");
        return { ok: false, reason: "held-attempt-present" };
      }

      if (record?.status === "unresolved") {
        if (
          record.fingerprint === input.normalized.fingerprint &&
          record.ownerId === input.ownerId
        ) {
          // Same logical request by the SAME owner — a RETRY of the same
          // submission. The record is already durable: that IS the
          // retry-safety, so NO new write and NO new id — the exact payload
          // is handed back for resubmission.
          set({ phase: "submitting", conflict: null, failure: null });
          deps.lockCart();
          return {
            ok: true,
            request: { clientRequestId: record.clientRequestId, items: record.items },
          };
        }
        // Defensive (the flow never allows cart edits while unresolved), but
        // the store must not silently rebind an identity — not to a CHANGED
        // logical request, and never to a DIFFERENT profile (R2-04): the live
        // clientRequestId belongs to whoever minted it, and handing it to
        // another owner would submit THEIR cart under the first owner's
        // idempotency identity — either way a second order could be created
        // for a customer who already has one in flight (AC-06).
        log.warn(
          "prepareAttempt refused: the unresolved attempt exists for a different logical request or profile",
        );
        return { ok: false, reason: "unresolved-attempt-exists" };
      }

      if (record?.status === "confirmed") {
        // The success flow owns the session until the Next Customer reset
        // (AC-07/AC-11): no new submission may start from under it.
        log.warn("prepareAttempt refused: a confirmed attempt owns this session until reset");
        return { ok: false, reason: "confirmed-attempt-present" };
      }

      // No record, or a TERMINAL record (F-06): mint the identity and PERSIST
      // BEFORE SUBMIT (AC-06 — the safety core). A terminal record is a
      // PROVEN no-order verdict — it deliberately falls through to the mint:
      // a FRESH confirmation is a new logical request that legitimately
      // mints a new identity (the terminal record is overwritten by the new
      // unresolved one; the verdict has no recovery value left to lose).
      // The screen only gets a request to submit once this
      // write has landed, so an ambiguous result can always be recovered by
      // replaying the durable id.
      //
      // The phase flips to "submitting" SYNCHRONOUSLY here — BEFORE the
      // durable write — and is REVERTED if the write fails (R2-01(a)):
      // setting the record only after the write resolved left a window
      // where a sign-out guard snapshotting mid-write saw `record: null` +
      // `phase: "idle"`, approved, and the post-handoff cleanup then wiped
      // the freshly persisted unresolved identity (its in-flight submission
      // resolved against nothing, and a retry or restart re-minted a
      // client_request_id — a possible duplicate order). The synchronous
      // flip makes the in-flight submission visible for that whole window
      // with zero race; the revert keeps the machine exactly where it was
      // for a submission that will never happen.
      const previousPhase = get().phase;
      set({ phase: "submitting" });
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
        // No record in memory, the phase is reverted to what it was, cart NOT
        // locked: the network call must not happen (AC-06). `persistence` is
        // left untouched — with no record in memory there is nothing to call
        // "memoryOnly", and the failure is reported honestly through the
        // returned result; a standing `clearFailed` (stale record still on
        // disk) must not be downgraded.
        set({ phase: previousPhase });
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
        conflict: null,
        failure: null,
        persistence: "persisted",
      });
      // The phase is already "submitting" — the synchronous flip above owns
      // it from here on.
      deps.lockCart();
      return {
        ok: true,
        request: { clientRequestId: minted.clientRequestId, items: minted.items },
      };
    };

    // ---- resolveSuccess (D4: capture → durably confirm → clear) -------------
    const applyResolveSuccess = async (response: OrderSuccessCapture): Promise<void> => {
      const { record, unsafeHold } = get();
      if (unsafeHold !== null) {
        // RT03-2: an F-05 hold's evidence record is FOREIGN — its
        // status ("unresolved") must not satisfy this resolver's record
        // guard. Resolving the foreign identity (pinning this session's
        // success payload onto it, driving its owner's cart clear) is
        // exactly the escape the hold exists to prevent.
        log.warn("resolveSuccess ignored: an unsafe recovery hold owns this session");
        return;
      }
      if (!record || record.status !== "unresolved") {
        // Fail-closed enforcement: ONLY an unresolved attempt may be
        // confirmed. A confirmed record is already the success payload (the
        // duplicate-resolve no-op); a HELD record is durable evidence the
        // server proved a DIFFERENT order exists for this identity (F-04) and
        // must never be re-resolved into success; a TERMINAL record already
        // carries its verdict (F-06); no record → nothing to confirm (the
        // defensive R2-05 branch — fabricating a confirmed record would pin
        // a success payload to a dead identity).
        log.warn("resolveSuccess ignored: only an unresolved attempt can be confirmed");
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
      // surfaced by the confirmed state + tracker. F-07: unlock ONLY when
      // the durable clear is proven done — the OLD unconditional unlock left
      // the already-submitted cart editable again (Quick Cart rows,
      // full-cart edits) while its clear was still unproven, inviting a
      // second submission. The retried clear (`retryCleanup`) unlocks on
      // success.
      if (cartClear === "done") {
        deps.unlockCart();
      } else {
        log.warn("cart stays locked after a confirmed order: the durable clear is not done");
      }
    };

    // ---- definite outcomes (AC-08, AC-10, D11) --------------------------------
    const applyResolveStockConflict = async (conflicts: StockConflictItem[]): Promise<void> => {
      const { record, unsafeHold } = get();
      if (unsafeHold !== null) {
        // RT03-2: the evidence record under an F-05 hold is FOREIGN — its
        // "unresolved" status must not satisfy this resolver's guard, and
        // resolving it would discard another profile's identity.
        log.warn("resolveStockConflict ignored: an unsafe recovery hold owns this session");
        return;
      }
      if (!record || record.status !== "unresolved") {
        // Fail-closed enforcement: only an UNRESOLVED attempt can resolve to
        // a conflict. A confirmed record IS the Order Success payload (D1) —
        // a defensive late conflict resolve must never destroy it; a HELD
        // record is durable evidence the server proved an order exists
        // (F-04); a TERMINAL record already carries its verdict.
        log.error(
          "resolveStockConflict refused: only an unresolved attempt can resolve to a conflict; its record is kept",
        );
        return;
      }
      // A definite no-order outcome: the cart is NEVER cleared (AC-08), and
      // the cart unlocks so the customer can correct it. The discard is the
      // FIRST step, not the whole story (F-06): if it fails, the verdict is
      // persisted as a TERMINAL record before the machine presents it.
      const discard = await discardRecord();
      if (discard.status === "persisted") {
        set({ record: null, phase: "stock-conflict", conflict: conflicts, failure: null });
        deps.unlockCart();
        return;
      }
      // discard FAILED → F-06: persist a TERMINAL record BEFORE treating the
      // outcome as terminal. The old machine left DISK holding status
      // "unresolved" while memory said "definite" + unlocked — a restart then
      // auto-replayed the stale record through the recovery gate and fired
      // create_order WITHOUT fresh confirmation. The terminal record makes
      // the restart restore the verdict instead.
      const terminal: CheckoutAttempt = {
        ...record,
        status: "terminal",
        outcome: { kind: "stock-conflict", conflicts },
      };
      const write = await backend.write(STORAGE_KEY, terminal);
      if (write.status === "persisted") {
        set({
          record: terminal,
          phase: "stock-conflict",
          conflict: conflicts,
          failure: null,
          persistence: "persisted",
        });
        deps.unlockCart(); // definite no-order proven durably — editing is safe
      } else {
        // Both the discard AND the terminal write failed: do NOT present a
        // safe definite state (F-06: fail closed). Keep the unresolved
        // record, phase unknown, cart locked — a restart replays the SAME
        // id, which the server deduplicates. `persistence` is deliberately
        // untouched (FR-2): memory and disk both still hold the SAME
        // unresolved record — memory is not ahead of disk, so "memoryOnly"
        // would be dishonest copy on the review screen, and a standing
        // "clearFailed" must not be downgraded.
        log.error(
          "The definite conflict verdict could not be made durable; keeping the attempt unresolved",
          { key: STORAGE_KEY, reason: write.error.message },
        );
        set({ phase: "unknown", conflict: null, failure: null });
      }
    };

    const applyResolveDefiniteFailure = async (error: AppError): Promise<void> => {
      const { record, unsafeHold } = get();
      if (unsafeHold !== null) {
        // RT03-2: the evidence record under an F-05 hold is FOREIGN — its
        // "unresolved" status must not satisfy this resolver's guard, and
        // resolving it (K1003 branch included) would act on another
        // profile's identity.
        log.warn("resolveDefiniteFailure ignored: an unsafe recovery hold owns this session");
        return;
      }
      if (!record || record.status !== "unresolved") {
        // Fail-closed enforcement: a held record is never re-resolved (F-04);
        // a confirmed record keeps its success payload; a terminal record
        // already carries its verdict; no record → nothing to resolve.
        log.warn("resolveDefiniteFailure ignored: no unresolved attempt to resolve");
        return;
      }

      const isAmbiguousError =
        error.kind === "network" ||
        error.kind === "unknown" ||
        // FR-1: the third ambiguous shape the repo itself defines (D-R2): the
        // server ANSWERED but the response payload did not validate — a
        // malformed response does not prove the order transaction rolled
        // back, so it must never be persisted as a definite terminal verdict.
        (error.kind === "server" && error.code === "RPC_SCHEMA_MISMATCH");
      if (isAmbiguousError) {
        // RT03-6/FR-1: the classifier routes the ambiguous kinds to the
        // unknown outcome, but this action is public — a future caller
        // passing a network/unknown/RPC_SCHEMA_MISMATCH AppError directly
        // must not have it persisted as a definite terminal verdict. Fail
        // safe: hold the attempt unresolved.
        log.warn(
          "resolveDefiniteFailure refused an ambiguous error; holding the attempt unresolved",
          { kind: error.kind, code: error.code },
        );
        applyResolveUnknown();
        return;
      }

      if (error.kind === "idempotency-conflict") {
        // F-04 — K1003: the server PROVED an order exists for this
        // client_request_id under a different actor or fingerprint. Fail
        // CLOSED: persist a HELD record (identity + evidence), never discard,
        // keep the cart locked, phase "held". The old discard-and-unlock
        // behavior let a later fresh confirmation mint a new
        // client_request_id — a possible SECOND order for a request the
        // server just said already has one (D11: a K1003 is never resolved
        // by re-minting).
        const held: CheckoutAttempt = { ...record, status: "held", hold: { reason: "k1003" } };
        const write = await backend.write(STORAGE_KEY, held);
        if (write.status === "persisted") {
          set({
            record: held,
            phase: "held",
            conflict: null,
            failure: { kind: error.kind, userMessage: error.userMessage, retryable: false },
            persistence: "persisted",
          });
        } else {
          // Fail closed: could not durably record the hold. The identity is
          // NOT discarded (a restart auto-replays the SAME id → K1003 again
          // → held attempt again — deterministic, server-side). Present
          // unknown (honest: the outcome cannot be safely recorded), keep
          // the cart locked. `persistence` is deliberately untouched
          // (RT03-7): the failed write was of the HELD record, so memory and
          // disk both still hold the SAME unresolved record — memory is not
          // ahead of disk, and a standing "clearFailed" must not be
          // downgraded by a "memoryOnly" report.
          log.error(
            "The held attempt record could not be made durable; keeping the attempt unresolved",
            {
              key: STORAGE_KEY,
              reason: write.error.message,
            },
          );
          set({ phase: "unknown", conflict: null, failure: null });
        }
        return; // NEVER unlock on the K1003 path — the cart is evidence/context.
      }

      // Non-K1003 definite failure — same discard semantics as a conflict,
      // with F-06's terminal persistence when the discard fails. The
      // failure surfaces as plain data (AC-10) — kind/userMessage/retryable.
      const failurePayload: AttemptFailure = {
        kind: error.kind,
        userMessage: error.userMessage,
        retryable: error.retryable,
      };
      const discard = await discardRecord();
      if (discard.status === "persisted") {
        // discard succeeded → the identity is gone; the server answered, it
        // has no recovery value (D1).
        set({ record: null, phase: "failed", conflict: null, failure: failurePayload });
        deps.unlockCart();
        return;
      }
      // discard FAILED → F-06: persist a TERMINAL record BEFORE treating the
      // outcome as terminal, so a restart restores the definite verdict
      // instead of auto-replaying an unresolved record (see the conflict
      // resolver above for the full reasoning).
      const terminal: CheckoutAttempt = {
        ...record,
        status: "terminal",
        outcome: {
          kind: "definite-failure",
          failure: {
            kind: error.kind as TerminalFailureKind,
            userMessage: error.userMessage,
            retryable: error.retryable,
          },
        },
      };
      const write = await backend.write(STORAGE_KEY, terminal);
      if (write.status === "persisted") {
        set({
          record: terminal,
          phase: "failed",
          conflict: null,
          failure: failurePayload,
          persistence: "persisted",
        });
        deps.unlockCart(); // definite no-order proven durably — editing is safe
      } else {
        // Both the discard AND the terminal write failed: do NOT present a
        // safe definite state (F-06: fail closed). Keep the unresolved
        // record, phase unknown, cart locked. `persistence` deliberately
        // untouched (FR-2 — same reasoning as the conflict branch: memory
        // and disk hold the SAME unresolved record).
        log.error(
          "The definite failure verdict could not be made durable; keeping the attempt unresolved",
          { key: STORAGE_KEY, reason: write.error.message },
        );
        set({ phase: "unknown", conflict: null, failure: null });
      }
    };

    // ---- resolveUnknown (AC-09) -----------------------------------------------
    // Synchronous and durable-op-free by design: the record is ALREADY the
    // unresolved payload on disk (prepare persisted it before submit), so the
    // only work is the phase transition. The cart STAYS locked — editing is
    // unsafe while the outcome is unknown.
    const applyResolveUnknown = () => {
      const { record, unsafeHold } = get();
      if (unsafeHold !== null) {
        // F-05: a foreign/corrupt record must not flip the local machine
        // into its unknown presentation — the unsafe-recovery surface owns
        // the hold, and "unknown" would invite a replay this session must
        // never fire.
        log.warn("resolveUnknown ignored: an unsafe recovery hold owns this session");
        return;
      }
      if (!record || record.status !== "unresolved") {
        log.warn("resolveUnknown ignored: there is no unresolved attempt to preserve");
        return;
      }
      set({ phase: "unknown", conflict: null, failure: null });
    };

    // ---- replayAttempt (AC-09 safe retry; AC-13 recovery replay) --------------
    const applyReplay = async (): Promise<void> => {
      const record = get().record;
      if (get().unsafeHold !== null) {
        // F-05: a foreign unresolved record must never replay under the
        // wrong actor (it would submit the order for the wrong profile, or
        // trip K1003); a corrupt hold has nothing safe to replay. The
        // unsafe-recovery surface owns the session.
        log.debug("replayAttempt skipped: an unsafe recovery hold owns this session");
        return;
      }
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
      const { record, unsafeHold } = get();
      // F-05: an unsafe hold outranks everything — the session stays
      // fail-closed until the sign-out wipe (or the one proven-inert foreign
      // discard) clears it. Checked FIRST: a foreign record is deliberately
      // kept in memory (evidence), so the record-based branches below must
      // never answer for it.
      if (unsafeHold !== null) return "unsafe-recovery";
      if (!record) return "none";
      if (record.status === "unresolved") return "unresolved";
      if (record.status === "confirmed") {
        return record.cleanup.cartClear === "done"
          ? "confirmed-cleanup-done"
          : "confirmed-cleanup-pending";
      }
      if (record.status === "held") {
        // F-04: a held record re-classifies as held — the hold is durable
        // session state, never re-read, re-replayed, or re-discarded.
        return "held";
      }
      // record.status === "terminal" (F-06): the durable verdict.
      return "terminal";
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

      /** The post-load reset shared by the miss and safe-discard branches. */
      const loadEmpty = () => {
        if (preserveInFlight) {
          // Keep the in-flight phase; only mark the read complete.
          set({ recordLoaded: true, record: null, unsafeHold: null });
          return;
        }
        set({ recordLoaded: true, record: null, phase: "idle", unsafeHold: null });
      };

      /**
       * F-05's fail-closed load: a durable record this session must NOT
       * consume (corrupt, foreign, or foreign-unclean) is HELD, never
       * deleted — deleting evidence enables fresh mints, and a foreign
       * record's owner may still need it. The record is kept in memory as
       * evidence (null when it is unparseable), `unsafeHold` carries the
       * reason, and the phase moves to "unsafe-recovery" so no gated action
       * can run from under it. When a submission is in flight
       * (preserveInFlight), the loaded state lands WITHOUT the phase
       * mutation — the submission owns the phase until it resolves, and the
       * NEXT recover/classifyLoaded re-answers "unsafe-recovery".
       */
      const holdUnsafe = (
        reason: UnsafeHoldReason,
        evidence: CheckoutAttempt | null,
      ): RecoveryOutcome => {
        if (preserveInFlight) {
          set({ recordLoaded: true, record: evidence, unsafeHold: { reason } });
        } else {
          set({
            recordLoaded: true,
            record: evidence,
            phase: "unsafe-recovery",
            unsafeHold: { reason },
          });
        }
        return "unsafe-recovery";
      };

      const result = await readDurableRecord();

      if (result.status === "miss") {
        // Nothing persisted is normal on a fresh tablet — not a failure.
        loadEmpty();
        return "none";
      }

      if (result.status === "rejected") {
        // F-05: a corrupt record (schema-drifted, foreign build, or truly
        // corrupt) is NOT deleted. The old discard reasoning ("keeping it
        // would block every future restore while recovering nothing") was
        // the defect: deleting evidence a session cannot interpret enables
        // fresh mints — the record may have held a real unresolved order,
        // and a fresh submission under a new client_request_id could
        // duplicate it. The record is HELD fail-closed for whoever CAN read
        // it (a newer build, store staff); this session refuses to act.
        log.warn("The persisted checkout attempt was unreadable; holding it fail-closed", {
          key: STORAGE_KEY,
          reason: result.error.message,
        });
        return holdUnsafe("corrupt", null);
      }

      const record = result.value;
      if (record.ownerId !== ownerId) {
        // Foreign owner (D7/F-05). EXACTLY ONE case is safe to discard: a
        // CONFIRMED record whose cart clear is DONE — the order exists, the
        // cart is clean, there is nothing left to replay and nothing left
        // to clean.
        if (record.status === "confirmed" && record.cleanup.cartClear === "done") {
          log.warn(
            "The persisted checkout attempt belongs to a different profile and is fully cleaned; discarding it without replay",
          );
          const discarded = await backend.remove(STORAGE_KEY);
          if (discarded.status === "rejected") {
            log.error("Failed to durably discard the inert foreign attempt record", {
              key: STORAGE_KEY,
              reason: discarded.error.message,
            });
            set({ persistence: "clearFailed" });
          }
          loadEmpty();
          return "discarded-foreign";
        }
        // Every OTHER foreign record is HELD (F-05): a foreign UNRESOLVED
        // record is a possibly-live idempotency identity — deleting it lets
        // its owner's next session mint a fresh id and duplicate THEIR
        // order; a foreign CONFIRMED record with a pending/failed clear is
        // an unclean cart whose owner still needs the cleanup; a foreign
        // held/terminal verdict is durable evidence. None of these is this
        // session's to delete, and none may be replayed under the wrong
        // actor.
        log.warn(
          "The persisted checkout attempt belongs to a different profile and is not provably inert; holding it fail-closed without replay",
          { ownerId: record.ownerId, status: record.status },
        );
        return holdUnsafe(
          record.status === "confirmed" ? "foreign-confirmed-unsafe-cleanup" : "foreign-unresolved",
          record,
        );
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
      if (record.status === "confirmed") {
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
      }
      // record.status === "held" (F-04): the hold owns the session — NO
      // replay (a held record must never be resubmitted), NO discard (the
      // record is the evidence), and the cart stays protected.
      if (record.status === "held") {
        if (!preserveInFlight) {
          set({ phase: "held" });
          deps.lockCart();
        }
        return "held";
      }
      // record.status === "terminal" (F-06): restore the durable definite
      // verdict WITHOUT auto-replay — a restart must land on the definite
      // surface (conflict or failure), never on a fresh submission. No
      // lockCart: the conflict flow's design is a return to the preserved
      // cart, and a failed verdict has nothing left to protect.
      if (!preserveInFlight) {
        if (record.outcome.kind === "stock-conflict") {
          set({ phase: "stock-conflict", conflict: record.outcome.conflicts, failure: null });
        } else {
          set({ phase: "failed", failure: record.outcome.failure, conflict: null });
        }
      }
      return "terminal";
    };

    // ---- retryCleanup (AC-11) ----------------------------------------------------
    const applyRetryCleanup = async (): Promise<void> => {
      const record = get().record;
      if (get().unsafeHold !== null) {
        // F-05: a foreign confirmed record's cleanup must not be driven from
        // this session — the unsafe-recovery surface owns the hold, and this
        // profile must not act on another profile's record.
        log.debug("retryCleanup skipped: an unsafe recovery hold owns this session");
        return;
      }
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
          unsafeHold: null,
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

    // ---- clearForSignOut (AC-12 — the sign-out cleanup's wipe, R2-01) --------
    /**
     * The UNGATED durable wipe the sign-out cleanup drives — exactly how the
     * cart's cleanup drives the cart store's `clear()`. `resetForNextCustomer`
     * is GATED (confirmed + cleanup done) because the Next-Customer reset it
     * serves must refuse while anything is unresolved or cleanup is unsafe;
     * sign-out needs an unconditional wipe, and the sign-out GUARD
     * (sign-out-cleanup.ts) is what decides one is legal — it blocks while a
     * record is unresolved OR a submission is in flight (phase
     * "submitting").
     *
     * WHY the remove is chain-enqueued (R2-01): it runs as ONE op on the
     * serialized durable-op chain, so an in-flight prepare write or recover
     * read can never be INTERLEAVED with the wipe — the remove runs strictly
     * after every earlier-enqueued op (the old raw remove from the cleanup
     * could land mid-write and destroy a freshly persisted UNRESOLVED
     * identity — the duplicate-order seam), and any later-enqueued op sees
     * the post-reset envelope below: the reset lands in the remove's settle
     * cascade, ahead of every later chain op. A sign-out during an in-flight
     * recover read therefore cannot resurrect DISK state either — the remove
     * lands after the read, covering whatever it loaded; the loaded record
     * may transiently sit in MEMORY during teardown (the read's apply
     * precedes the remove), but the post-remove reset wipes it, so the
     * residual is memory-only and harmless — the next session reads clean
     * disk.
     *
     * The envelope reset is the full sign-out reset the cleanup used to apply
     * itself, applied AFTER the remove resolves, OUTSIDE the op — the op is
     * the backend remove alone (the store's pattern: a state update lands
     * after its backend op resolves, never in flight with it).
     * `recordLoaded: false` is deliberate: the next session's `recover()`
     * must run a REAL read against whatever disk holds then, never a
     * shortcut on pre-sign-out memory. `unsafeHold: null` resets the
     * in-memory marker with the envelope (the sign-out GUARD — sign-out-
     * cleanup.ts, R5-T04 — decides the wipe is legal, and it REFUSES while
     * a hold stands: the staff-hold family has no client-side exit, so this
     * path runs for the hold-free shapes only). On a rejected
     * remove the reset still
     * runs — BEFORE the rejection can propagate (the cleanup throws on it,
     * and after the throw core/auth's emergency wipe owns DISK, so nothing
     * else would ever reset MEMORY) — and `persistence` is "unknown", NOT
     * "clearFailed": the emergency wipe may already have erased the stale
     * record, and a stale `clearFailed` would keep warning about data that
     * may be gone (the cart's H-F02 reasoning); "unknown" forces the next
     * `recover()` to find out.
     */
    const applyClearForSignOut = async (): Promise<StorageWriteResult> => {
      // FR-4 (final-review finding, ACCEPTED with trace): the guard
      // snapshots memory at approval time, so a prepareAttempt enqueued
      // between the guard's approval and this wipe's execution would have
      // its freshly minted identity destroyed. Traced UNREACHABLE in the
      // delivered app: sign-out is reachable only from OUTSIDE the customer
      // group (unmounting the review screen — its Confirm cannot fire during
      // teardown), and any prepare enqueued BEFORE the guard runs flips
      // phase "submitting" synchronously, which the guard refuses. The wipe
      // stays deliberately UNGATED here (the guard owns legality — its
      // contract is pinned by the R2-01 suites); a belt-and-braces
      // execution-time re-check was prototyped and reverted because it
      // broke the documented ungated-wipe contract those suites pin.
      const removed = await runSerialized(() => backend.remove(STORAGE_KEY));
      set({
        record: null,
        recordLoaded: false,
        phase: "idle",
        conflict: null,
        failure: null,
        unsafeHold: null,
        persistence: removed.status === "persisted" ? "persisted" : "unknown",
      });
      return removed;
    };

    return {
      record: null,
      recordLoaded: false,
      persistence: "unknown",
      phase: "idle",
      conflict: null,
      failure: null,
      unsafeHold: null,

      // Every durable-touching action runs its backend IO as ONE serialized
      // op: see the chain above. `clearForSignOut` enqueues its remove the
      // same way and applies its envelope reset after the op resolves.
      // `resolveUnknown` and `enterReview` touch no backend and stay
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

      // NOT itself wrapped in runSerialized: the op inside
      // applyClearForSignOut (the backend remove) already enqueues on the
      // chain, and wrapping the whole action would enqueue it behind itself —
      // a deadlock (the same reason applyReplay routes to the raw resolvers
      // rather than the re-enqueueing public actions).
      clearForSignOut: (): Promise<StorageWriteResult> => applyClearForSignOut(),

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
