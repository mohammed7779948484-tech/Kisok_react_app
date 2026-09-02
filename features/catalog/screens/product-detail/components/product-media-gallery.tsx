import { Pressable, ScrollView, View } from "react-native";

import { AppImage } from "@/components/media/app-image";
import { cn } from "@/core/utils";

import type { CatalogMedia } from "../../../model/catalog-view";

/**
 * The media surface of Product Detail (AC-07, Design decisions 9 and 12).
 *
 * Presentational only: it receives the media to show (the model's derived
 * `variant.media`, whose variant→product-cover fallback is ALREADY applied),
 * the active media id, and its callback, and reports interactions upward. It
 * must not fetch, must not read a store, and must not import the Supabase
 * client or a router — the owning screen owns the selection state (Design
 * decision 3: the selected image is screen-local React state).
 *
 * Gallery mechanics — bounded and kiosk-honest: one large image plus, only
 * when there is more than one, a bounded horizontal strip of 64dp thumbnail
 * buttons that switch it. The large image is REMOUNTED by its resolved secure
 * URL (`key`) so AppImage's latched failure state cannot leak across gallery
 * selections (Design decision 12; a 404 on one image must not blank the next).
 * The active media defaults to the first of the set when the given id matches
 * none, so a mid-render variant switch degrades to the primary instead of to
 * nothing. With NO media at all — neither the variant nor the product has any
 * — the same path hands `AppImage` no URI and its shared fallback keeps the
 * image surface and its layout instead of collapsing.
 *
 * Thumbnails are named `${alt} image N`, announced selected through
 * `aria-selected` (the platform-safe spelling prescribed by
 * docs/design-system.md) and mirrored visually by the primary/border tokens —
 * never colour alone. Their inner AppImage is decorative (`alt=""`) because
 * the button itself carries the name.
 */
export type ProductMediaGalleryProps = {
  /** The media of the selected variant, already variant→product-cover derived. */
  media: readonly CatalogMedia[];
  /** Accessible-name base for the image surface (the screen composes it). */
  alt: string;
  /**
   * The media asset id of the image to display, or `null` when none is
   * resolved. The component never changes it by itself — it is controlled by
   * the owning screen.
   */
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
    <View className={cn("gap-2", className)}>
      <AppImage
        key={active?.secureUrl ?? "media-fallback"}
        uri={active?.secureUrl ?? null}
        alt={mainAlt}
        contentFit="cover"
        className="aspect-square w-full rounded-lg"
      />
      {media.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pb-1"
        >
          {media.map((item, index) => {
            const isThumbSelected = item.mediaAssetId === active?.mediaAssetId;

            return (
              <Pressable
                key={item.mediaAssetId}
                accessibilityRole="button"
                accessibilityLabel={`${alt} image ${index + 1}`}
                aria-selected={isThumbSelected}
                onPress={() => onSelectMedia(item.mediaAssetId)}
                className={cn(
                  "rounded-lg border-2",
                  isThumbSelected ? "border-primary" : "border-border",
                )}
              >
                <AppImage
                  uri={item.secureUrl}
                  alt=""
                  contentFit="cover"
                  className="h-16 w-16 rounded-md"
                />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
