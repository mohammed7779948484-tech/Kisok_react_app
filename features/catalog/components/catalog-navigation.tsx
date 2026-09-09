import { View } from "react-native";
import { House, LayoutGrid, Package, Search, Tags, type LucideIcon } from "lucide-react-native";

import { Button, Icon, Text } from "@/components/ui";
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

const DESTINATION_ICONS: Record<CatalogDestination, LucideIcon> = {
  home: House,
  products: Package,
  brands: Tags,
  categories: LayoutGrid,
  search: Search,
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
    <View
      className={cn(
        "flex-row flex-wrap gap-1 rounded-xl border border-border bg-card p-2",
        className,
      )}
    >
      {CATALOG_DESTINATIONS.map((destination) => {
        const isSelected = destination === current;
        const DestinationIcon = DESTINATION_ICONS[destination];

        return (
          <Button
            key={destination}
            variant={isSelected ? "primary" : "ghost"}
            onPress={() => onNavigate(destination)}
            accessibilityLabel={DESTINATION_LABELS[destination]}
            aria-selected={isSelected}
            className={cn(
              "min-h-20 min-w-20 flex-1 flex-col gap-1 rounded-lg border-b-4 px-1 py-2",
              isSelected ? "border-accent" : "border-transparent",
            )}
          >
            <Icon
              as={DestinationIcon}
              size={24}
              className={isSelected ? "text-primary-foreground" : "text-muted-foreground"}
            />
            <Text variant="label" className="text-center">
              {DESTINATION_LABELS[destination]}
            </Text>
          </Button>
        );
      })}
    </View>
  );
}
