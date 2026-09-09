/**
 * The store-day rules (plan decision 2): an order belongs to the store day of
 * the instant it BECAME terminal — `completed_at` for a completed order,
 * `cancelled_at` for a cancelled one — evaluated in the store timezone.
 * Keying on `created_at` instead would split a day's finished work across
 * midnight (an order created before the boundary and cancelled after it would
 * land in yesterday's history).
 *
 * PURE domain rules: no IO, no React, no Supabase — not even a type-only
 * import of the generated row types (ESLint keeps `@/core/supabase` inside
 * `api/`, and the api layer owns the database contract). The row types below
 * are structural: a generated `Tables<"orders">` / `Tables<"store_settings">`
 * row satisfies them field-for-field, which the api test pins at compile
 * time.
 *
 * All timezone math goes through `Intl` (the only source of DST truth on both
 * Hermes and Node) — no hand-rolled offset tables anywhere in this module.
 */
/** Exactly one day, as UTC instants: `[startUtc, endUtc)`. */
export type StoreDayWindow = {
  startUtc: Date;
  endUtc: Date;
};

/**
 * The `order_status` enum, mirroring migration 20260826050004. Duplicated here
 * only because the model cannot import the generated enum type (see the
 * module docblock); the api test pins the assignability that keeps the two in
 * step.
 */
export type OrderStatus = "new" | "preparing" | "ready" | "completed" | "cancelled";

/**
 * The order fields the store-day rules key on. Structural: every
 * `Tables<"orders">` row satisfies it, and nothing else is read.
 */
export type StoreDayOrder = {
  status: OrderStatus;
  completed_at: string | null;
  cancelled_at: string | null;
};

/**
 * The settings fields the store-day rules read. Structural: the generated
 * `Tables<"store_settings">` row satisfies it.
 */
export type StoreTimezoneSource = {
  store_timezone: string;
};

const HOUR_MILLIS = 60 * 60 * 1000;

/**
 * The store timezone from the singleton settings row, or null when the row is
 * absent (no migration seeds it — plan decision 8). No fallback is baked in
 * here: the caller decides, through {@link effectiveTimezone}. An
 * unresolvable zone passes through untouched — the honest signal, validated
 * downstream.
 */
export function resolveStoreTimezone(settings: StoreTimezoneSource | null): string | null {
  return settings?.store_timezone ?? null;
}

/**
 * Whether `Intl` can resolve `timezone` as a zone. The `store_settings` check
 * constraint only enforces non-blank text (migration 20260826050002), so a
 * garbage string can reach this code — and `Intl` would throw `RangeError` on
 * it. T04's review forward constraint: such a value must degrade like an
 * absent row, never take a screen down.
 */
export function isResolvableZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The timezone screens actually compute with: the store timezone when it
 * resolves, otherwise the fallback — the device zone by default (plan
 * decision 8), or an explicit one for tests. Degrading an unresolvable store
 * zone here (T04-R02/O-2) is what keeps a garbage `store_timezone` value from
 * throwing at render time.
 */
export function effectiveTimezone(storeTz: string | null, fallbackTz?: string): string {
  if (storeTz !== null && isResolvableZone(storeTz)) return storeTz;
  return fallbackTz ?? deviceLocalTimezone();
}

/** The device's own zone, via `Intl` — the fallback of last resort. */
function deviceLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * The store-local calendar date of `instant` in `timezone`, as "YYYY-MM-DD".
 * `en-CA` is one of the locales that renders exactly that shape.
 */
function storeLocalDate(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * The offset of `timezone` at `instant`, in milliseconds, derived by rendering
 * the instant's wall-clock components in the zone and comparing them with the
 * same components read as UTC — the formatter round-trip. `hour % 24` absorbs
 * the "24:00" some ICU builds emit for midnight with a 24-hour clock.
 */
function zoneOffsetMillis(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const component = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part === undefined ? 0 : Number(part.value);
  };

  const wallClockAsUtc = Date.UTC(
    component("year"),
    component("month") - 1,
    component("day"),
    component("hour") % 24,
    component("minute"),
    component("second"),
  );
  return wallClockAsUtc - instant.getTime();
}

/**
 * The UTC instant of `localWallClock` ("YYYY-MM-DDTHH:mm:ss") read as wall
 * clock in `timezone`. Two-stage standard approach:
 *
 * 1. Two-pass round-trip: guess UTC, measure the zone's offset at that guess,
 *    correct, repeat once.
 * 2. Existence check: if the result's own local date is not the target date,
 *    the wall clock fell inside a transition gap (or its fold) and mapped to
 *    the wrong day — zones whose spring-forward lands exactly at local 00:00
 *    (America/Havana, Asia/Beirut, Africa/Cairo) do this to midnight, because
 *    the first pass's offset belongs to the pre-transition regime. Step the
 *    candidate in 1-hour jumps (bounded at 3 — transitions are hours wide)
 *    forward when the local date is BEFORE the target, backward when AFTER,
 *    until the local dates agree.
 *
 * A nonexistent wall clock (like 00:00 on a 00:00 spring-forward day) has no
 * instant of its own; the procedure converges on the transition instant
 * itself, which is the correct day start for such zones — the first instant
 * whose local date IS the target date.
 */
