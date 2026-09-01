import {
  currentStoreDayWindow,
  effectiveTimezone,
  groupTerminalOrders,
  isResolvableZone,
  isTerminalInDay,
  orderTerminalInstant,
  resolveStoreTimezone,
  type StoreDayOrder,
  type StoreDayWindow,
} from "./store-day";

/**
 * The store-day rules (plan decision 2): an order belongs to the store day of
 * the instant it BECAME terminal — completed_at for completed, cancelled_at for
 * cancelled — evaluated in the store timezone. These tests pin that math with
 * FIXED instants and FIXED zones, so nothing here depends on the runner's
 * clock or the device timezone:
 *
 * - Asia/Aden: a fixed UTC+03 zone with no DST — pins whole-hour offset math
 *   and the normal 24-hour day without any transition noise.
 * - America/New_York: pins BOTH DST directions of 2026 AND the window LENGTH
 *   the calendar-midnight end produces — 23 hours on the 2026-03-08
 *   spring-forward day, 25 hours on the 2026-11-01 fall-back day (a fixed
 *   `start + 24h` end would drop the final local hour of the 25-hour day —
 *   T06-R02).
 * - America/Havana: pins the 00:00-local spring-forward edge — the round-trip
 *   alone lands midnight in the transition gap and maps to the previous local
 *   date; the day start must be the transition instant itself (T06-R03).
 *
 * The device-timezone fallback is exercised only through
 * effectiveTimezone's explicit fallback parameter — never by reading the real
 * device zone into an expectation (except the one no-fallback case, which
 * asserts against the same Intl expression the implementation uses).
 */

