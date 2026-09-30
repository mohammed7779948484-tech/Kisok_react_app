import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { cn } from "@/core/utils";

import { AppImage } from "./app-image";
import { cloudinaryImageUrl, type CloudinaryPreset, type CloudinarySource } from "./cloudinary-url";

/**
 * Surface tints for media. They show only while an image loads or when there
 * is none, so an image-less tile still looks deliberate.
 */
export const MEDIA_TINTS = ["sage", "sand", "stone", "evergreen", "paper"] as const;
export type MediaTint = (typeof MEDIA_TINTS)[number];

const TINT_SURFACE: Record<MediaTint, string> = {
  sage: "bg-secondary",
  sand: "bg-accent-soft",
  stone: "bg-muted",
  evergreen: "bg-primary",
  paper: "bg-card",
};

const TINT_TEXT: Record<MediaTint, string> = {
  sage: "text-muted-foreground",
  sand: "text-muted-foreground",
  stone: "text-muted-foreground",
  evergreen: "text-primary-foreground/60",
  paper: "text-muted-foreground",
};

/** A stable tint for an id, so the same item keeps its colour across screens. */
export function tintFor(
  id: string,
  palette: readonly MediaTint[] = ["sage", "stone", "sand"],
): MediaTint {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return palette[Math.abs(hash) % palette.length] ?? "stone";
}

export type MediaFrameProps = {
  /** A snapshot media record (`publicId` + `secureUrl`) or a bare delivery URL. */
  source: CloudinarySource;
  alt: string;
  /** `contain` keeps packaging and logos whole; `cover` fills with imagery. */
  fit?: "contain" | "cover";
  /**
   * Cloudinary size preset. Defaults to `card` for contain and `cover` for
   * cover. Products always stay `contain` with a `limitFit` preset (`card`,
   * `detail`, `row`); `cover` is for category and editorial imagery only.
   */
  preset?: CloudinaryPreset;
  /**
   * Fill the frame behind a contained image with a soft, blurred copy of the
   * same image — the frame is full, and nothing is cropped.
   */
  backdrop?: boolean;
  /** Breathing room around a contained image, in dp — one value or per edge. */
  inset?: number | { top: number; right: number; bottom: number; left: number };
  tint?: MediaTint;
  /** Caption for the fallback surface. */
  fallbackLabel?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
  recyclingKey?: string;
  priority?: "low" | "normal" | "high";
  children?: React.ReactNode;
};

/**
 * One image in a clipped, tinted frame, requested at the size it is shown.
 * Overlay children (a badge, a scrim, a caption) render above the image.
 */
export function MediaFrame({
  source,
  alt,
  fit = "contain",
  preset,
  backdrop = false,
  inset = 12,
  tint = "stone",
  fallbackLabel,
  className,
  style,
  recyclingKey,
  priority,
  children,
}: MediaFrameProps) {
  const uri = cloudinaryImageUrl(source, preset ?? (fit === "contain" ? "card" : "cover"));
  const backdropUri = backdrop && fit === "contain" ? cloudinaryImageUrl(source, "backdrop") : null;
  const padded = fit === "contain" && uri;
  const box =
    typeof inset === "number" ? { top: inset, right: inset, bottom: inset, left: inset } : inset;

  return (
    <View className={cn("overflow-hidden", TINT_SURFACE[tint], className)} style={style}>
      {backdropUri ? (
        <>
          <AppImage
            uri={backdropUri}
            alt=""
            contentFit="cover"
            transition={0}
            hideFallback
            recyclingKey={recyclingKey ? `${recyclingKey}:backdrop` : undefined}
            className="absolute inset-0 h-full w-full"
            style={StyleSheet.absoluteFillObject}
          />
          {/* A light veil keeps the blurred colour quiet behind the product. */}
          <View aria-hidden className="absolute inset-0 bg-card/35" />
        </>
      ) : null}
      {/* An inset wrapper, not image padding: expo-image does not reliably
          inset its content by padding on every platform. */}
      <View style={{ position: "absolute", ...(padded ? box : FILL) }}>
        <AppImage
          uri={uri}
          alt={alt}
          contentFit={fit}
          recyclingKey={recyclingKey}
          priority={priority}
          fallbackLabel={fallbackLabel}
          fallbackClassName={backdropUri ? "bg-transparent" : TINT_SURFACE[tint]}
          fallbackTextClassName={TINT_TEXT[tint]}
          className="h-full w-full"
        />
      </View>
      {children}
    </View>
  );
}

const FILL = { top: 0, right: 0, bottom: 0, left: 0 } as const;

/**
 * A frosted strip for a caption laid over media: translucent paper with a
 * bright hairline, blurred behind on platforms that can (web), and legible on
 * every platform because the veil alone carries the contrast.
 */
export function GlassCaption({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={cn(
        "absolute inset-x-2.5 bottom-2.5 rounded-lg border border-card/70 bg-card/80 px-4 py-3 web:backdrop-blur-md",
        className,
      )}
    >
      {children}
    </View>
  );
}
