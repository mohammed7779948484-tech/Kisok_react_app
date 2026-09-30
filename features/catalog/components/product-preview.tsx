import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";
import { ArrowRight } from "lucide-react-native";

import { ArrowDisc, Icon, MediaFrame, Text, tintFor } from "@/design-system";
import { cn } from "@/core/utils";

import type { CatalogProductView } from "../model/catalog-view";
import { AvailabilityBadge } from "./availability-badge";

/**
 * A product in an editorial preview. `lead` is the large split card that
 * anchors a preview section; `tile` is the smaller companion.
 */
export const ProductPreview = memo(function ProductPreview({
  product,
  onPress,
  variant = "tile",
  mediaHeight,
  className,
}: {
  product: CatalogProductView;
  onPress: (product: CatalogProductView) => void;
  variant?: "lead" | "tile";
  /** A fixed media height; without it the media fills what the tile leaves. */
  mediaHeight?: number;
  className?: string;
}) {
  const handlePress = useCallback(() => onPress(product), [onPress, product]);
  const label = `${product.name}${product.brand ? `, by ${product.brand.name}` : ""}`;

  const identity = (
    <View className="min-w-0 flex-1 gap-1.5">
      {product.brand ? (
        <Text
          numberOfLines={1}
          className="font-sans-extrabold text-eyebrow uppercase tracking-[1.4px] text-muted-foreground"
        >
          {product.brand.name}
        </Text>
      ) : null}
      <Text numberOfLines={2} className="font-sans-bold text-title">
        {product.name}
      </Text>
      <AvailabilityBadge
        type="product"
        isAvailable={product.isAvailable}
        variantCount={product.variants.length}
        aria-hidden
      />
    </View>
  );

  if (variant === "lead") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={handlePress}
        className={cn(
          "flex-row overflow-hidden rounded-xl border border-border bg-card active:opacity-90",
          className,
        )}
      >
        <View className="w-[36%] justify-end gap-4 p-6">
          {identity}
          <View className="h-touch flex-row items-center gap-2 self-start rounded-full bg-primary px-5">
            <Text className="font-sans-bold text-meta text-primary-foreground">
              Explore product
            </Text>
            <Icon as={ArrowRight} size={15} className="text-primary-foreground" />
          </View>
        </View>
        <MediaFrame
          source={product.coverMedia}
          alt=""
          fit="contain"
          backdrop
          tint={tintFor(product.id)}
          fallbackLabel={product.name}
          className="flex-1"
        />
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={handlePress}
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card active:opacity-90",
        className,
      )}
    >
      <MediaFrame
        source={product.coverMedia}
        alt=""
        fit="contain"
        backdrop
        tint={tintFor(product.id, ["stone", "sand", "sage"])}
        fallbackLabel={product.name}
        className={mediaHeight === undefined ? "min-h-[90px] w-full flex-1" : "w-full"}
        style={mediaHeight === undefined ? undefined : { height: mediaHeight }}
      />
      <View className="flex-row items-end justify-between gap-3 px-4 pb-3.5 pt-3">
        {identity}
        <ArrowDisc size={34} />
      </View>
    </Pressable>
  );
});
