import { Platform, View } from "react-native";

import { colorOf, Text } from "@/design-system";

import type { VariantDecision } from "./variant-decision";

/** Filling a split column, the canvas never grows past the reference height. */
const FILL_COLUMN = { flex: 1, maxHeight: 620 } as const;

/**
 * The decision panel: what is being chosen, how many choices there are, the
 * Option Rack, and the Order Bar pinned to its foot. Its height never follows
 * its content — fixed when stacked, or the column's own height (capped) in a
 * split layout — so expanding or searching the rack never moves the Order Bar.
 */
export function ChoiceCanvas({
  decision,
  height,
  rack,
  orderBar,
  condensed = false,
}: {
  decision: VariantDecision;
  /** Drop the explanatory line so an expanded rack gets the room. */
  condensed?: boolean;
  /** A fixed height; omit to fill the parent column, up to the cap. */
  height?: number;
  rack: React.ReactNode;
  orderBar: React.ReactNode;
}) {
  const count = decision.choices.length;
  return (
    <View
      className="overflow-hidden rounded-[28px] bg-card"
      style={[
        height !== undefined ? { height } : FILL_COLUMN,
        Platform.select({
          android: { elevation: 10 },
          default: {
            shadowColor: colorOf("primary"),
            shadowOpacity: 0.11,
            shadowRadius: 35,
            shadowOffset: { width: 0, height: 28 },
          },
        }),
      ]}
    >
      {/* The quiet disc in the corner echoes the reference's canvas wash. */}
      <View
        aria-hidden
        className="absolute -right-[90px] -top-[120px] h-[280px] w-[280px] rounded-full bg-secondary/60"
      />

      <View className="flex-row items-start justify-between gap-5 px-6 pb-3.5 pt-6">
        <View className="min-w-0 flex-1 gap-2">
          <Text className="font-sans-extrabold text-eyebrow uppercase tracking-[1.2px] text-primary">
            {decision.overline}
          </Text>
          <Text
            accessibilityRole="header"
            aria-level={2}
            className="font-display-semibold text-display-sm"
          >
            {decision.prompt}
          </Text>
          {!condensed ? (
            <Text
              className="text-caption leading-[17px] text-muted-foreground"
              style={{ maxWidth: 340 }}
            >
              {decision.context}
            </Text>
          ) : null}
        </View>
        {count > 1 ? (
          <View
            accessible
            accessibilityLabel={`${count} ${decision.nounPlural}`}
            className="items-end pt-0.5"
          >
            <Text className="font-display-semibold text-display-sm text-primary">
              {String(count)}
            </Text>
            <Text className="mt-1 text-eyebrow uppercase tracking-[1px] text-muted-foreground">
              {decision.nounPlural}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="min-h-0 flex-1 px-6 pb-2.5">{rack}</View>
      {orderBar}
    </View>
  );
}
