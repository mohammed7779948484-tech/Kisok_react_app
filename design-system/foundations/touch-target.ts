import type { Insets } from "react-native";

import { size } from "../tokens/sizing";

/**
 * Hit slop that grows a visibly smaller control to the 48dp touch floor.
 *
 * `touchSlop(40)` → 4dp on every side. Pass the control's visible size on each
 * axis; a control already at or above 48 gets no slop.
 */
export function touchSlop(visibleWidth: number, visibleHeight: number = visibleWidth): Insets {
  const horizontal = Math.max(0, Math.ceil((size.touch - visibleWidth) / 2));
  const vertical = Math.max(0, Math.ceil((size.touch - visibleHeight) / 2));
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}

export const TOUCH_TARGET = size.touch;
