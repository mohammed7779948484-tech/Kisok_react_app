import { useCallback, useRef, useState } from "react";
import {
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { Separator } from "@/design-system";

import type { BrowseFacets, BrowseFilters } from "../model/browse-filters";
import { BrowseFilterRail, FilterRailHeader } from "./browse-filter-rail";

/** Within this distance of the end, the "more below" fade is dropped. */
const END_THRESHOLD = 8;

/**
 * The filter rail as its own scroller: the header stays put, the facets scroll
 * independently of the results, and a soft fade at the foot says there is
 * more below until the list is scrolled to its end.
 */
export function FilterRailPanel({
  facets,
  filters,
  onChange,
  showCategories,
  showBrands,
}: {
  facets: BrowseFacets;
  filters: BrowseFilters;
  onChange: (next: BrowseFilters) => void;
  showCategories?: boolean;
  showBrands?: boolean;
}) {
  // Metrics live in a ref; only the fade's on/off is state, so scrolling and
  // the rail's changing height re-render only when the fade flips.
  const metrics = useRef({ viewport: 0, content: 0, offset: 0 });
  const [moreBelow, setMoreBelow] = useState(false);
  const update = useCallback((next: Partial<typeof metrics.current>) => {
    Object.assign(metrics.current, next);
    const { viewport, content, offset } = metrics.current;
    setMoreBelow(content - viewport - offset > END_THRESHOLD);
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      update({ offset: event.nativeEvent.contentOffset.y }),
    [update],
  );
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => update({ viewport: event.nativeEvent.layout.height }),
    [update],
  );

  return (
    <View className="flex-1 border-r border-border">
      <View className="gap-4 pb-4 pr-6 pt-6">
        <FilterRailHeader filters={filters} onChange={onChange} />
        <Separator />
      </View>
      <View className="min-h-0 flex-1">
        <ScrollView
          onLayout={handleLayout}
          onContentSizeChange={(_, height) => update({ content: height })}
          onScroll={handleScroll}
          scrollEventThrottle={32}
          persistentScrollbar
          accessibilityLabel="Filters"
          contentContainerClassName="pb-10 pr-5"
        >
          <BrowseFilterRail
            header={false}
            facets={facets}
            filters={filters}
            onChange={onChange}
            showCategories={showCategories}
            showBrands={showBrands}
          />
        </ScrollView>
        {moreBelow ? (
          <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-14">
            <View className="h-1/3 bg-background/30" />
            <View className="h-1/3 bg-background/60" />
            <View className="h-1/3 bg-background/90" />
          </View>
        ) : null}
      </View>
    </View>
  );
}
