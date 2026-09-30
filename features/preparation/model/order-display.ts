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

/** Whole minutes between an ISO timestamp and `now`, never negative. */
export function minutesSince(isoTimestamp: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(isoTimestamp)) / 60_000));
}

/** A short age label: "just now", "4 min", "1 h 12 min". */
export function formatAge(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

type SummarizableItem = { product_name: string; quantity: number };

/** Line count, unit count and the first product names, for a compact ticket. */
export function summarizeItems(items: readonly SummarizableItem[], names = 2) {
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  const lead = items.slice(0, names).map((item) => `${item.product_name} ×${item.quantity}`);
  const more = items.length - lead.length;
  return {
    lines: items.length,
    units,
    headline: more > 0 ? `${lead.join(", ")} +${more} more` : lead.join(", "),
  };
}

/** `variant_options` snapshot → "Type: Value" labels; malformed entries are skipped. */
export function optionTexts(variantOptions: unknown): string[] {
  if (!Array.isArray(variantOptions)) return [];
  const labels: string[] = [];
  for (const entry of variantOptions) {
    if (typeof entry !== "object" || entry === null) continue;
    const { type, value } = entry as Record<string, unknown>;
    if (typeof type === "string" && typeof value === "string") labels.push(`${type}: ${value}`);
  }
  return labels;
}
