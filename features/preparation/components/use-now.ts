import { useEffect, useState } from "react";

/**
 * The current time, refreshed on a slow cadence (default: every 30 s) for
 * order ages and the store clock. Not an animation: the numbers simply stay
 * truthful through a shift.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
