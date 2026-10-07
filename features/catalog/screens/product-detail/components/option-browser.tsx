import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, Pressable, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";

import { Button, Icon, MediaFrame, SearchInput, Text } from "@/design-system";

import { CatalogGrid, type CatalogGridRowInfo } from "../../../components/catalog-grid";
import type { CatalogMedia } from "../../../model/catalog-view";
import { OptionRackItem } from "./option-rack-item";
import {
  browseOrder,
  filterChoices,
  type OptionChoice,
  type VariantDecision,
} from "./variant-decision";

/** Three tiles fit across a 1280 landscape tablet; narrower screens drop to two, then one. */
const TILE_MIN_WIDTH = 230;
const TILE_GAP = 8;
/** The context column beside the grid in a split (landscape) layout. */
const CONTEXT_COLUMN_WIDTH = 400;

export type OptionBrowserProps = {
  decision: VariantDecision;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Returns to the Stage and Choice Canvas. */
  onClose: () => void;
  lowStockThreshold: number;
  /** Landscape: a context column beside the grid. Otherwise stacked. */
  split: boolean;
  /** The product's name. */
  title: string;
  /** The selected option's picture, else the product's cover. */
  media: CatalogMedia | null;
  availableCount: number;
  total: number;
  /** The same Order Bar (selection, quantity, Add) the Choice Canvas hosts. */
  orderBar: React.ReactNode;
  /** The bottom safe-area inset; the Order Bar keeps clear of the navigation bar. */
  bottomInset: number;
};

/**
 * The full range of a large variant set, in one scrolling grid of the same
 * option tiles the Choice Canvas previews. Product Detail renders it in place
 * of the Stage and Canvas — never as a route or a sheet — so the selection and
 * quantity it reports stay screen state and survive closing it.
 *
 * Available choices come first, then unavailable ones, each in store order.
 * Long sets (more than ten) get a search with a live count. The Order Bar is
 * always on screen: at the foot of the context column in landscape, pinned to
 * the bottom when stacked — and, stacked, set aside only while the keyboard is
 * up so the grid keeps its room.
 *
 * Presentational only: data and callbacks arrive as props; the search text and
 * whether the keyboard is up are the only state it keeps.
 */
