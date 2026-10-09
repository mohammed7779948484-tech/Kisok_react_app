import { useCallback, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { LayoutGrid } from "lucide-react-native";

import { Icon, Text } from "@/design-system";

import { OptionRackItem } from "./option-rack-item";
import { PREVIEW_CHOICE_COUNT, type OptionChoice, type VariantDecision } from "./variant-decision";

/** Within this distance of the end, the "more below" fade is dropped. */
const END_THRESHOLD = 8;
/** Below this rack width, a pair of choices would squeeze their labels. */
const TWO_UP_MIN_WIDTH = 440;

/**
 * The choices, shown in place inside the Choice Canvas. Six or fewer are all
 * here. A larger set shows a six-choice preview (the current selection swapped
 * in) and a "Browse all" action: the full range — with search when it is long —
 * lives in the Option Browser, which Product Detail shows in place of the
 * Stage and Canvas. The rack itself never expands or searches, so the Order
 * Bar beneath it never moves. If the preview overflows a short canvas, the
 * rack scrolls and a soft fade says there is more below.
 */
export function OptionRack({
  decision,
  selectedId,
  onSelect,
  onBrowseAll,
  lowStockThreshold,
}: {
  decision: VariantDecision;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Opens the Option Browser; offered only when there are more than six choices. */
  onBrowseAll: () => void;
  lowStockThreshold: number;
}) {
  // Scroll metrics live in a ref; only the fade's on/off is state.
  const metrics = useRef({ viewport: 0, content: 0, offset: 0 });
  const [moreBelow, setMoreBelow] = useState(false);
  const updateMetrics = useCallback((next: Partial<typeof metrics.current>) => {
    Object.assign(metrics.current, next);
    const { viewport, content, offset } = metrics.current;
    setMoreBelow(content - viewport - offset > END_THRESHOLD);
  }, []);

  const [rackWidth, setRackWidth] = useState(0);
  const visible = decision.hasMore ? previewOf(decision.choices, selectedId) : decision.choices;
  const compact = decision.mode === "variations";
  const total = decision.choices.length;

  // Two choices per row when the rack is wide enough for a thumbnail and a
  // readable label side by side; one per row on a narrow rack.
  const perRow = rackWidth === 0 || rackWidth >= TWO_UP_MIN_WIDTH ? 2 : 1;
  const rows: OptionChoice[][] = [];
  for (let index = 0; index < visible.length; index += perRow) {
    rows.push(visible.slice(index, index + perRow));
  }

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      updateMetrics({ offset: event.nativeEvent.contentOffset.y }),
    [updateMetrics],
  );
  const handleViewport = useCallback(
    (event: LayoutChangeEvent) => updateMetrics({ viewport: event.nativeEvent.layout.height }),
    [updateMetrics],
  );

  return (
    <View className="min-h-0 flex-1">
      <View
        className="min-h-0 flex-1"
        onLayout={(event) => setRackWidth(Math.round(event.nativeEvent.layout.width))}
      >
        <ScrollView
          testID="catalog-option-rack"
          accessibilityRole="radiogroup"
          accessibilityLabel={`${decision.overline} options`}
          nestedScrollEnabled
          persistentScrollbar
          onLayout={handleViewport}
          onContentSizeChange={(_, height) => updateMetrics({ content: height })}
          onScroll={handleScroll}
          scrollEventThrottle={32}
          className="min-h-0 flex-1"
          contentContainerClassName="gap-2 pb-3 pr-1.5 pt-2.5"
        >
          {rows.map((row) => (
            <View key={row.map((choice) => choice.id).join("|")} className="flex-row gap-2">
              {row.map((choice) => (
                <OptionRackItem
                  key={choice.id}
                  choice={choice}
                  selected={choice.id === selectedId}
                  onSelect={onSelect}
                  compact={compact}
                  lowStockThreshold={lowStockThreshold}
                />
              ))}
              {row.length < perRow ? <View className="flex-1" /> : null}
            </View>
          ))}
        </ScrollView>
        {moreBelow ? (
          <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-10">
            <View className="h-1/3 bg-card/25" />
            <View className="h-1/3 bg-card/55" />
            <View className="h-1/3 bg-card/85" />
          </View>
        ) : null}
      </View>

      {decision.hasMore ? (
        <Pressable
          testID="catalog-option-show-all"
          accessibilityRole="button"
          accessibilityLabel={`Browse all ${total} ${decision.nounPlural}`}
          onPress={onBrowseAll}
          className="mt-1 min-h-touch flex-row items-center justify-center gap-2 rounded-md border border-border bg-card active:bg-muted"
        >
          <Icon as={LayoutGrid} size={15} className="text-primary" />
          <Text className="font-sans-extrabold text-meta text-primary">
            {`Browse all ${total} ${decision.nounPlural}`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The first six — with the selection swapped in if it would otherwise be hidden. */
function previewOf(choices: OptionChoice[], selectedId: string | null): OptionChoice[] {
  const preview = choices.slice(0, PREVIEW_CHOICE_COUNT);
  if (!selectedId || preview.some((choice) => choice.id === selectedId)) return preview;
  const selected = choices.find((choice) => choice.id === selectedId);
  return selected ? [...preview.slice(0, PREVIEW_CHOICE_COUNT - 1), selected] : preview;
}
