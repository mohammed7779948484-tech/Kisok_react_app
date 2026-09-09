import { View } from "react-native";

import { Button, Text } from "@/components/ui";
import { cn } from "@/core/utils";

import type { CatalogVariantView } from "../../../model/catalog-view";

/**
 * The generic variant selector of Product Detail (AC-07, Design decision 9).
 *
 * Presentational only: it receives the model's DERIVED variants, the selected
 * variant id and its callback as props and reports interactions upward. It
 * must not fetch, must not read a store, and must not import the Supabase
 * client or a router — the owning screen owns the selection state (Design
 * decision 3: the selected variant is screen-local React state, never a Cart
 * action) and the routing.
 *
 * Every entry is the model's derived `label` consumed AS-IS — never re-derived
 * here: `title_override`, ordered "Type: value" option pairs, or the neutral
 * `Standard option` / `Option N` fallback, in backend variant order. The
 * ordered option pairs render as a supplementary detail line ONLY on a
 * `title_override` variant — the one case where the label hides them; when the
 * label itself is the option pairs, repeating them below would be noise.
 *
 * ANY variant, including an unavailable one, stays a plain selectable Button —
 * inspection is the whole point (Design decision 9), so entries are never
 * disabled. Selection is announced through `aria-selected` (the platform-safe
 * spelling prescribed by docs/design-system.md) and mirrored visually by the
 * primary/ghost variants — the same chip pattern as the Category Brand Filter,
 * never colour alone. Availability is words on every entry, and the entry's
 * accessible name mirrors the VISIBLE text composition: label, the ordered
 * option pairs when the detail line renders (title_override variants only —
 * the options-only entries already announce their pairs as the label), and
 * availability. A product's variant set is small and
 * owner-managed, so a bounded column of full-width entries is honest here — no
 * virtualization ceremony (see the kisok-react-native-rules list rules).
 */
export type VariantChoiceListProps = {
  /** The model's derived variants for the resolved product, in backend order. */
  variants: readonly CatalogVariantView[];
  /**
   * The currently selected variant id. The component never changes it by
   * itself — it is controlled by the owning screen.
   */
  selectedVariantId: string;
  /** Reports the pressed entry's variant id — inspection, never a Cart action. */
  onSelectVariant: (variantId: string) => void;
  className?: string;
};

export function VariantChoiceList({
  variants,
  selectedVariantId,
  onSelectVariant,
  className,
}: VariantChoiceListProps) {
  return (
    <View className={cn("gap-2", className)}>
      <Text variant="body" tone="muted">
        Choose a variant
      </Text>
      <View className="gap-2">
        {variants.map((variant) => {
          const isSelected = variant.id === selectedVariantId;
          const availability = variant.is_available ? "Available" : "Out of stock";
          // The ordered pairs render as a visible detail line ONLY on a
          // title_override variant (the one case where the label hides them);
          // the accessible name carries the same composition so what a screen
          // reader announces matches what is on screen.
          const optionPairs =
            variant.title_override !== null && variant.options.length > 0
              ? variant.options.map((option) => option.label).join(" · ")
              : null;

          return (
            <Button
              key={variant.id}
              variant={isSelected ? "primary" : "ghost"}
              block
              aria-selected={isSelected}
              accessibilityLabel={
                optionPairs !== null
                  ? `${variant.label}, ${optionPairs}, ${availability}`
                  : `${variant.label}, ${availability}`
              }
              onPress={() => onSelectVariant(variant.id)}
              className="flex-col items-start justify-start gap-1"
            >
              <Text>{variant.label}</Text>
              {optionPairs !== null ? <Text variant="label">{optionPairs}</Text> : null}
              <Text variant="label">{availability}</Text>
            </Button>
          );
        })}
      </View>
    </View>
  );
}
