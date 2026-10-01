import type { CatalogMedia, CatalogVariantView } from "../../../model/catalog-view";
import { normalizeCatalogSearchText } from "../../../model/catalog-view";
import {
  deriveVariantSelectionStrategy,
  formatVariantDetails,
  formatVariantSummary,
} from "../../../model/variant-selection";

/** The first six choices are shown before "Show all". */
export const PREVIEW_CHOICE_COUNT = 6;
/** Above this many choices the rack offers search. */
const SEARCHABLE_OVER = 10;

export type OptionChoice = {
  id: string;
  variant: CatalogVariantView;
  label: string;
  /** What else distinguishes this variant, when more than one thing varies. */
  details: string | null;
  initials: string;
  /** Only variant-specific imagery; a product-wide image would repeat on every row. */
  thumb: CatalogMedia | null;
  isAvailable: boolean;
  /** Sellable units in the catalog snapshot. */
  availableQuantity: number;
  searchText: string;
};

export type VariantDecision = {
  /**
   * `dimension` — one option type varies (choose a flavor).
   * `variations` — several things vary; each choice is a concrete variant.
   * `single` — there is nothing to choose.
   */
  mode: "dimension" | "variations" | "single";
  overline: string;
  prompt: string;
  noun: string;
  nounPlural: string;
  context: string;
  choices: OptionChoice[];
  searchable: boolean;
  hasMore: boolean;
};

function pluralOf(noun: string): string {
  if (noun.endsWith("s")) return noun;
  if (/[^aeiou]y$/.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}

function promptFor(noun: string): string {
  if (noun === "strength") return "Choose strength";
  return `Choose ${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`;
}

export function optionInitials(label: string): string {
  const parts = label
    .split(/[\s/·,:-]+/)
    .filter(Boolean)
    .slice(0, 2);
  return (parts.map((part) => part.charAt(0)).join("") || "•").toUpperCase();
}

/**
 * Turns a product's real variants into the choices the Option Rack shows.
 * Nothing here picks a default: for a product with several options the
 * customer's selection is always explicit.
 */
export function deriveVariantDecision(variants: readonly CatalogVariantView[]): VariantDecision {
  const strategy = deriveVariantSelectionStrategy(variants);
  const dimension = strategy.primaryDimension;
  const mode: VariantDecision["mode"] =
    strategy.type === "single" ? "single" : dimension ? "dimension" : "variations";

  const choices = variants.map((variant): OptionChoice => {
    const dimensionValue = dimension
      ? variant.options.find((option) => option.type.id === dimension.typeId)?.value.value
      : undefined;
    const label = variant.title_override?.trim() || dimensionValue || formatVariantSummary(variant);
    const fullDetails =
      mode === "variations" ? formatVariantDetails(variant, { useKeyPrefix: true }) : null;
    // A variant labelled by its own option pairs has nothing further to say.
    const details = fullDetails === label ? null : fullDetails;
    return {
      id: variant.id,
      variant,
      label,
      details,
      initials: optionInitials(label),
      thumb: variant.mediaSource === "variant" ? variant.primaryMedia : null,
      isAvailable: variant.is_available,
      availableQuantity: variant.available_quantity,
      searchText: normalizeCatalogSearchText(
        [
          label,
          details ?? "",
          ...variant.options.map((option) => option.value.value),
          ...(variant.search_keywords ?? []),
        ].join(" "),
      ),
    };
  });

  const noun =
    mode === "dimension" && dimension ? dimension.typeName.trim().toLowerCase() : "variation";
  const nounPlural = pluralOf(noun);
  const count = choices.length;

  const context =
    mode === "single"
      ? "This product has one option."
      : mode === "variations"
        ? `All ${count} ${nounPlural} are shown with the details that distinguish them.`
        : count <= PREVIEW_CHOICE_COUNT
          ? `All ${count} ${count === 1 ? noun : nounPlural} are shown here.`
          : count > SEARCHABLE_OVER
            ? `Start with ${PREVIEW_CHOICE_COUNT} visible ${nounPlural}, search all ${count}, or show the full range.`
            : `Start with ${PREVIEW_CHOICE_COUNT} visible ${nounPlural}, or show all ${count}.`;

  return {
    mode,
    overline:
      mode === "dimension" && dimension
        ? dimension.typeName
        : mode === "single"
          ? "Option"
          : "Variations",
    prompt: mode === "single" ? "Your option" : promptFor(noun),
    noun,
    nounPlural,
    context,
    choices,
    searchable: count > SEARCHABLE_OVER,
    hasMore: count > PREVIEW_CHOICE_COUNT,
  };
}

/** Choices matching a rack search, by label, details, option values and keywords. */
export function filterChoices(choices: readonly OptionChoice[], query: string): OptionChoice[] {
  const normalized = normalizeCatalogSearchText(query);
  if (!normalized) return [...choices];
  return choices.filter((choice) => choice.searchText.includes(normalized));
}
