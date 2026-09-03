import { View } from "react-native";

import { Button, Text } from "@/components/ui";
import { cn } from "@/core/utils";

/**
 * Root navigation for the Catalog discovery surfaces (AC-02, AC-08).
 *
 * Five destinations — Home, Products, Brands, Categories and Search — rendered
 * as one feature-owned control. The component itself never imports
 * expo-router: it reports the chosen destination upward, and the owning screen
 * decides push vs replace (root destinations replace so re-selecting one does
 * not stack duplicate history — that routing decision belongs to screens).
 *
 * Every destination is a whole Button with a 48dp touch target, an accessible
 * name, and a selected state on the current destination.
 */
export const CATALOG_DESTINATIONS = ["home", "products", "brands", "categories", "search"] as const;

export type CatalogDestination = (typeof CATALOG_DESTINATIONS)[number];

const DESTINATION_LABELS: Record<CatalogDestination, string> = {
  home: "Home",
  products: "Products",
  brands: "Brands",
  categories: "Categories",
  search: "Search",
};

export type CatalogNavigationProps = {
  /** The root destination the customer is currently on. */
  current: CatalogDestination;
  /**
   * Single navigation callback receiving the chosen destination. The screen
   * owns routing semantics (replace for roots, push for details).
   */
  onNavigate: (destination: CatalogDestination) => void;
  className?: string;
};

export function CatalogNavigation({ current, onNavigate, className }: CatalogNavigationProps) {
  return (
    <View className={cn("flex-row flex-wrap gap-2", className)}>
      {CATALOG_DESTINATIONS.map((destination) => {
        const isSelected = destination === current;

        return (
          <Button
            key={destination}
            variant={isSelected ? "primary" : "ghost"}
            onPress={() => onNavigate(destination)}
            accessibilityLabel={DESTINATION_LABELS[destination]}
            aria-selected={isSelected}
          >
            <Text>{DESTINATION_LABELS[destination]}</Text>
          </Button>
        );
      })}
    </View>
  );
}
