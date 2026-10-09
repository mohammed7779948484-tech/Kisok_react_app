import { Pressable, View } from "react-native";
import { ArrowRight, Compass, Search } from "lucide-react-native";

import { Button, Eyebrow, Icon, Text } from "@/design-system";
import { cn } from "@/core/utils";

import type { CatalogCategoryView } from "../../../model/catalog-view";
import { productCountLabel } from "../../../model/labels";

/** At most this many category quick starts; the panel never grows with the catalog. */
const QUICK_START_LIMIT = 4;

/**
 * Guided discovery: the way into Help Me Choose for a customer who does not
 * know what a thing is called — a few quick questions, or a quick start inside
 * one of the store's stocked root categories. Search stays one tap away for a
 * customer who does know.
 */
export function OptionFinder({
  categories,
  split,
  onSearch,
  onHelpMeChoose,
  onHelpMeChooseIn,
}: {
  /** Root categories that have products. */
  categories: CatalogCategoryView[];
  split: boolean;
  onSearch: () => void;
  onHelpMeChoose: () => void;
  onHelpMeChooseIn: (category: CatalogCategoryView) => void;
}) {
  const quickStarts = categories.slice(0, QUICK_START_LIMIT);

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
            Help me choose
          </Text>
          <Text className="text-body text-primary-foreground/75">
            Not sure what it&apos;s called? Answer a few quick questions and we&apos;ll narrow the
            store to what&apos;s in stock.
          </Text>
        </View>
        <Button
          testID="home-help-me-choose"
          variant="inverse"
          size="large"
          accessibilityHint="Answer a few quick questions to narrow the products"
          onPress={onHelpMeChoose}
        >
          <Icon as={Compass} size={20} className="text-primary" />
          <Text>Help me choose</Text>
        </Button>
      </View>

      <View className="min-w-0 flex-1 gap-3">
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search the store"
          onPress={onSearch}
          className="min-h-control-lg flex-row items-center gap-3 rounded-lg border border-primary-foreground/15 bg-primary-foreground/[0.07] px-5 py-2 active:bg-primary-foreground/10"
        >
          <Icon as={Search} size={18} className="text-primary-foreground/80" />
          <Text className="shrink text-body-lg text-primary-foreground/70">
            Search products, brands, categories, or options…
          </Text>
        </Pressable>
        {quickStarts.length > 0 ? (
          <View className="gap-3 pt-3">
            <Text className="font-sans-bold text-meta text-primary-foreground/75">
              Or start in a category
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {quickStarts.map((category) => (
                <QuickStartTile
                  key={category.id}
                  category={category}
                  onPress={() => onHelpMeChooseIn(category)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function QuickStartTile({
  category,
  onPress,
}: {
  category: CatalogCategoryView;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Help me choose in ${category.name}`}
      onPress={onPress}
      className="min-h-[96px] min-w-[160px] grow basis-[40%] justify-between gap-3 rounded-lg border border-primary-foreground/15 bg-primary-foreground/[0.06] p-4 active:bg-primary-foreground/10"
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text className="shrink font-sans-bold text-body-lg text-primary-foreground">
          {category.name}
        </Text>
        <Icon as={ArrowRight} size={18} className="text-primary-foreground/80" />
      </View>
      <Text className="text-caption text-primary-foreground/70">
        {productCountLabel(category.productCount)}
      </Text>
    </Pressable>
  );
}
