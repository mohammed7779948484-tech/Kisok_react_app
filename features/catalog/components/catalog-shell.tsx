import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Search } from "lucide-react-native";

import {
  AppImage,
  cloudinaryImageUrl,
  ContentContainer,
  HeaderActionHost,
  Icon,
  Screen,
  Text,
  useLayout,
} from "@/design-system";
import { cn } from "@/core/utils";

import type { CatalogFullSettings } from "../model/catalog-snapshot.schema";
import type { CatalogView } from "../model/catalog-view";
import { CatalogNavigation, type CatalogDestination } from "./catalog-navigation";

/** Below this window width the navigation tabs move to their own row. */
const SINGLE_ROW_MIN_WIDTH = 1180;

function isFullSettings(settings: CatalogView["settings"]): settings is CatalogFullSettings {
  return "store_name" in settings;
}

export type CatalogShellProps = {
  /** The active tab. `null` on pages that are not a tab (a product, a detail page). */
  currentDestination: CatalogDestination | null;
  settings?: CatalogView["settings"];
  children: React.ReactNode;
  contentClassName?: string;
};

/**
 * The catalog chrome: the store's identity, a search field that is always
 * one tap away, the browse tabs, and the header action slot the cart fills.
 * The page below is the screen's own.
 */
export function CatalogShell({
  currentDestination,
  settings,
  children,
  contentClassName,
}: CatalogShellProps) {
  const router = useRouter();
  const { width, isCompact } = useLayout();
  const singleRow = width >= SINGLE_ROW_MIN_WIDTH;

  const handleNavigate = useCallback(
    (destination: CatalogDestination) => {
      switch (destination) {
        case "home":
          router.replace("/");
          break;
        case "products":
          router.replace("/products");
          break;
        case "brands":
          router.replace("/brands");
          break;
        case "categories":
          router.replace("/categories");
          break;
        case "search":
          router.replace("/search");
          break;
      }
    },
    [router],
  );

  const storeName = settings && isFullSettings(settings) ? settings.store_name : "KISOK";
  const logoUrl = settings && isFullSettings(settings) ? settings.logo_secure_url : null;

  const lockup = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${storeName}, explore the store`}
      onPress={() => handleNavigate("home")}
      className="min-h-touch shrink-0 flex-row items-center gap-3 active:opacity-80"
    >
      <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-[13px] bg-primary">
        {logoUrl ? (
          <AppImage
            uri={cloudinaryImageUrl(logoUrl, "packshot")}
            alt=""
            contentFit="contain"
            className="h-full w-full"
          />
        ) : (
          <View className="h-4 w-4 rotate-45 rounded-[4px] border-2 border-primary-foreground" />
        )}
      </View>
      <View className="gap-1">
        <Text
          numberOfLines={1}
          className="font-sans-extrabold text-title uppercase leading-[20px] tracking-[2px]"
          style={{ maxWidth: 220 }}
        >
          {storeName}
        </Text>
        <Text variant="caption" tone="muted" className="leading-[14px]">
          In-store catalog
        </Text>
      </View>
    </Pressable>
  );

  const searchField = (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel="Search the store"
      accessibilityHint="Opens search"
      onPress={() => handleNavigate("search")}
      className={cn(
        "h-control min-w-0 flex-1 flex-row items-center gap-3 rounded-full border border-border bg-card px-4 active:bg-card/70",
        currentDestination === "search" && "border-primary/30",
      )}
    >
      <Icon as={Search} size={19} className="text-primary" />
      <Text numberOfLines={1} className="flex-1 text-body-lg text-muted-foreground">
        Search products, brands, categories, or options…
      </Text>
    </Pressable>
  );

  return (
    <Screen constrained={false}>
      <View className="flex-1">
        <View className="border-b border-foreground/[0.08] bg-background">
          <ContentContainer>
            {singleRow ? (
              <View className="min-h-[84px] flex-row items-center gap-6">
                {lockup}
                {searchField}
                <CatalogNavigation current={currentDestination} onNavigate={handleNavigate} />
                <View className="justify-center">
                  <HeaderActionHost />
                </View>
              </View>
            ) : (
              <View className="gap-2 py-3">
                <View className="flex-row items-center gap-4">
                  {lockup}
                  {isCompact ? <View className="flex-1" /> : searchField}
                  <View className="justify-center">
                    <HeaderActionHost />
                  </View>
                </View>
                {isCompact ? searchField : null}
                <CatalogNavigation
                  current={currentDestination}
                  onNavigate={handleNavigate}
                  scrollable={isCompact}
                  className="-ml-3.5"
                />
              </View>
            )}
          </ContentContainer>
        </View>

        <View className={cn("min-h-0 flex-1", contentClassName)}>{children}</View>
      </View>
    </Screen>
  );
}