export function OptionBrowser({
  decision,
  selectedId,
  onSelect,
  onClose,
  lowStockThreshold,
  split,
  title,
  media,
  availableCount,
  total,
  orderBar,
  bottomInset,
}: OptionBrowserProps) {
  const [query, setQuery] = useState("");
  // The pinned Order Bar steps aside only while the keyboard is up. Focus is not
  // enough: Android can hide the keyboard without blurring the field.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    if (split) return;
    const shown = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [split]);

  const ordered = useMemo(() => browseOrder(decision.choices), [decision.choices]);
  const searching = decision.searchable && query.trim().length > 0;
  const matches = useMemo(
    () => (searching ? filterChoices(ordered, query) : ordered),
    [ordered, query, searching],
  );

  const compact = decision.mode === "variations";
  const handleItemPress = useCallback((choice: OptionChoice) => onSelect(choice.id), [onSelect]);
  // The tile reports its id, which is exactly what the screen's handler takes;
  // the grid's row handler (`onPress`) routes to that same handler.
  const renderItem = useCallback(
    ({ item }: CatalogGridRowInfo<OptionChoice>) => (
      <OptionRackItem
        choice={item}
        selected={item.id === selectedId}
        onSelect={onSelect}
        compact={compact}
        lowStockThreshold={lowStockThreshold}
      />
    ),
    [selectedId, onSelect, compact, lowStockThreshold],
  );

  const availability = `${availableCount} of ${total} available`;
  const backControl = (
    <Pressable
      testID="catalog-option-browser-close"
      accessibilityRole="button"
      accessibilityLabel="Back to product"
      onPress={onClose}
      className="min-h-touch flex-row items-center gap-2 self-start active:opacity-70"
    >
      <Icon as={ArrowLeft} size={16} className="text-primary" />
      <Text className="font-sans-bold text-meta text-primary">Back to product</Text>
    </Pressable>
  );

  const browse = (
    <View className="min-h-0 flex-1 gap-2.5">
      <Text
        accessibilityRole="header"
        className="font-sans-extrabold text-eyebrow uppercase tracking-[1.2px] text-primary"
      >
        {`All ${total} ${decision.nounPlural}`}
      </Text>
      {decision.searchable ? (
        <View className="gap-1.5">
          <SearchInput
            appearance="field"
            value={query}
            onChangeText={setQuery}
            placeholder={`Find a ${decision.noun}…`}
            accessibilityLabel={`Search ${decision.nounPlural}`}
            trailing={matches.length}
          />
          <Text accessibilityLiveRegion="polite" className="text-caption text-muted-foreground">
            {`Showing ${matches.length} of ${total}`}
          </Text>
        </View>
      ) : null}
      <View testID="catalog-option-browser-grid" className="min-h-0 flex-1">
        <CatalogGrid
          data={matches}
          renderItem={renderItem}
          keyExtractor={keyOf}
          onItemPress={handleItemPress}
          extraData={selectedId}
          minItemWidth={TILE_MIN_WIDTH}
          maxColumns={3}
          gap={TILE_GAP}
          bottomInset={16}
          accessibilityRole="radiogroup"
          accessibilityLabel={`${decision.overline} options`}
          listEmptyComponent={
            <View accessibilityLiveRegion="polite" className="items-center gap-3 py-10">
              <Text className="text-meta text-muted-foreground">
                {`No matching ${decision.nounPlural}.`}
              </Text>
              <Button
                variant="outline"
                onPress={() => setQuery("")}
                testID="catalog-option-browser-clear"
              >
                <Text>Clear search</Text>
              </Button>
            </View>
          }
        />
      </View>
    </View>
  );

  if (split) {
    return (
      <View testID="catalog-option-browser" className="flex-1 flex-row gap-[34px] pt-2.5">
        <View
          className="gap-4"
          // Clear the Android navigation bar under edge-to-edge, as the Canvas does.
          style={{ width: CONTEXT_COLUMN_WIDTH, paddingBottom: Math.max(16, bottomInset + 8) }}
        >
          {backControl}
          <MediaFrame
            source={media}
            alt={title}
            fit="contain"
            preset="detail"
            tint="paper"
            fallbackLabel={title}
            // The picture takes only the height left over, so the title and the
            // Order Bar below it are never pushed off a landscape screen.
            className="min-h-0 w-full flex-1 rounded-2xl border border-border"
            style={{ maxHeight: CONTEXT_COLUMN_WIDTH }}
          />
          <View className="gap-1">
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              className="font-display-semibold text-display-sm text-foreground"
            >
              {title}
            </Text>
            <Text accessibilityLiveRegion="polite" className="text-caption text-muted-foreground">
              {availability}
            </Text>
          </View>
          <View className="overflow-hidden rounded-2xl">{orderBar}</View>
        </View>
        {browse}
      </View>
    );
  }

  return (
    <View testID="catalog-option-browser" className="flex-1 gap-3 pt-2.5">
      <View className="gap-1">
        {backControl}
        <View className="flex-row items-center gap-3">
          <MediaFrame
            source={media}
            alt={title}
            fit="contain"
            preset="row"
            inset={4}
            tint="paper"
            fallbackLabel={title}
            className="h-16 w-16 rounded-md border border-border"
          />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              className="font-display-semibold text-title-lg text-foreground"
            >
              {title}
            </Text>
            <Text accessibilityLiveRegion="polite" className="text-caption text-muted-foreground">
              {availability}
            </Text>
          </View>
        </View>
      </View>
      {browse}
      {/* Pinned to the foot; set aside only while the keyboard is up. */}
      {!keyboardVisible ? (
        <View
          className="overflow-hidden rounded-t-2xl bg-primary"
          style={{ paddingBottom: bottomInset }}
        >
          {orderBar}
        </View>
      ) : null}
    </View>
  );
}

function keyOf(choice: OptionChoice): string {
  return choice.id;
}
