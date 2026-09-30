import { Image, type ImageContentFit, type ImageProps } from "expo-image";
import { useState } from "react";
import { View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { ImageOff } from "lucide-react-native";

import { cn } from "@/core/utils";

import { Icon } from "../primitives/icon";
import { Text } from "../primitives/text";

export type AppImageProps = Omit<ImageProps, "source" | "alt"> & {
  /** `secure_url` from the catalog snapshot or an order item snapshot. */
  uri: string | null | undefined;
  alt: string;
  contentFit?: ImageContentFit;
  className?: string;
  /** Shown when there is no URI or the fetch fails, unless a label is given. */
  fallbackIcon?: LucideIcon;
  /**
   * A short neutral caption for the fallback (usually the item's name). It
   * reads as a label on a tinted surface, never as a broken image.
   */
  fallbackLabel?: string;
  /** Classes for the fallback surface — its tint comes from the frame. */
  fallbackClassName?: string;
  /** Text colour for the fallback label on dark tints. */
  fallbackTextClassName?: string;
  /**
   * For decorative images (blurred backdrops, ambient fills): a missing or
   * failed image renders nothing instead of the fallback surface, so no
   * broken-image mark ever shows behind the real content.
   */
  hideFallback?: boolean;
};

/**
 * Every remote image goes through here: `expo-image` with a memory+disk cache,
 * a recycling key for virtualised rows, and a neutral fallback when a URL is
 * missing or fails.
 */
export function AppImage({
  uri,
  alt,
  contentFit = "cover",
  className,
  fallbackIcon = ImageOff,
  fallbackLabel,
  fallbackClassName,
  fallbackTextClassName,
  hideFallback = false,
  transition = 200,
  recyclingKey,
  ...props
}: AppImageProps) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showFallback = !uri || failedUri === uri;

  if (showFallback && hideFallback) return null;

  if (showFallback) {
    return (
      <View
        accessible={alt.length > 0}
        accessibilityRole="image"
        accessibilityLabel={alt || undefined}
        className={cn("items-center justify-center bg-muted p-4", className, fallbackClassName)}
      >
        {fallbackLabel ? (
          <Text
            numberOfLines={3}
            className={cn(
              "text-center font-sans-bold text-caption uppercase tracking-[1.2px] text-muted-foreground",
              fallbackTextClassName,
            )}
          >
            {fallbackLabel}
          </Text>
        ) : (
          <Icon as={fallbackIcon} size={28} className="text-muted-foreground" />
        )}
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      alt={alt}
      accessibilityLabel={alt || undefined}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey ?? uri ?? undefined}
      onError={() => setFailedUri(uri)}
      className={className}
      {...props}
    />
  );
}
