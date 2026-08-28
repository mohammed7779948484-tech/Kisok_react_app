import { isAuthError, type PostgrestError } from "@supabase/supabase-js";

/**
 * The one error shape the whole app speaks.
 *
 * Rule for features: never surface a raw Supabase/Postgres error to the user
 * and never write `try/catch -> console.log -> Alert`. Convert at the api/
 * boundary with `toAppError`, then branch on `kind` in the UI.
 *
 * `userMessage` is safe to render. `technicalMessage` is for logs only — it may
 * contain database detail and must never be shown to a customer.
 */
export type AppErrorKind =
  /** No usable session — send the user to sign-in. */
  | "auth"
  /** Authenticated but not permitted (RLS / role gate). Retrying will not help. */
  | "forbidden"
  /** The request itself was malformed. A retry of the same payload will fail again. */
  | "validation"
  /** The requested catalog entity is inactive, missing, or out of stock. */
  | "unavailable"
  /** Same client_request_id reused with different contents. Never auto-retry this. */
  | "idempotency-conflict"
  /** The record moved on (order already final, already assigned, transition not allowed). */
  | "state-conflict"
  /** The server failed to complete the operation. Usually retryable. */
  | "server"
  /** The request never got a definitive answer. See the checkout ambiguity rules. */
  | "network"
  | "unknown";

export type AppErrorOptions = {
  kind: AppErrorKind;
  userMessage: string;
  technicalMessage?: string;
  /** Postgres SQLSTATE or KISOK code (e.g. "K1002", "42501"). */
  code?: string;
  retryable?: boolean;
  cause?: unknown;
};

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly userMessage: string;
  readonly technicalMessage: string;
  readonly code?: string;
  readonly retryable: boolean;

  constructor({ kind, userMessage, technicalMessage, code, retryable, cause }: AppErrorOptions) {
    super(technicalMessage ?? userMessage);
    this.name = "AppError";
    this.kind = kind;
    this.userMessage = userMessage;
    this.technicalMessage = technicalMessage ?? userMessage;
    this.code = code;
    this.retryable = retryable ?? DEFAULT_RETRYABLE[kind];
    this.cause = cause;
  }

  /** Safe to attach to a log record — carries no session material. */
  toLogContext() {
    return {
      kind: this.kind,
      code: this.code,
      retryable: this.retryable,
      detail: this.technicalMessage,
    };
  }
}

const DEFAULT_RETRYABLE: Record<AppErrorKind, boolean> = {
  auth: false,
  forbidden: false,
  validation: false,
  unavailable: false,
  "idempotency-conflict": false,
  "state-conflict": false,
  server: true,
  network: true,
  unknown: false,
};

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * KISOK application error codes raised by the Lean V2 database functions.
 * Source of truth: supabase/migrations/*.sql — do not invent new codes here.
 */
const KISOK_CODE_MAP: Record<string, { kind: AppErrorKind; userMessage: string }> = {
  // create_order / update_order_status: malformed request payload.
  K1001: { kind: "validation", userMessage: "We couldn't process that request. Please try again." },
  // Requested variant is inactive/missing, or the order does not exist.
  K1002: { kind: "unavailable", userMessage: "Some items are no longer available." },
  // Same client_request_id replayed with different contents.
  K1003: {
    kind: "idempotency-conflict",
    userMessage: "This order was already submitted with different items.",
  },
  // Order is already final, already assigned, or the transition is not allowed.
  K1004: { kind: "state-conflict", userMessage: "This order has already been updated." },
  // Inventory adjustment validation (Admin surface).
  K1005: { kind: "validation", userMessage: "That stock change isn't valid." },
  // Server could not complete the write.
  K1006: { kind: "server", userMessage: "Something went wrong on our side. Please try again." },
};

/** Postgres SQLSTATE codes we translate directly. */
const SQLSTATE_MAP: Record<string, { kind: AppErrorKind; userMessage: string }> = {
  // insufficient_privilege — the role gate or an RLS policy rejected this.
  "42501": { kind: "forbidden", userMessage: "You don't have access to do that." },
  // PostgREST: no rows when exactly one was required.
  PGRST116: { kind: "unavailable", userMessage: "We couldn't find that item." },
  // PostgREST: the JWT is missing or expired.
  PGRST301: { kind: "auth", userMessage: "Your session expired. Please sign in again." },
  // Constraint and trigger failures raised by the migrations. These are
  // deterministic — retrying the identical request fails identically — so they
  // must not fall through to the retryable `server` default.
  "23514": { kind: "validation", userMessage: "That change isn't allowed." },
  "23503": { kind: "unavailable", userMessage: "We couldn't find that item." },
  "23505": { kind: "state-conflict", userMessage: "That already exists." },
  "22023": { kind: "validation", userMessage: "We couldn't process that request." },
};

function isPostgrestError(value: unknown): value is PostgrestError {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    "code" in value &&
    "details" in value
  );
}

function looksLikeNetworkFailure(value: unknown): boolean {
  if (!(value instanceof Error)) return false;
  return /network request failed|fetch failed|failed to fetch|timeout|aborted/i.test(value.message);
}

/**
 * Convert anything thrown or returned by the data layer into an `AppError`.
 * Call this in feature `api/` modules so every downstream consumer — query
 * hooks, screens, tests — sees one shape.
 */
export function toAppError(
  value: unknown,
  fallbackUserMessage = "Something went wrong.",
): AppError {
  if (isAppError(value)) return value;

  if (isAuthError(value)) {
    return new AppError({
      kind: "auth",
      userMessage: "Your session expired. Please sign in again.",
      technicalMessage: value.message,
      code: value.code ?? String(value.status ?? ""),
      cause: value,
    });
  }

  if (isPostgrestError(value)) {
    const code = value.code ?? "";
    const mapped = KISOK_CODE_MAP[code] ?? SQLSTATE_MAP[code];
    if (mapped) {
      return new AppError({
        kind: mapped.kind,
        userMessage: mapped.userMessage,
        technicalMessage: [value.message, value.details, value.hint].filter(Boolean).join(" | "),
        code,
        cause: value,
      });
    }
    return new AppError({
      kind: "server",
      userMessage: fallbackUserMessage,
      technicalMessage: [value.message, value.details, value.hint].filter(Boolean).join(" | "),
      code,
      cause: value,
    });
  }

  if (looksLikeNetworkFailure(value)) {
    return new AppError({
      kind: "network",
      userMessage: "We couldn't reach the network. Check the connection and try again.",
      technicalMessage: (value as Error).message,
      cause: value,
    });
  }

  return new AppError({
    kind: "unknown",
    userMessage: fallbackUserMessage,
    technicalMessage: value instanceof Error ? value.message : String(value),
    cause: value,
  });
}

/**
 * TanStack Query retry predicate. Only retries errors that can plausibly
 * succeed on a second attempt, so a `forbidden` or `validation` failure surfaces
 * immediately instead of after three round trips.
 */
export function shouldRetry(failureCount: number, error: unknown, maxRetries = 2): boolean {
  if (failureCount >= maxRetries) return false;
  return toAppError(error).retryable;
}
