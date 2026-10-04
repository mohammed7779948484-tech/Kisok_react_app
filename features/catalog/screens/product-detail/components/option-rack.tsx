import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import { Icon, SearchInput, Text } from "@/design-system";
import { cn } from "@/core/utils";

import { OptionRackItem } from "./option-rack-item";
import {
  filterChoices,
  PREVIEW_CHOICE_COUNT,
  type OptionChoice,
  type VariantDecision,
} from "./variant-decision";

/** Within this distance of the end, the "more below" fade is dropped. */
const END_THRESHOLD = 8;
const ROW_GAP = 8;
/** Below this rack width, a pair of choices would squeeze their labels. */
const TWO_UP_MIN_WIDTH = 440;

/**
 * The choices, shown in place — never behind a sheet. The rack keeps a fixed
 * height inside the Choice Canvas: a large set shows its first six, "Show
 * all" opens the full range *inside* the rack (scrolled to the current
 * choice), and search narrows it — so the page never grows and the Order Bar
 * never moves. Whenever the choices overflow, the rack scrolls and a soft fade
 * says there is more below.
 */
export function OptionRack({
  decision,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  expanded,
  onExpandedChange,
  lowStockThreshold,
}: {
  decision: VariantDecision;
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (next: string) => void;
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  lowStockThreshold: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const rowOffsets = useRef(new Map<string, number>());
  // Scroll metrics live in a ref; only the fade's on/off is state.
  const metrics = useRef({ viewport: 0, content: 0, offset: 0 });
  const [moreBelow, setMoreBelow] = useState(false);
  const updateMetrics = useCallback((next: Partial<typeof metrics.current>) => {
    Object.assign(metrics.current, next);
    const { viewport, content, offset } = metrics.current;
    setMoreBelow(content - viewport - offset > END_THRESHOLD);
  }, []);

  const [rackWidth, setRackWidth] = useState(0);
  const searching = decision.searchable && query.trim().length > 0;
  const matches = searching ? filterChoices(decision.choices, query) : decision.choices;
  const visible =
    searching || expanded || !decision.hasMore ? matches : previewOf(matches, selectedId);
  const compact = decision.mode === "variations";
  const hidden = decision.choices.length - PREVIEW_CHOICE_COUNT;

  // Two choices per row when the rack is wide enough for a thumbnail and a
  // readable label side by side; one per row on a narrow rack.
  const perRow = rackWidth === 0 || rackWidth >= TWO_UP_MIN_WIDTH ? 2 : 1;
  const rows: OptionChoice[][] = [];
  for (let index = 0; index < visible.length; index += perRow) {
    rows.push(visible.slice(index, index + perRow));
  }

  // Read by the effect below without re-running it on every selection.
  const selectedRowKey = rows
    .find((row) => row.some((choice) => choice.id === selectedId))
    ?.map((choice) => choice.id)
    .join("|");
  const selectedRowRef = useRef(selectedRowKey);
  selectedRowRef.current = selectedRowKey;

  // The row "Show all" should land on, when it has not laid out yet.
  const pendingRowKey = useRef<string | null>(null);
  const scrollToRow = useCallback((y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - ROW_GAP), animated: true });
  }, []);

  // Opening the full range lands on the current choice; closing it returns
  // to the top, where the preview begins. Runs only when the rack opens or
  // closes, never on a selection made inside it.
  useEffect(() => {
    pendingRowKey.current = null;
    if (!expanded) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    const key = selectedRowRef.current;
    if (!key) return;
    const y = rowOffsets.current.get(key);
    // The expanded rows are usually new; the target row scrolls itself into
    // view from its own onLayout below.
    if (y === undefined) pendingRowKey.current = key;
    else scrollToRow(y);
  }, [expanded, scrollToRow]);

  const handleRowLayout = useCallback(
    (rowKey: string, y: number) => {
      rowOffsets.current.set(rowKey, y);
      if (pendingRowKey.current === rowKey) {
        pendingRowKey.current = null;
        scrollToRow(y);
      }
    },
    [scrollToRow],
  );

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
      {decision.searchable ? (
        <SearchInput
          appearance="rule"
          value={query}
          onChangeText={onQueryChange}
          placeholder={`Find a ${decision.noun}…`}
          accessibilityLabel={`Search ${decision.nounPlural}`}
          trailing={matches.length}
        />
      ) : null}

      {expanded && !searching && decision.hasMore ? (
        <View className="flex-row items-center justify-between pt-2.5">
          <Text className="font-sans-extrabold text-eyebrow uppercase tracking-[0.8px] text-primary">
            All {decision.choices.length} {decision.nounPlural}
          </Text>
          <Text className="text-eyebrow uppercase tracking-[0.8px] text-muted-foreground">
            Scroll to browse
          </Text>
        </View>
      ) : null}

      <View
        className="min-h-0 flex-1"
        onLayout={(event) => setRackWidth(Math.round(event.nativeEvent.layout.width))}
      >
        <ScrollView
          ref={scrollRef}
          testID="catalog-option-rack"
          accessibilityRole="radiogroup"
          accessibilityLabel={`${decision.overline} options`}
          nestedScrollEnabled
          persistentScrollbar
          keyboardShouldPersistTaps="handled"
          onLayout={handleViewport}
          onContentSizeChange={(_, height) => updateMetrics({ content: height })}
          onScroll={handleScroll}
          scrollEventThrottle={32}
          className="min-h-0 flex-1"
          contentContainerClassName="gap-2 pb-3 pr-1.5 pt-2.5"
        >
          {rows.map((row) => {
            const rowKey = row.map((choice) => choice.id).join("|");
            return (
              <View
                key={rowKey}
                className="flex-row gap-2"
                onLayout={(event) => handleRowLayout(rowKey, event.nativeEvent.layout.y)}
              >
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
            );
          })}
          {visible.length === 0 ? (
            <Text
              accessibilityLiveRegion="polite"
              className="px-2 py-7 text-center text-meta text-muted-foreground"
            >
              No matching {decision.nounPlural}. Try another search.
            </Text>
          ) : null}
        </ScrollView>
        {moreBelow ? (
          <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-10">
            <View className="h-1/3 bg-card/25" />
            <View className="h-1/3 bg-card/55" />
            <View className="h-1/3 bg-card/85" />
          </View>
        ) : null}
      </View>

      {decision.hasMore && !searching ? (
        <Pressable
          testID="catalog-option-show-all"
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={
            expanded
              ? "Show fewer choices"
              : `Show all ${decision.choices.length} ${decision.nounPlural}`
          }
          onPress={() => onExpandedChange(!expanded)}
          className={cn(
            "mt-1 min-h-touch flex-row items-center justify-center gap-2 rounded-md border border-border active:bg-muted",
            expanded ? "bg-transparent" : "bg-card",
          )}
        >
          <Text className="font-sans-extrabold text-meta text-primary">
            {expanded ? "Show fewer" : `Show all ${decision.choices.length}`}
          </Text>
          {!expanded ? (
            <Text className="text-caption text-muted-foreground">{`· ${hidden} more`}</Text>
          ) : null}
          <Icon as={expanded ? ChevronUp : ChevronDown} size={15} className="text-primary" />
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
