import { Pressable, ScrollView, View } from "react-native";

import { Text } from "@/design-system";
import { cn } from "@/core/utils";

export const CATALOG_DESTINATIONS = ["home", "products", "categories", "brands", "search"] as const;

export type CatalogDestination = (typeof CATALOG_DESTINATIONS)[number];

/** The four browse destinations shown as tabs. Search lives in the chrome's field. */
const NAV_DESTINATIONS: { destination: CatalogDestination; label: string }[] = [
  { destination: "home", label: "Explore" },
  { destination: "products", label: "Products" },
  { destination: "categories", label: "Categories" },
  { destination: "brands", label: "Brands" },
];

export type CatalogNavigationProps = {
  current: CatalogDestination | null;
  onNavigate: (destination: CatalogDestination) => void;
  /** Let the row scroll sideways when the chrome is too narrow for it. */
  scrollable?: boolean;
  className?: string;
};

export function CatalogNavigation({
  current,
  onNavigate,
  scrollable = false,
  className,
}: CatalogNavigationProps) {
  const tabs = NAV_DESTINATIONS.map(({ destination, label }) => {
    const selected = destination === current;
    return (
      <Pressable
        key={destination}
        testID={`catalog-nav-${destination}`}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={() => onNavigate(destination)}
        className={cn(
          "h-touch min-w-touch items-center justify-center rounded-md px-3.5",
          selected ? "bg-primary/[0.07]" : "active:bg-muted",
        )}
      >
        <Text
          className={cn(
            "font-sans-semibold text-body-lg",
            selected ? "text-primary" : "text-muted-foreground",
          )}
        >
          {label}
        </Text>
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        className={className}
        contentContainerClassName="items-center gap-0.5"
      >
        {tabs}
      </ScrollView>
    );
  }

  return (
    <View accessibilityRole="tablist" className={cn("flex-row items-center gap-0.5", className)}>
      {tabs}
    </View>
  );
}
