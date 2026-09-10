import { Pressable, View } from "react-native";
import { House, LayoutGrid, Package, Search, Tags, type LucideIcon } from "lucide-react-native";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/core/utils";

export const CATALOG_DESTINATIONS = ["home", "products", "categories", "brands", "search"] as const;

export type CatalogDestination = (typeof CATALOG_DESTINATIONS)[number];

const DESTINATION_LABELS: Record<CatalogDestination, string> = {
  home: "Home",
  products: "Products",
  categories: "Categories",
  brands: "Brands",
  search: "Search",
};

const DESTINATION_ICONS: Record<CatalogDestination, LucideIcon> = {
  home: House,
  products: Package,
  categories: LayoutGrid,
  brands: Tags,
  search: Search,
};

export type CatalogNavigationProps = {
  current: CatalogDestination;
  onNavigate: (destination: CatalogDestination) => void;
  className?: string;
};

export function CatalogNavigation({ current, onNavigate, className }: CatalogNavigationProps) {
  const mainDestinations: CatalogDestination[] = ["home", "products", "categories", "brands"];

  return (
    <View className={cn("flex-row items-center justify-between gap-2.5", className)}>
      {/* Primary taxonomy navigation buttons */}
      <View className="flex-row items-center gap-1 rounded-xl border border-border/70 bg-muted/50 p-1">
        {mainDestinations.map((destination) => {
          const isSelected = destination === current;
          const DestinationIcon = DESTINATION_ICONS[destination];

          return (
            <Pressable
              key={destination}
              accessibilityRole="button"
              accessibilityLabel={DESTINATION_LABELS[destination]}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onNavigate(destination)}
              className={cn(
                "h-touch min-h-touch flex-row items-center gap-2 rounded-lg px-3 transition-all active:scale-[0.98] md:px-4",
                isSelected ? "bg-primary shadow-sm" : "bg-transparent active:bg-muted",
              )}
            >
              <Icon
                as={DestinationIcon}
                size={18}
                className={isSelected ? "text-primary-foreground" : "text-muted-foreground"}
              />
              <Text
                variant="body"
                className={cn(
                  "text-sm font-semibold md:text-base",
                  isSelected ? "text-primary-foreground" : "text-foreground",
                )}
              >
                {DESTINATION_LABELS[destination]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Elevated Search discovery action */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={DESTINATION_LABELS.search}
        accessibilityState={{ selected: current === "search" }}
        onPress={() => onNavigate("search")}
        className={cn(
          "h-touch min-h-touch flex-row items-center gap-2 rounded-xl border px-3.5 active:scale-[0.98] md:px-4",
          current === "search"
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border/80 bg-card active:bg-muted/60",
        )}
      >
        <Icon
          as={Search}
          size={18}
          className={current === "search" ? "text-primary-foreground" : "text-foreground"}
        />
        <Text
          variant="body"
          className={cn(
            "text-sm font-semibold md:text-base",
            current === "search" ? "text-primary-foreground" : "text-foreground",
          )}
        >
          Search
        </Text>
      </Pressable>
    </View>
  );
}
