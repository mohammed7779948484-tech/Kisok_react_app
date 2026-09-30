import { Fragment } from "react";
import { Pressable, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";

import { Icon, Text } from "@/design-system";

import { AvailabilityBadge } from "../../../components/availability-badge";
import type { CatalogMedia, CatalogProductView } from "../../../model/catalog-view";
import { availableVariantCount } from "../../../model/product-summary";
import { ProductMediaGallery } from "./product-media-gallery";
import type { OptionChoice, VariantDecision } from "./variant-decision";

/**
 * The left half of Product Detail: where the customer came from, what the
 * product is, how it looks — and, once an option is chosen, how that option
 * looks — plus the two facts that frame the decision.
 */
export function ProductStage({
  product,
  decision,
  selected,
  media,
  activeMediaAssetId,
  onSelectMedia,
  visualHeight,
  backLabel,
  onBack,
  onBrandPress,
  onCategoryPress,
}: {
  product: CatalogProductView;
  decision: VariantDecision;
  selected: OptionChoice | null;
  media: readonly CatalogMedia[];
  activeMediaAssetId: string | null;
  onSelectMedia: (mediaAssetId: string) => void;
  visualHeight: number;
  backLabel: string;
  onBack: () => void;
  onBrandPress: () => void;
  onCategoryPress: (categoryId: string) => void;
}) {
  const available = availableVariantCount(product);
  const total = product.variants.length;
  const category = product.categories[0] ?? null;
  const taxonomy: { key: string; label: string; onPress: () => void }[] = [
    ...(product.brand ? [{ key: "brand", label: product.brand.name, onPress: onBrandPress }] : []),
    ...(category
      ? [{ key: "category", label: category.name, onPress: () => onCategoryPress(category.id) }]
      : []),
  ];

  const previewTitle = selected ? selected.label : product.name;
  const previewCopy = !selected
    ? decision.mode === "single"
      ? "The product as it is stocked."
      : "Select an option to preview its image when available."
    : selected.variant.mediaSource === "variant"
      ? "Previewing the option you selected."
      : "This option is shown with the product image.";

  return (
    <View>
      <View className="min-h-touch flex-row items-center justify-between gap-4">
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={backLabel}
          onPress={onBack}
          className="min-h-touch flex-row items-center gap-2 active:opacity-70"
        >
          <Icon as={ArrowLeft} size={16} className="text-primary" />
          <Text className="font-sans-bold text-meta text-primary">{backLabel}</Text>
        </Pressable>
        <Text
          numberOfLines={1}
          className="shrink text-caption text-muted-foreground"
          style={{ maxWidth: "45%" }}
        >
          {product.name}
        </Text>
      </View>

      <View className="gap-2 px-1 pb-2">
        {taxonomy.length > 0 ? (
          <View className="flex-row flex-wrap items-center gap-2">
            {taxonomy.map((item, index) => (
              <Fragment key={item.key}>
                {index > 0 ? (
                  <Text aria-hidden className="text-caption text-muted-foreground">
                    •
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Browse ${item.key} ${item.label}`}
                  onPress={item.onPress}
                  className="-my-3 min-h-touch justify-center active:opacity-70"
                >
                  <Text className="font-sans-extrabold text-caption uppercase tracking-[1px] text-primary">
                    {item.label}
                  </Text>
                </Pressable>
              </Fragment>
            ))}
          </View>
        ) : null}
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          className="font-display-semibold text-display-lg tracking-[-3px] text-foreground"
        >
          {product.name}
        </Text>
        <View className="flex-row flex-wrap items-center gap-x-3.5 gap-y-1">
          <AvailabilityBadge
            type="product"
            isAvailable={product.isAvailable}
            variantCount={total}
          />
          {total > 1 ? (
            <Text variant="caption" tone="muted">
              {available} of {total} options available
            </Text>
          ) : null}
        </View>
        {product.short_description ? (
          <Text variant="body" tone="muted" numberOfLines={2}>
            {product.short_description}
          </Text>
        ) : null}
      </View>

      <ProductMediaGallery
        media={media}
        alt={selected ? `${product.name} — ${selected.label}` : product.name}
        activeMediaAssetId={activeMediaAssetId}
        onSelectMedia={onSelectMedia}
        visualHeight={visualHeight}
        fallbackLabel={product.name}
        caption={
          <View className="gap-0.5" accessibilityLiveRegion="polite">
            <Text className="font-sans-extrabold text-eyebrow uppercase tracking-[1px] text-muted-foreground">
              Preview
            </Text>
            <Text numberOfLines={1} className="font-sans-bold text-body-lg">
              {previewTitle}
            </Text>
            <Text className="text-caption text-muted-foreground">{previewCopy}</Text>
          </View>
        }
      />

      <View className="mt-2.5 flex-row border-y border-foreground/10">
        <Fact value={total} label={total === 1 ? decision.noun : decision.nounPlural} />
        <Fact value={available} label="available now" last />
      </View>
    </View>
  );
}

function Fact({ value, label, last = false }: { value: number; label: string; last?: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      className={
        last
          ? "min-h-[56px] flex-1 justify-center gap-1 px-3 py-2"
          : "min-h-[56px] flex-1 justify-center gap-1 border-r border-foreground/10 px-3 py-2"
      }
    >
      <Text className="font-display-semibold text-title-lg text-primary">{String(value)}</Text>
      <Text className="text-eyebrow uppercase tracking-[0.9px] text-muted-foreground">{label}</Text>
    </View>
  );
}
