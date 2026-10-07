import { Platform, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { Compass } from "lucide-react-native";

import { colorOf, Icon, size, Text } from "@/design-system";
import { cn } from "@/core/utils";

/** The pill's height: the primary call-to-action height (`h-control-lg`). */
const PILL_HEIGHT = size["control-lg"];
/** The pill's least distance from the bottom of the content area. */
export const HELP_ME_CHOOSE_PILL_MIN_BOTTOM_OFFSET = 24;
/** Room between the last row of a page and the top of the pill. */
const BREATHING_ROOM = 16;

/**
 * The vertical room a page reserves below its scroll content so its last row
 * scrolls clear of the floating pill.
 */
export const HELP_ME_CHOOSE_PILL_CLEARANCE =
  PILL_HEIGHT + HELP_ME_CHOOSE_PILL_MIN_BOTTOM_OFFSET + BREATHING_ROOM;

const SOFT_ELEVATION = Platform.select<ViewStyle>({
  android: { elevation: 6 },
  default: {
    shadowColor: colorOf("primary"),
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
});

export type HelpMeChoosePillProps = {
  onPress: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The floating way into Help Me Choose: an extended pill — compass plus words,
 * never icon-only. A quiet card surface keeps it secondary to the filled cart
 * button in the header, and it holds still: no pulse, no bounce.
 *
 * Presentational: the caller decides where it floats and where it leads.
 */
export function HelpMeChoosePill({ onPress, className, style }: HelpMeChoosePillProps) {
  return (
    <Pressable
      testID="help-me-choose-pill"
      accessibilityRole="button"
      accessibilityLabel="Help me choose"
      accessibilityHint="Answer a few quick questions to narrow the products"
      onPress={onPress}
      className={cn(
        // 56dp tall; it only grows, never clips, when text is scaled up.
        "min-h-control-lg max-w-[420px] flex-row items-center gap-2.5 rounded-full border border-border bg-card px-6 py-2 active:bg-muted",
        className,
      )}
      style={[SOFT_ELEVATION, style]}
    >
      <Icon as={Compass} size={20} className="text-primary" />
      <Text className="shrink font-sans-bold text-body-lg text-primary">Help me choose</Text>
    </Pressable>
  );
}
