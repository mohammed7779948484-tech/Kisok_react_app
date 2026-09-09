/**
 * Pure display helpers for the preparation screens — mappers, no IO, no React
 * (a planned allowed manual file; see plan.md "Allowed manual files").
 *
 * The screens own WHAT they format; this module owns HOW a timestamp becomes
 * a label, so three screens (workspace board, order details, store-day
 * history) share one implementation instead of drifting copies (T13-R01).
 */

/**
 * The created time as the screens show it: wall-clock time in the effective
 * (store, else device) timezone — a fixed 24-hour clock, deterministic and
 * unambiguous on a shared kiosk.
 *
 * Built from `formatToParts` so the hour can be absorbed with `% 24` — the
 * same guard model/store-day.ts documents (:113-114): some ICU builds (Hermes
 * tablets) run an h24 cycle and would otherwise render midnight as "24:00"
 * with a 24-hour clock (T11-R05).
 */
export function formatCreatedAt(isoTimestamp: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(isoTimestamp));
  const component = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const hour = Number(component("hour")) % 24;
  return `${String(hour).padStart(2, "0")}:${component("minute")}`;
}
