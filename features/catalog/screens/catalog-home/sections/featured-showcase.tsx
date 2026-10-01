import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { ArrowRight } from "lucide-react-native";
import { useIsFocused } from "@react-navigation/native";

import {
  AppImage,
  Button,
  cloudinaryImageUrl,
  Eyebrow,
  Icon,
  MediaFrame,
  Text,
  useReducedMotion,
} from "@/design-system";
import { cn } from "@/core/utils";

import { AvailabilityBadge } from "../../../components/availability-badge";
import type { CatalogProductView } from "../../../model/catalog-view";

// Reanimated views take plain styles; NativeWind classes do not reach them on web.
const styles = StyleSheet.create({ slide: { flex: 1, minHeight: 0, gap: 20 } });

/** How long each featured product holds the stage. */
const ADVANCE_MS = 6000;

/**
 * The store's featured products on an evergreen stage. With more than one, it
 * advances on its own every few seconds — only while Home is on screen — and
 * the dots let a customer jump to any of them, which restarts the timer.
 * Reduced motion keeps the rotation but drops the cross-fade.
 */
export function FeaturedShowcase({
  products,
  onPress,
  className,
}: {
  products: CatalogProductView[];
  onPress: (product: CatalogProductView) => void;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const focused = useIsFocused();
  const reducedMotion = useReducedMotion();
  const count = products.length;
  const current = count > 0 ? index % count : 0;
  const product = products[current];

  useEffect(() => {
    if (count < 2 || !focused) return;
    // Keyed on `current`, so choosing a product restarts its full hold time.
    const timer = setTimeout(() => setIndex((value) => (value + 1) % count), ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [count, focused, current]);

  if (!product) return null;
  const ambient = cloudinaryImageUrl(product.coverMedia, "backdrop");

  return (
    <View className={cn("overflow-hidden rounded-3xl bg-primary", className)}>
      {/* The product's own colours, blurred, wash the stage behind it. */}
      {ambient ? (
        <Animated.View
          key={`ambient-${product.id}`}
          entering={reducedMotion ? undefined : FadeIn.duration(500)}
          style={StyleSheet.absoluteFill}
        >
          <AppImage
            uri={ambient}
            alt=""
            contentFit="cover"
            transition={0}
            hideFallback
            className="h-full w-full"
            // Inline: expo-image is not a NativeWind interop component, so an
            // opacity class would be dropped on Android.
            style={{ opacity: 0.4 }}
          />
          <View aria-hidden className="absolute inset-0 bg-primary/60" />
        </Animated.View>
      ) : null}

      <View className="flex-1 gap-5 p-8">
        <View className="flex-row items-center justify-between gap-4">
          <Eyebrow rule inverse>
            Featured
          </Eyebrow>
          {count > 1 ? (
            <Text className="font-sans-bold text-caption tabular-nums text-primary-foreground/75">
              {`${current + 1} / ${count}`}
            </Text>
          ) : null}
        </View>

        <Animated.View
          key={product.id}
          entering={reducedMotion ? undefined : FadeIn.duration(450)}
          style={styles.slide}
        >
          <MediaFrame
            source={product.coverMedia}
            alt={product.name}
            fit="contain"
            preset="detail"
            backdrop
            inset={18}
            tint="paper"
            fallbackLabel={product.name}
            priority="high"
            className="min-h-0 flex-1 rounded-2xl"
          />
          <View className="gap-2">
            {product.brand ? (
              <Text className="font-sans-extrabold text-eyebrow uppercase tracking-[1.6px] text-primary-foreground/75">
                {product.brand.name}
              </Text>
            ) : null}
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              className="font-display text-display-sm text-primary-foreground"
            >
              {product.name}
            </Text>
            <AvailabilityBadge
              type="product"
              inverse
              isAvailable={product.isAvailable}
              variantCount={product.variants.length}
            />
          </View>
        </Animated.View>

        <View className="flex-row items-center justify-between gap-4">
          {count > 1 ? (
            <View className="flex-row items-center" accessibilityRole="tablist">
              {products.map((item, itemIndex) => {
                const selected = itemIndex === current;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="tab"
                    accessibilityLabel={`Show ${item.name}`}
                    accessibilityState={{ selected }}
                    onPress={() => setIndex(itemIndex)}
                    className="h-touch w-9 items-center justify-center"
                  >
                    <View
                      className={cn(
                        "h-2 rounded-full",
                        selected ? "w-6 bg-primary-foreground" : "w-2 bg-primary-foreground/35",
                      )}
                    />
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View />
          )}
          <Button
            variant="inverse"
            accessibilityLabel={`Explore ${product.name}`}
            onPress={() => onPress(product)}
          >
            <Text>Explore product</Text>
            <Icon as={ArrowRight} size={18} />
          </Button>
        </View>
      </View>
    </View>
  );
}