/** The local calendar date of an instant in a zone, "YYYY-MM-DD" (test-local, fixed zones). */
function localDate(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** A minimal terminal-status order, with every field the rules key on. */
function makeOrder(fields: Partial<StoreDayOrder> & Pick<StoreDayOrder, "status">): StoreDayOrder {
  return { completed_at: null, cancelled_at: null, ...fields };
}

const HOUR_MILLIS = 60 * 60 * 1000;

describe("currentStoreDayWindow", () => {
  it("keys the day on the store-local calendar date: 22:00Z in UTC+03 is already the next store day", () => {
    // 2026-08-26T22:00Z is 2026-08-27T01:00 in Asia/Aden, so the current store
    // day is Aug 27 local: [Aug 26 21:00Z, Aug 27 21:00Z).
    const window = currentStoreDayWindow(new Date("2026-08-26T22:00:00.000Z"), "Asia/Aden");

    expect(window.startUtc.toISOString()).toBe("2026-08-26T21:00:00.000Z");
    expect(window.endUtc.toISOString()).toBe("2026-08-27T21:00:00.000Z");
  });

  it("an instant well inside the store day resolves to that same day's window", () => {
    // 05:00Z is 08:00 local the same calendar date — window is Aug 26 local.
    const window = currentStoreDayWindow(new Date("2026-08-26T05:00:00.000Z"), "Asia/Aden");

    expect(window.startUtc.toISOString()).toBe("2026-08-25T21:00:00.000Z");
    expect(window.endUtc.toISOString()).toBe("2026-08-26T21:00:00.000Z");
  });

  it("a DST-free zone has 24-hour windows — next local midnight is start + 24h", () => {
    const window = currentStoreDayWindow(new Date("2026-08-26T22:00:00.000Z"), "Asia/Aden");

    expect(window.endUtc.getTime() - window.startUtc.getTime()).toBe(24 * HOUR_MILLIS);
  });

  it("America/New_York across the 2026 spring-forward: a 23-hour window [05:00Z, 04:00Z next)", () => {
    // DST starts 2026-03-08 at 02:00 EST (07:00Z). The DST day's midnight is
    // still EST (UTC-5) → 05:00Z; the NEXT day's midnight is EDT (UTC-4) →
    // 04:00Z. The window between two local midnights spans the skipped hour:
    // 23 hours, not 24.
    const dstDay = currentStoreDayWindow(new Date("2026-03-08T12:00:00.000Z"), "America/New_York");
    const dayAfter = currentStoreDayWindow(
      new Date("2026-03-09T12:00:00.000Z"),
      "America/New_York",
    );

    expect(dstDay.startUtc.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(dstDay.endUtc.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(dstDay.endUtc.getTime() - dstDay.startUtc.getTime()).toBe(23 * HOUR_MILLIS);
    expect(dayAfter.startUtc.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("America/New_York across the 2026 fall-back: a 25-hour window [04:00Z, 05:00Z next)", () => {
    // DST ends 2026-11-01 at 02:00 EDT (06:00Z). Nov 1's midnight is still EDT
    // (UTC-4) → 04:00Z; Nov 2's midnight is EST (UTC-5) → 05:00Z. The window
    // between two local midnights spans the repeated hour: 25 hours — a fixed
    // `start + 24h` end would end the day at local 23:00 and drop the final
    // local hour (T06-R02).
    const dstDay = currentStoreDayWindow(new Date("2026-11-01T12:00:00.000Z"), "America/New_York");
    const dayAfter = currentStoreDayWindow(
      new Date("2026-11-02T12:00:00.000Z"),
      "America/New_York",
    );

    expect(dstDay.startUtc.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(dstDay.endUtc.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(dstDay.endUtc.getTime() - dstDay.startUtc.getTime()).toBe(25 * HOUR_MILLIS);
    expect(dayAfter.startUtc.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("keeps the fall-back day's final local hour: an order terminal at local 23:15 is still in the day", () => {
    // The reviewer's exact repro (T06-R02): 2026-11-02T04:15Z is 23:15 local
    // on Nov 1 (EST, UTC-5) — inside the 2026-11-01 window under calendar
    // midnight bounds, but AFTER the end under a fixed start+24h end.
    const window = currentStoreDayWindow(new Date("2026-11-01T12:00:00.000Z"), "America/New_York");
    const order = makeOrder({ status: "completed", completed_at: "2026-11-02T04:15:00.000Z" });

    expect(isTerminalInDay(order, window)).toBe(true);
  });

  it("America/Havana spring-forward at local 00:00: the transition instant is the day start (T06-R03)", () => {
    // Havana jumps 00:00 → 01:00 local on 2026-03-08, so local midnight does
    // not exist. The round-trip alone maps 2026-03-08T00:00 to 2026-03-07
    // 23:00 local (the pre-transition offset) — the existence check must walk
    // forward to the first instant whose local date IS 2026-03-08: the
    // transition itself, 2026-03-08T05:00Z (00:00 EST → 01:00 EDT).
    const window = currentStoreDayWindow(new Date("2026-03-08T12:00:00.000Z"), "America/Havana");

    expect(window.startUtc.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(localDate(window.startUtc, "America/Havana")).toBe("2026-03-08");
  });

  it("throws for an unvalidated zone — callers pass effectiveTimezone's result", () => {
    expect(() =>
      currentStoreDayWindow(new Date("2026-08-26T22:00:00.000Z"), "Kisok/NotAZone"),
    ).toThrow(RangeError);
  });
});

describe("isTerminalInDay", () => {
  const window: StoreDayWindow = {
    startUtc: new Date("2026-08-26T21:00:00.000Z"),
    endUtc: new Date("2026-08-27T21:00:00.000Z"),
  };

  it("includes a terminal instant exactly at the start, excludes one exactly at the end", () => {
    // [start, end): the start belongs to the day, the end belongs to the next.
    const atStart = makeOrder({ status: "completed", completed_at: "2026-08-26T21:00:00.000Z" });
    const atEnd = makeOrder({ status: "completed", completed_at: "2026-08-27T21:00:00.000Z" });

    expect(isTerminalInDay(atStart, window)).toBe(true);
    expect(isTerminalInDay(atEnd, window)).toBe(false);
  });

  it("excludes terminal instants before the window — the order belongs to a previous store day", () => {
    const justBefore = makeOrder({ status: "cancelled", cancelled_at: "2026-08-26T20:59:59.999Z" });

    expect(isTerminalInDay(justBefore, window)).toBe(false);
  });

  it("includes a cancelled order by its cancelled_at", () => {
    const cancelled = makeOrder({ status: "cancelled", cancelled_at: "2026-08-27T12:00:00.000Z" });

    expect(isTerminalInDay(cancelled, window)).toBe(true);
  });

  it("excludes non-terminal orders — no terminal instant, no store day", () => {
    const active = makeOrder({ status: "preparing" });

    expect(isTerminalInDay(active, window)).toBe(false);
  });

  it("parses the real PostgREST wire timestamp format — microseconds plus numeric offset (T06-R06)", () => {
    // Direct reads arrive as Postgres renders timestamptz: microsecond
    // precision and a "+00:00" offset, not the bare "Z" form the hook's own
    // bound uses. `new Date(...)` must parse it to the right instant.
    const windowUtcDay: StoreDayWindow = {
      startUtc: new Date("2026-08-26T00:00:00.000Z"),
      endUtc: new Date("2026-08-27T00:00:00.000Z"),
    };
    const completed = makeOrder({
      status: "completed",
      completed_at: "2026-08-26T12:34:56.599407+00:00",
    });

    expect(orderTerminalInstant(completed)?.toISOString()).toBe("2026-08-26T12:34:56.599Z");
    expect(isTerminalInDay(completed, windowUtcDay)).toBe(true);

    // A wire-format terminal instant exactly at the window's end is the next
    // day's, and a cancelled order's wire timestamp keys the same way.
    const atEnd = makeOrder({
      status: "cancelled",
      cancelled_at: "2026-08-27T00:00:00.000000+00:00",
    });
    expect(isTerminalInDay(atEnd, windowUtcDay)).toBe(false);
  });
});

describe("orderTerminalInstant", () => {
  it("uses completed_at for a completed order, cancelled_at for a cancelled one", () => {
    const completed = makeOrder({ status: "completed", completed_at: "2026-08-26T21:00:00.000Z" });
    const cancelled = makeOrder({ status: "cancelled", cancelled_at: "2026-08-27T09:30:00.000Z" });

    expect(orderTerminalInstant(completed)?.toISOString()).toBe("2026-08-26T21:00:00.000Z");
    expect(orderTerminalInstant(cancelled)?.toISOString()).toBe("2026-08-27T09:30:00.000Z");
  });

  it("status decides which timestamp counts when both are present", () => {
    const order = makeOrder({
      status: "cancelled",
      completed_at: "2026-08-26T10:00:00.000Z",
      cancelled_at: "2026-08-27T09:30:00.000Z",
    });

    expect(orderTerminalInstant(order)?.toISOString()).toBe("2026-08-27T09:30:00.000Z");
  });

  it("resolves null for every non-terminal status, and for a terminal status with a null timestamp", () => {
    expect(orderTerminalInstant(makeOrder({ status: "new" }))).toBeNull();
    expect(orderTerminalInstant(makeOrder({ status: "preparing" }))).toBeNull();
    expect(orderTerminalInstant(makeOrder({ status: "ready" }))).toBeNull();
    // The model is total: a completed row whose completed_at is null (a data
    // integrity anomaly) has no terminal instant either.
    expect(orderTerminalInstant(makeOrder({ status: "completed" }))).toBeNull();
  });
});

describe("groupTerminalOrders", () => {
  it("splits by terminal status and re-sorts each group newest-first by terminal instant", () => {
    const completedOld = makeOrder({
      status: "completed",
      completed_at: "2026-08-26T10:00:00.000Z",
    });
    const completedNew = makeOrder({
      status: "completed",
      completed_at: "2026-08-26T14:00:00.000Z",
    });
    const cancelledEarly = makeOrder({
      status: "cancelled",
      cancelled_at: "2026-08-26T09:00:00.000Z",
    });
    const cancelledLate = makeOrder({
      status: "cancelled",
      cancelled_at: "2026-08-26T13:00:00.000Z",
    });
    const active = makeOrder({ status: "ready" });

    const input = [completedOld, active, completedNew, cancelledEarly, cancelledLate];
    const grouped = groupTerminalOrders(input);

    expect(grouped.completed).toEqual([completedNew, completedOld]);
    expect(grouped.cancelled).toEqual([cancelledLate, cancelledEarly]);
    // Non-terminal rows are not part of either group — history only shows
    // terminal work.
    expect([...grouped.completed, ...grouped.cancelled]).not.toContain(active);
  });

  it("does not mutate the input array", () => {
    const first = makeOrder({ status: "completed", completed_at: "2026-08-26T10:00:00.000Z" });
    const second = makeOrder({ status: "cancelled", cancelled_at: "2026-08-26T13:00:00.000Z" });
    const input = [first, second];

    groupTerminalOrders(input);

    expect(input).toEqual([first, second]);
  });
});

describe("resolveStoreTimezone / effectiveTimezone", () => {
  it("reports the settings row's timezone, and null when the row is absent", () => {
    expect(resolveStoreTimezone({ store_timezone: "Asia/Aden" })).toBe("Asia/Aden");
    expect(resolveStoreTimezone(null)).toBeNull();
  });

  it("passes an unresolvable zone through untouched — validation lives in effectiveTimezone", () => {
    // The DB only checks non-blank text (migration 20260826050002), so the
    // resolver's job is the honest signal, not the fallback.
    expect(resolveStoreTimezone({ store_timezone: "Kisok/NotAZone" })).toBe("Kisok/NotAZone");
  });

  it("prefers a resolvable store timezone over the fallback", () => {
    expect(effectiveTimezone("Asia/Aden", "America/New_York")).toBe("Asia/Aden");
    expect(effectiveTimezone("Asia/Aden")).toBe("Asia/Aden");
  });

  it("falls back when the store timezone is absent", () => {
    expect(effectiveTimezone(null, "America/New_York")).toBe("America/New_York");
  });

  it("degrades an unresolvable zone to the fallback instead of throwing (T04-R02/O-2)", () => {
    // The forward constraint from T04's review: garbage in store_timezone must
    // behave like an absent row, never take the board down with a RangeError.
    expect(effectiveTimezone("Kisok/NotAZone", "America/New_York")).toBe("America/New_York");
  });

  it("degrades an unresolvable zone to the device zone when no fallback is given, without throwing", () => {
    // The only place the device zone is read: the no-fallback form, asserted
    // against the same Intl expression the implementation uses, so the
    // expectation holds on any runner.
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(effectiveTimezone("Kisok/NotAZone")).toBe(deviceZone);
    expect(effectiveTimezone(null)).toBe(deviceZone);
  });
});

describe("isResolvableZone", () => {
  it("accepts real IANA zone names", () => {
    expect(isResolvableZone("Asia/Aden")).toBe(true);
    expect(isResolvableZone("America/New_York")).toBe(true);
    expect(isResolvableZone("America/Havana")).toBe(true);
  });

  it("rejects garbage strings the btrim check would happily store", () => {
    expect(isResolvableZone("Kisok/NotAZone")).toBe(false);
    expect(isResolvableZone("not a zone")).toBe(false);
    expect(isResolvableZone("")).toBe(false);
  });
});
