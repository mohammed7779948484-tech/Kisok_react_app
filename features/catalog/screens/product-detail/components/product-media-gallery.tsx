import { Pressable, ScrollView, View } from "react-native";

import { AppImage, cloudinaryImageUrl } from "@/design-system";
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
  /** Height of the visual panel. */
  visualHeight?: number;
  /** Overlay drawn on the panel (the preview caption). */
  caption?: React.ReactNode;
  /** Shown on the neutral fallback when there is no image. */
  fallbackLabel?: string;
  className?: string;
};

/**
 * The Product Stage's picture: packaging `contain`ed on a quiet panel with
 * two faint orbit rings, a caption laid over the lower corner, and a row of
 * thumbnails when there is more than one image.
 */
export function ProductMediaGallery({
  media,
  alt,
  activeMediaAssetId,
  onSelectMedia,
  visualHeight = 398,
  caption,
  fallbackLabel,
  className,
}: ProductMediaGalleryProps) {
  const active = media.find((item) => item.mediaAssetId === activeMediaAssetId) ?? media[0];
  const activeIndex = media.findIndex((item) => item.mediaAssetId === activeMediaAssetId);
  const activePosition = activeIndex >= 0 ? activeIndex + 1 : 1;
  const mainAlt = media.length > 1 ? `${alt}, image ${activePosition} of ${media.length}` : alt;
  const orbit = Math.min(visualHeight + 22, 420);

  return (
    <View className={cn("gap-2", className)}>
      <View
        className="items-center justify-center overflow-hidden border-y border-foreground/10 bg-muted/60"
        style={{ height: visualHeight }}
      >
        <View
          aria-hidden
          className="absolute rounded-full border border-primary/[0.13]"
          style={{ width: orbit, height: orbit }}
        />
        <View
          aria-hidden
          className="absolute rounded-full border border-primary/[0.075]"
          style={{ width: orbit - 92, height: orbit - 92 }}
        />
        <View className="absolute bottom-4 left-4 right-4 top-3">
          <AppImage
            key={active?.secureUrl ?? "media-fallback"}
            uri={cloudinaryImageUrl(active, "detail")}
            alt={mainAlt}
            contentFit="contain"
            fallbackLabel={fallbackLabel}
            fallbackClassName="bg-transparent"
            className="h-full w-full"
          />
        </View>
        {caption ? (
          <View className="absolute bottom-3 left-[18px] max-w-[300px]">{caption}</View>
        ) : null}
      </View>

      {media.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2.5 py-0.5"
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
                  "h-gallery-thumb w-gallery-thumb overflow-hidden rounded-sm border bg-card/60 p-1",
                  isThumbSelected ? "border-primary" : "border-foreground/10 active:opacity-80",
                )}
              >
                <AppImage
                  uri={cloudinaryImageUrl(item, "row")}
                  alt=""
                  contentFit="contain"
                  className="h-full w-full rounded-[7px]"
                />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
