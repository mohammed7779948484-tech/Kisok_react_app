/**
 * Small structured logger.
 *
 * Why this exists: features must not sprinkle `console.log`. ESLint forbids
 * `console` everywhere except this module, so this is the single place where
 * output is shaped, filtered by level, and stripped of sensitive values.
 *
 * It intentionally does NOT ship a crash-reporting SDK. If one is adopted
 * later, `setLogSink` is the single wiring point.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

export type LogRecord = {
  level: LogLevel;
  /** Dot-separated area, e.g. "checkout.submit" or "supabase.rpc". */
  scope: string;
  message: string;
  context?: LogContext;
};

export type LogSink = (record: LogRecord) => void;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Anything whose key looks like this is replaced before it can be printed. */
const SENSITIVE_KEY = /(token|password|secret|key|authorization|jwt|session|apikey|credential)/i;

const REDACTED = "[redacted]";

/**
 * Recursively redact values whose key looks sensitive. Depth-limited so a
 * cyclic or very deep object cannot hang the logger.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1);
  }
  return output;
}

const consoleSink: LogSink = (record) => {
  const context = record.context ? redact(record.context) : undefined;
  const prefix = `[${record.scope}]`;
  const args: unknown[] = context ? [prefix, record.message, context] : [prefix, record.message];

  if (record.level === "error") console.error(...args);
  else if (record.level === "warn") console.warn(...args);
  else console.log(...args);
};

let sink: LogSink = consoleSink;
// Production keeps warnings and errors only; development is chatty.
let minLevel: LogLevel = __DEV__ ? "debug" : "warn";

/** Swap the destination (tests, or a future crash reporter). */
export function setLogSink(next: LogSink) {
  sink = next;
}

export function setLogLevel(next: LogLevel) {
  minLevel = next;
}

export function resetLogging() {
  sink = consoleSink;
  minLevel = __DEV__ ? "debug" : "warn";
}

function emit(level: LogLevel, scope: string, message: string, context?: LogContext) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  sink({ level, scope, message, context });
}

/**
 * Create a scoped logger. Prefer one per module:
 *   const log = createLogger("cart.store");
 */
export function createLogger(scope: string) {
  return {
    debug: (message: string, context?: LogContext) => emit("debug", scope, message, context),
    info: (message: string, context?: LogContext) => emit("info", scope, message, context),
    warn: (message: string, context?: LogContext) => emit("warn", scope, message, context),
    error: (message: string, context?: LogContext) => emit("error", scope, message, context),
    /** Narrow the scope further without losing the parent path. */
    child: (childScope: string) => createLogger(`${scope}.${childScope}`),
  };
}

export type Logger = ReturnType<typeof createLogger>;
