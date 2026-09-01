import { formatCreatedAt } from "./order-display";

/**
 * The lifted created-time formatter's unit contract (the T13-R01 lift): a
 * fixed `HH:MM` 24-hour wall-clock label in the given timezone, with the hour
 * absorbed through `% 24`.
 *
 * The two screens this helper was lifted from (workspace, order-details) pin
 * the same behaviour through their midnight cases; this file pins the PURE
 * helper directly so a third consumer (the history screen, T14) can import it
 * without inheriting a screen test's incidental coverage.
 *
 * The midnight case's disclosure (the h23-ICU precedent the screens document):
 * a 24-hour `en-CA` formatter runs an h24 cycle on some ICU builds (Hermes
 * tablets) and would emit hour "24" at midnight — Node's ICU here is h23 and
 * emits "00" directly. The `% 24` guard makes the OUTPUT "00:00" identical on
 * either cycle, which is exactly what is pinned; the input-side difference
 * ("24" vs "00" from `formatToParts`) is not observable through this function
 * and is not asserted.
 */

/** Asia/Riyadh is UTC+3 with no DST — a fully deterministic display zone. */
const STORE_TIMEZONE = "Asia/Riyadh";

describe("formatCreatedAt", () => {
  it("formats an ISO instant as HH:MM wall-clock time in the given timezone", () => {
    // 05:00 UTC renders as 08:00 in Asia/Riyadh (UTC+3, no DST).
    expect(formatCreatedAt("2026-08-26T05:00:08.123456+00:00", STORE_TIMEZONE)).toBe("08:00");

    // The shape itself: exactly two digits, a colon, two digits — the shared
    // caption contract every consuming screen renders verbatim.
    expect(formatCreatedAt("2026-08-26T05:00:08.123456+00:00", STORE_TIMEZONE)).toMatch(
      /^\d{2}:\d{2}$/,
    );
  });

  it("pads single-digit hours and minutes to two digits", () => {
    // 06:05 UTC in the UTC zone — both components single-digit, both padded.
    expect(formatCreatedAt("2026-08-26T06:05:00.000000+00:00", "UTC")).toBe("06:05");
  });

  it("renders midnight as 00:00, never 24:00", () => {
    // 21:00 UTC is 00:00 the next day in Asia/Riyadh — the hour an h24-cycle
    // ICU build (Hermes tablets) would emit as "24" with a 24-hour clock; the
    // `% 24` absorption turns both cycles into "00" (see the file docblock).
    expect(formatCreatedAt("2026-08-26T21:00:08.123456+00:00", STORE_TIMEZONE)).toBe("00:00");
    expect(formatCreatedAt("2026-08-26T21:00:08.123456+00:00", STORE_TIMEZONE)).not.toBe("24:00");
  });
});
