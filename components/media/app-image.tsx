import { Image, type ImageContentFit, type ImageProps } from "expo-image";
import { useState } from "react";
import { View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { ImageOff } from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/core/utils";

/**
 * The one way KISOK renders remote media.
 *
 * The database stores already-authorised Cloudinary delivery URLs
 * (`media_assets.secure_url`, and the snapshot columns on `order_items`). This
 * component DISPLAYS them — it never uploads, signs, or transforms. Cloudinary
 * upload APIs belong to the admin web app, and its API secret must never be in
 * this bundle.
 *
 * Always pass `alt`. Set it to `""` for purely decorative imagery so screen
 * readers skip it rather than announcing a filename.
 */
export type AppImageProps = Omit<ImageProps, "source" | "alt"> & {
  /** `secure_url` from the catalog snapshot or an order item snapshot. */
  uri: string | null | undefined;
  alt: string;
  contentFit?: ImageContentFit;
  className?: string;
  /** Shown when there is no URI or the fetch fails. */
  fallbackIcon?: LucideIcon;
};

export function AppImage({
  uri,
  alt,
  contentFit = "cover",
  className,
  fallbackIcon = ImageOff,
  transition = 200,
  ...props
}: AppImageProps) {
  const [failed, setFailed] = useState(false);
  const showFallback = !uri || failed;

  if (showFallback) {
    return (
      <View
        accessible={alt.length > 0}
        accessibilityRole="image"
        accessibilityLabel={alt || undefined}
        className={cn("items-center justify-center bg-muted", className)}
      >
        <Icon as={fallbackIcon} size={28} className="text-muted-foreground" />
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
      // Catalog imagery is stable and re-viewed constantly on a kiosk, so let
      // expo-image keep it on disk between sessions.
      cachePolicy="memory-disk"
      onError={() => setFailed(true)}
      className={cn("bg-muted", className)}
      {...props}
    />
  );
}
