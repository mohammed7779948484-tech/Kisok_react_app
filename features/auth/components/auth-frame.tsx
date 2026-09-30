import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { Eyebrow, OfflineNotice, Screen, Text, useLayout } from "@/design-system";
import { cn } from "@/core/utils";

/** The KISOK mark: a rotated square on the evergreen tile, as in the catalog header. */
export function KisokMark({ size = 48, inverse = false }: { size?: number; inverse?: boolean }) {
  return (
    <View
      aria-hidden
      className={cn(
        "items-center justify-center",
        inverse ? "bg-primary-foreground/10" : "bg-primary",
      )}
      style={{ width: size, height: size, borderRadius: size * 0.32 }}
    >
      <View
        className="rotate-45 border-2 border-primary-foreground"
        style={{ width: size * 0.38, height: size * 0.38, borderRadius: size * 0.09 }}
      />
    </View>
  );
}

/** Two quiet concentric rings — the same motif as the Product Stage. */
function Orbits() {
  return (
    <View aria-hidden className="absolute -bottom-40 -right-40">
      <View className="h-[520px] w-[520px] items-center justify-center rounded-full border border-primary-foreground/10">
        <View className="h-[360px] w-[360px] rounded-full border border-primary-foreground/10" />
      </View>
    </View>
  );
}

export type AuthFrameProps = {
  eyebrow: string;
  headline: string;
  lead: string;
  children: ReactNode;
};

/**
 * The frame every signed-out and not-yet-ready surface shares: an evergreen
 * brand panel and a calm content column (stacked on narrow and portrait
 * screens). Feature-local — it carries the auth surfaces' identity only.
 */
export function AuthFrame({ eyebrow, headline, lead, children }: AuthFrameProps) {
  const { width, isLandscape } = useLayout();
  const split = isLandscape && width >= 900;

  const brand = (
    <View
      className={cn(
        "justify-between overflow-hidden bg-primary",
        split ? "w-[44%] p-12" : "gap-10 px-6 pb-10 pt-8 md:px-10",
      )}
    >
      <Orbits />
      <View className="flex-row items-center gap-3">
        <KisokMark size={44} inverse />
        <View className="gap-0.5">
          <Text className="font-sans-extrabold text-title uppercase tracking-[2px] text-primary-foreground">
            KISOK
          </Text>
          <Text variant="caption" className="text-primary-foreground/70">
            In-store catalog
          </Text>
        </View>
      </View>
      <View className="max-w-md gap-4">
        <Eyebrow rule inverse>
          {eyebrow}
        </Eyebrow>
        <Text
          accessibilityRole="header"
          className={cn(
            "font-display text-primary-foreground",
            split ? "text-display-lg" : "text-display-md",
          )}
        >
          {headline}
        </Text>
        <Text className="text-body-lg text-primary-foreground/75">{lead}</Text>
      </View>
      {split ? (
        <Text variant="caption" className="text-primary-foreground/60">
          Private access for this store tablet
        </Text>
      ) : null}
    </View>
  );

  return (
    <Screen edges={["top", "bottom", "left", "right"]} constrained={false}>
      <OfflineNotice />
      <ScrollView contentContainerClassName="flex-grow" keyboardShouldPersistTaps="handled">
        <View className={split ? "flex-1 flex-row" : "flex-1"}>
          {brand}
          <View
            className={cn(
              "flex-1 items-center justify-center bg-background",
              split ? "p-12" : "px-6 py-10 md:px-10",
            )}
          >
            <View className="w-full max-w-md">{children}</View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
