import { useCallback } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/components/layout/screen";
import { AppImage } from "@/components/media/app-image";
import { Text } from "@/components/ui";
import { useLayout } from "@/core/responsive";
import { cn } from "@/core/utils";

import type { CatalogFullSettings } from "../model/catalog-snapshot.schema";
import type { CatalogView } from "../model/catalog-view";
import { CatalogNavigation, type CatalogDestination } from "./catalog-navigation";

function isFullSettings(settings: CatalogView["settings"]): settings is CatalogFullSettings {
  return "store_name" in settings;
}

export type CatalogShellProps = {
  currentDestination: CatalogDestination;
  settings?: CatalogView["settings"];
  title?: string;
  subtitle?: string;
  countLabel?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
  scrollable?: boolean;
};

export function CatalogShell({
  currentDestination,
  settings,
  title,
  subtitle,
  countLabel,
  headerRight,
  children,
  contentClassName,
}: CatalogShellProps) {
  const router = useRouter();
  const { isExpanded } = useLayout();

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

  return (
    <Screen>
      <View className="flex-1">
        {/* Unified Store Top Chrome */}
        <View className="border-b border-border/80 bg-card px-5 py-3 md:px-8">
          <View
            className={cn(
              "items-center justify-between gap-4",
              isExpanded ? "flex-row" : "flex-col items-stretch",
            )}
          >
            {/* Store Brand Mark / Name */}
            <View className="flex-row items-center gap-3">
              {logoUrl ? (
                <AppImage
                  uri={logoUrl}
                  alt={storeName}
                  contentFit="contain"
                  className="h-9 w-9 rounded-lg"
                />
              ) : (
                <View className="h-9 w-9 items-center justify-center rounded-lg bg-primary">
                  <Text variant="caption" className="font-bold text-primary-foreground">
                    {storeName.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <View>
                <Text variant="body" className="font-bold tracking-tight">
                  {storeName}
                </Text>
                <Text variant="caption" tone="muted">
                  In-store catalog
                </Text>
              </View>
            </View>

            {/* Navigation Bar */}
            <CatalogNavigation current={currentDestination} onNavigate={handleNavigate} />
          </View>
        </View>

        {/* Optional Page Header */}
        {title ? (
          <View className="gap-1 border-b border-border/40 px-5 py-4 md:px-8">
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <View className="gap-0.5">
                <Text variant="h1" accessibilityRole="header" className="font-bold">
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="caption" tone="muted">
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              {countLabel ? (
                <Text variant="caption" tone="muted" className="font-medium">
                  {countLabel}
                </Text>
              ) : headerRight ? (
                headerRight
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Screen Content */}
        <View className={cn("flex-1", contentClassName)}>{children}</View>
      </View>
    </Screen>
  );
}
