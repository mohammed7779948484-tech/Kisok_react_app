import { View } from "react-native";

import {
  Breadcrumb,
  type CloudinarySource,
  Eyebrow,
  MediaFrame,
  Text,
  type BreadcrumbItem,
  type MediaTint,
} from "@/design-system";
import { cn } from "@/core/utils";

/**
 * The opening of a category or brand page: identity on the left, imagery on
 * the right; stacked when the page is narrow.
 */
export function CatalogHero({
  breadcrumb,
  eyebrow,
  title,
  description,
  children,
  media,
  mediaFit = "cover",
  mediaTint,
  mediaCaption,
  wide,
}: {
  breadcrumb: BreadcrumbItem[];
  eyebrow: string;
  title: string;
  description?: string;
  /** Actions or facts below the description. */
  children?: React.ReactNode;
  media: CloudinarySource;
  mediaFit?: "contain" | "cover";
  mediaTint: MediaTint;
  /** A serif name set on the media panel when there is no image. */
  mediaCaption?: string;
  wide: boolean;
}) {
  const onDark = mediaTint === "evergreen";
  return (
    <View
      className={cn(
        "border-b border-border pb-10 pt-8",
        wide ? "flex-row items-center gap-12" : "gap-8",
      )}
    >
      <View className={cn("min-w-0 gap-5", wide && "flex-1")}>
        <Breadcrumb items={breadcrumb} />
        <View className="gap-3">
          <Eyebrow>{eyebrow}</Eyebrow>
          <Text variant="display" accessibilityRole="header">
            {title}
          </Text>
          {description ? <Text variant="lead">{description}</Text> : null}
        </View>
        {children}
      </View>
      <MediaFrame
        source={media}
        backdrop={mediaFit === "contain"}
        alt=""
        fit={mediaFit}
        tint={mediaTint}
        className={cn("rounded-3xl", wide ? "h-[360px] flex-1" : "h-[240px] w-full")}
      >
        {!media && mediaCaption ? (
          <View className="absolute inset-x-9 bottom-8">
            <Text
              numberOfLines={2}
              className={cn(
                "font-display text-display-lg",
                onDark ? "text-primary-foreground" : "text-foreground",
              )}
            >
              {mediaCaption}
            </Text>
          </View>
        ) : null}
      </MediaFrame>
    </View>
  );
}

/** A serif number with its caption, for hero fact rows. */
export function HeroFact({ value, label }: { value: number; label: string }) {
  return (
    <View accessible accessibilityLabel={`${value} ${label}`} className="gap-1">
      <Text className="font-display text-display-sm">{String(value)}</Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}
