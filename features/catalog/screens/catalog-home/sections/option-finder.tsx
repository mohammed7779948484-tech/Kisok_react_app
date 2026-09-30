import { Pressable, View } from "react-native";
import { LayoutGrid, Search, SlidersHorizontal, Tag, type LucideIcon } from "lucide-react-native";

import { Eyebrow, Icon, Text } from "@/design-system";
import { cn } from "@/core/utils";

import type { DiscoveryOptionType } from "../../../model/discovery-presentation";

/**
 * Guided discovery: search, or start from how the store is organised. The
 * option types offered are the ones customers actually choose between in this
 * catalog; tapping one searches for products that offer that choice.
 */
export function OptionFinder({
  optionTypes,
  split,
  onSearch,
  onSearchFor,
  onBrands,
  onCategories,
}: {
  optionTypes: DiscoveryOptionType[];
  split: boolean;
  onSearch: () => void;
  onSearchFor: (query: string) => void;
  onBrands: () => void;
  onCategories: () => void;
}) {
  const [leadType, ...moreTypes] = optionTypes;
  const typeNames = optionTypes.slice(0, 3).map((type) => type.name.toLowerCase());
  const description = `Explore by ${[...typeNames, "brand", "or category"].join(", ")}.`;

  return (
    <View
      className={cn(
        "overflow-hidden rounded-3xl bg-primary p-10",
        split ? "flex-row gap-12" : "gap-8",
      )}
    >
      <View className={cn("justify-between gap-6", split && "w-[38%]")}>
        <View className="gap-3">
          <Eyebrow rule inverse>
            Guided discovery
          </Eyebrow>
          <Text
            accessibilityRole="header"
            aria-level={2}
            className="font-display text-display-md text-primary-foreground"
          >
            Find Your Option
          </Text>
        </View>
        <Text className="text-body text-primary-foreground/75">{description}</Text>
      </View>

      <View className="min-w-0 flex-1 gap-3">
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search the store"
          onPress={onSearch}
          className="h-[56px] flex-row items-center gap-3 rounded-lg border border-primary-foreground/15 bg-primary-foreground/[0.07] px-5 active:bg-primary-foreground/10"
        >
          <Icon as={Search} size={18} className="text-primary-foreground/80" />
          <Text className="text-body-lg text-primary-foreground/70">
            Search products, brands, categories, or options…
          </Text>
        </Pressable>
        <View className="flex-row gap-3">
          {leadType ? (
            <FinderTile
              icon={SlidersHorizontal}
              title={leadType.name}
              caption={`Products with ${leadType.name.toLowerCase()} choices`}
              onPress={() => onSearchFor(leadType.name)}
            />
          ) : null}
          <FinderTile
            icon={Tag}
            title="Brand"
            caption="Explore brand families"
            onPress={onBrands}
          />
          <FinderTile
            icon={LayoutGrid}
            title="Category"
            caption="Start from the store map"
            onPress={onCategories}
          />
        </View>
        {moreTypes.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {moreTypes.slice(0, 4).map((type) => (
              <Pressable
                key={type.id}
                accessibilityRole="button"
                accessibilityLabel={`Products with ${type.name} choices`}
                onPress={() => onSearchFor(type.name)}
                className="h-touch justify-center rounded-full border border-primary-foreground/20 px-5 active:bg-primary-foreground/10"
              >
                <Text className="font-sans-bold text-meta text-primary-foreground">
                  {type.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function FinderTile({
  icon,
  title,
  caption,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  caption: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${caption}`}
      onPress={onPress}
      className="min-h-[124px] flex-1 justify-between gap-4 rounded-lg border border-primary-foreground/15 bg-primary-foreground/[0.06] p-4 active:bg-primary-foreground/10"
    >
      <View className="h-9 w-9 items-center justify-center rounded-md bg-primary-foreground/10">
        <Icon as={icon} size={16} className="text-primary-foreground" />
      </View>
      <View className="gap-1">
        <Text className="font-sans-bold text-body-lg text-primary-foreground">{title}</Text>
        <Text numberOfLines={2} className="text-caption text-primary-foreground/70">
          {caption}
        </Text>
      </View>
    </Pressable>
  );
}