function zonedTimeToUtc(localWallClock: string, timezone: string): Date {
  const asUtc = Date.parse(`${localWallClock}Z`);
  let candidate = asUtc;
  for (let pass = 0; pass < 2; pass += 1) {
    const offset = zoneOffsetMillis(new Date(candidate), timezone);
    candidate = asUtc - offset;
  }

  const targetDate = localWallClock.slice(0, 10);
  for (let step = 0; step < 3; step += 1) {
    const local = storeLocalDate(new Date(candidate), timezone);
    if (local === targetDate) break;
    candidate += local < targetDate ? HOUR_MILLIS : -HOUR_MILLIS;
  }
  return new Date(candidate);
}

/** The calendar date one day after `dateStr` ("YYYY-MM-DD"), on the string's own date arithmetic. */
function nextCalendarDate(dateStr: string): string {
  const noon = new Date(Date.parse(`${dateStr}T12:00:00Z`));
  noon.setUTCDate(noon.getUTCDate() + 1);
  return noon.toISOString().slice(0, 10);
}

/**
 * The current store day's bounds: the store-local calendar date of `now` in
 * `timezone`, as the UTC instants of that date's local midnight (`startUtc`)
 * and the NEXT local date's midnight (`endUtc`) — a
 * `[localMidnight, nextLocalMidnight)` interval. That makes a 23-hour day on
 * spring-forward days, a 25-hour day on fall-back days, and 24 hours
 * otherwise: calendar-midnight bounds, NOT `start + 24h`, which would drop
 * the final local hour of every 25-hour day.
 *
 * `timezone` must be a resolvable zone — pass {@link effectiveTimezone}'s
 * result; a garbage string makes the `Intl` formatters throw `RangeError`.
 */
export function currentStoreDayWindow(now: Date, timezone: string): StoreDayWindow {
  const dateStr = storeLocalDate(now, timezone);
  const startUtc = zonedTimeToUtc(`${dateStr}T00:00:00`, timezone);
  const endUtc = zonedTimeToUtc(`${nextCalendarDate(dateStr)}T00:00:00`, timezone);
  return { startUtc, endUtc };
}

/**
 * The instant an order became terminal: `completed_at` for a completed order,
 * `cancelled_at` for a cancelled one — status decides which timestamp counts.
 * Null for every non-terminal status, and for a terminal status whose
 * timestamp is null (a data anomaly the model is total against). The history
 * read only returns terminal rows, but this stays safe for any row.
 */
export function orderTerminalInstant(order: StoreDayOrder): Date | null {
  if (order.status === "completed") {
    return order.completed_at === null ? null : new Date(order.completed_at);
  }
  if (order.status === "cancelled") {
    return order.cancelled_at === null ? null : new Date(order.cancelled_at);
  }
  return null;
}

/**
 * Whether the order became terminal inside `window` — `[start, end)`: the
 * start instant belongs to the day, the end belongs to the next one. Rows with
 * no terminal instant never match.
 */
export function isTerminalInDay(order: StoreDayOrder, window: StoreDayWindow): boolean {
  const instant = orderTerminalInstant(order);
  if (instant === null) return false;
  return instant >= window.startUtc && instant < window.endUtc;
}

/**
 * Split terminal orders into their two history groups, each newest-first by
 * terminal instant (this helper re-sorts — do not rely on the input's order).
 * Non-terminal rows are dropped from both groups, and rows whose terminal
 * instant is null sort last within their group. The input array is not
 * mutated; the row type is preserved, so full order rows come back out.
 */
export function groupTerminalOrders<TOrder extends StoreDayOrder>(
  orders: TOrder[],
): { completed: TOrder[]; cancelled: TOrder[] } {
  const sorted = [...orders].sort((left, right) => {
    const leftInstant = orderTerminalInstant(left)?.getTime() ?? Number.NEGATIVE_INFINITY;
    const rightInstant = orderTerminalInstant(right)?.getTime() ?? Number.NEGATIVE_INFINITY;
    return rightInstant - leftInstant;
  });

  const completed: TOrder[] = [];
  const cancelled: TOrder[] = [];
  for (const order of sorted) {
    if (order.status === "completed") completed.push(order);
    else if (order.status === "cancelled") cancelled.push(order);
  }
  return { completed, cancelled };
}
