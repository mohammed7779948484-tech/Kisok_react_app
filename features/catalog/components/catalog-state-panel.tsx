import { View } from "react-native";
import { PackageOpen } from "lucide-react-native";

import {
  ContentContainer,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonGrid,
  type StateAction,
} from "@/design-system";

import { CatalogShell } from "./catalog-shell";
import type { CatalogDestination } from "./catalog-navigation";

/**
 * The catalog's own framing of the shared feedback states: inside the
 * catalog chrome, so the customer can always navigate away, and in the shape
 * of the page that is loading.
 */
export function CatalogLoadingState({
  destination,
  label = "Loading the catalog…",
}: {
  destination: CatalogDestination | null;
  label?: string;
}) {
  return (
    <CatalogShell currentDestination={destination}>
      <ContentContainer className="flex-1 gap-8 pt-10">
        <View accessibilityRole="progressbar" accessibilityLabel={label} className="gap-4">
          <Skeleton className="h-4 w-40 rounded-full" />
          <Skeleton className="h-12 w-80 rounded-lg" />
          <Skeleton className="h-4 w-[420px] max-w-full rounded-full" />
        </View>
        <SkeletonGrid count={6} columns={3} />
      </ContentContainer>
    </CatalogShell>
  );
}

export function CatalogErrorState({
  destination,
  error,
  onRetry,
}: {
  destination: CatalogDestination | null;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <CatalogShell currentDestination={destination}>
      <ErrorState error={error} onRetry={onRetry} title="The catalog could not load" />
    </CatalogShell>
  );
}

/** The catalog has no products at all. */
export function CatalogEmptyState({
  destination,
  onRetry,
}: {
  destination: CatalogDestination | null;
  onRetry: () => void;
}) {
  return (
    <CatalogShell currentDestination={destination}>
      <EmptyState
        framed
        icon={PackageOpen}
        title="The catalog is empty"
        description="Nothing is available to browse right now. Please try again in a moment or ask a store employee for help."
        action={{ label: "Try again", onPress: onRetry }}
      />
    </CatalogShell>
  );
}

/** A page whose subject (a product, a brand, a category) is no longer in the catalog. */
export function CatalogMissingState({
  destination,
  settings,
  title,
  description,
  action,
  secondaryAction,
}: {
  destination: CatalogDestination | null;
  settings?: Parameters<typeof CatalogShell>[0]["settings"];
  title: string;
  description: string;
  action: StateAction;
  secondaryAction?: StateAction;
}) {
  return (
    <CatalogShell currentDestination={destination} settings={settings}>
      <EmptyState
        framed
        eyebrow="Unavailable"
        title={title}
        description={description}
        action={action}
        secondaryAction={secondaryAction}
      />
    </CatalogShell>
  );
}
