import { Pressable, ScrollView, View } from "react-native";

import { AppImage } from "@/components/media/app-image";
import { AspectRatio, Card } from "@/components/ui";
import { cn } from "@/core/utils";

import type { CatalogMedia } from "../../../model/catalog-view";

export type ProductMediaGalleryProps = {
  /** The media of the selected variant, already variant→product-cover derived. */
  media: readonly CatalogMedia[];
  /** Accessible-name base for the image surface. */
  alt: string;
  /** The media asset id of the image to display, or null when none resolved. */
  activeMediaAssetId: string | null;
  /** Reports the pressed thumbnail's media asset id. */
  onSelectMedia: (mediaAssetId: string) => void;
  className?: string;
};

export function ProductMediaGallery({
  media,
  alt,
  activeMediaAssetId,
  onSelectMedia,
  className,
}: ProductMediaGalleryProps) {
  const active = media.find((item) => item.mediaAssetId === activeMediaAssetId) ?? media[0];
  const activeIndex = media.findIndex((item) => item.mediaAssetId === activeMediaAssetId);
  const activePosition = activeIndex >= 0 ? activeIndex + 1 : 1;
  const mainAlt = media.length > 1 ? `${alt}, image ${activePosition} of ${media.length}` : alt;

  return (
    <View className={cn("gap-4", className)}>
      {/* Packaging-friendly portrait presentation */}
      <Card className="overflow-hidden border-border bg-card shadow-none">
        <AspectRatio ratio={3 / 4} className="w-full bg-muted/20 p-6 md:p-8">
          <AppImage
            key={active?.secureUrl ?? "media-fallback"}
            uri={active?.secureUrl ?? null}
            alt={mainAlt}
            contentFit="contain"
            className="h-full w-full"
          />
        </AspectRatio>
      </Card>

      {/* Thumbnails row if more than 1 image */}
      {media.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 pb-1"
        >
          {media.map((item, index) => {
            const isThumbSelected = item.mediaAssetId === active?.mediaAssetId;

            return (
              <Pressable
                key={item.mediaAssetId}
                accessibilityRole="button"
                accessibilityLabel={`${alt} image ${index + 1}`}
                accessibilityState={{ selected: isThumbSelected }}
                aria-selected={isThumbSelected}
                onPress={() => onSelectMedia(item.mediaAssetId)}
                className={cn(
                  "h-16 w-16 overflow-hidden rounded-xl border-2 p-1 transition-all active:scale-[0.96]",
                  isThumbSelected
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border/80 bg-muted/40",
                )}
              >
                <AppImage
                  uri={item.secureUrl}
                  alt=""
                  contentFit="contain"
                  className="h-full w-full"
                />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
