import { View } from "react-native";

import { Button, Text } from "@/components/ui";
import { cn } from "@/core/utils";

export type CatalogDestination = "home" | "products" | "brands" | "categories" | "search";

export type CatalogNavigationProps = {
  currentDestination: CatalogDestination;
  onSelect: (destination: CatalogDestination) => void;
  className?: string;
};

const DESTINATIONS: readonly { destination: CatalogDestination; label: string }[] = [
  { destination: "home", label: "Home" },
  { destination: "products", label: "Products" },
  { destination: "brands", label: "Brands" },
  { destination: "categories", label: "Categories" },
  { destination: "search", label: "Search" },
];

export function CatalogNavigation({
  currentDestination,
  onSelect,
  className,
}: CatalogNavigationProps) {
  return (
    <View className={cn("flex-row flex-wrap gap-2", className)}>
      {DESTINATIONS.map(({ destination, label }) => {
        const isSelected = destination === currentDestination;

        return (
          <Button
            key={destination}
            variant={isSelected ? "secondary" : "ghost"}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(destination)}
          >
            <Text>{label}</Text>
          </Button>
        );
      })}
    </View>
  );
}
