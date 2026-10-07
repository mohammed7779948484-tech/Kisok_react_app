import type { CatalogOptionType, CatalogOptionValue } from "./catalog-snapshot.schema";
import {
  normalizeCatalogSearchText,
  type CatalogProductView,
  type CatalogVariantView,
  type CatalogView,
} from "./catalog-view";

/**
 * "Help Me Choose": a deterministic finder that narrows the customer catalog
 * to products with ONE available variant satisfying every option answer and
 * the free-text term together. Category and brand are product-level.
 */

export type DimensionKey = "category" | "brand" | `option:${string}`;
export type GuidedAnswer =
  | { kind: "category"; categoryId: string }
  | { kind: "brand"; brandId: string }
  | { kind: "option"; typeId: string; valueId: string }
  | { kind: "skip"; dimension: DimensionKey };
export type GuidedChoice = { id: string; label: string; productCount: number };
export type GuidedQuestion =
  | {
      kind: "category" | "brand" | "option";
      key: DimensionKey;
      title: string;
      typeId: string | null;
      choices: GuidedChoice[];
    }
  | {
      kind: "text";
      key: "text";
      title: string;
      suggestions: { label: string; productCount: number }[];
    };
export type GuidedResultItem = { product: CatalogProductView; matchingVariantIds: string[] };
export type GuidedResult = {
  products: GuidedResultItem[];
  /** Products matching the committed answers alone, before the term. */
  baseCount: number;
  question: GuidedQuestion | null;
  termApplied: boolean;
  noTextMatches: boolean;
};
export type GuidedMatch = { options: { typeId: string; valueId: string }[]; term: string | null };

const MINIMUM_TERM_LENGTH = 2;
const MAXIMUM_TAP_VALUES = 8;
const MAXIMUM_SUGGESTIONS = 8;
const CATEGORY_TITLE = "What are you shopping for?";
const BRAND_TITLE = "Which brand?";
const TEXT_TITLE = "Anything specific?";
const OPTION_KEY_PREFIX = "option:";
/** Catalog ids are UUIDs; anything outside this alphabet cannot round-trip a `match`. */
const MATCH_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

type OptionPair = { typeId: string; valueId: string };
type Candidate = { product: CatalogProductView; variants: CatalogVariantView[] };
type Committed = { categoryIds: string[]; brandIds: string[]; options: OptionPair[] };
type OptionIndex = {
  types: Map<string, CatalogOptionType>;
  values: Map<string, CatalogOptionValue>;
};
type TapDimension = {
  key: DimensionKey;
  type: CatalogOptionType | null;
  /** value id -> ids of candidate products offering it */
  buckets: Map<string, Set<string>>;
  coverage: number;
};

function normalizeTerm(term: string | null | undefined): string | null {
  if (term === null || term === undefined) return null;
  const normalized = normalizeCatalogSearchText(term);
  return [...normalized].length >= MINIMUM_TERM_LENGTH ? normalized : null;
}

/**
 * What a free-text term is matched against, per variant: the product and brand
 * name (so "geek" finds every Geekbar), then the variant's own values, title and
 * keywords (so "mint" finds only the mint variants).
 */
function variantText(product: CatalogProductView, variant: CatalogVariantView): string {
  return normalizeCatalogSearchText(
    [
      product.name,
      product.brand?.name ?? "",
      ...variant.options.map((option) => option.value.value),
      variant.title_override ?? "",
      ...(variant.search_keywords ?? []),
    ].join(" "),
  );
}

function variantMatches(
  product: CatalogProductView,
  variant: CatalogVariantView,
  options: readonly OptionPair[],
  normalizedTerm: string | null,
): boolean {
  if (!variant.is_available) return false;
  const satisfiesOptions = options.every((pair) =>
    variant.options.some(
      (option) => option.type.id === pair.typeId && option.value.id === pair.valueId,
    ),
  );
  if (!satisfiesOptions) return false;
  return normalizedTerm === null || variantText(product, variant).includes(normalizedTerm);
}

function dimensionOf(answer: GuidedAnswer): DimensionKey {
  switch (answer.kind) {
    case "category":
      return "category";
    case "brand":
      return "brand";
    case "option":
      return `${OPTION_KEY_PREFIX}${answer.typeId}`;
    case "skip":
      return answer.dimension;
  }
}

function committedAnswers(answers: readonly GuidedAnswer[]): Committed {
  const committed: Committed = { categoryIds: [], brandIds: [], options: [] };
  for (const answer of answers) {
    if (answer.kind === "category") committed.categoryIds.push(answer.categoryId);
    if (answer.kind === "brand") committed.brandIds.push(answer.brandId);
    if (answer.kind === "option") {
      committed.options.push({ typeId: answer.typeId, valueId: answer.valueId });
    }
  }
  return committed;
}

function findCandidates(view: CatalogView, answers: readonly GuidedAnswer[]): Candidate[] {
  const committed = committedAnswers(answers);
  const categoryMembers = committed.categoryIds.map(
    (categoryId) => new Set(view.productsForCategory(categoryId).map((product) => product.id)),
  );

  return view.products.flatMap((product): Candidate[] => {
    if (!categoryMembers.every((members) => members.has(product.id))) return [];
    if (!committed.brandIds.every((brandId) => product.brand?.id === brandId)) return [];
    const variants = product.variants.filter((variant) =>
      variantMatches(product, variant, committed.options, null),
    );
    return variants.length > 0 ? [{ product, variants }] : [];
  });
}

function rootIdsOf(product: CatalogProductView): Set<string> {
  return new Set(product.categories.map((category) => category.parent_id ?? category.id));
}

function categoryChoices(view: CatalogView, candidates: readonly Candidate[]): GuidedChoice[] {
  const counts = new Map<string, number>();
  for (const { product } of candidates) {
    for (const rootId of rootIdsOf(product)) {
      counts.set(rootId, (counts.get(rootId) ?? 0) + 1);
    }
  }
  return view.rootCategories.flatMap((root) => {
    const productCount = counts.get(root.id) ?? 0;
    return productCount > 0 ? [{ id: root.id, label: root.name, productCount }] : [];
  });
}

function addToBucket(buckets: Map<string, Set<string>>, valueId: string, productId: string): void {
  const bucket = buckets.get(valueId);
  if (bucket === undefined) {
    buckets.set(valueId, new Set([productId]));
    return;
  }
  bucket.add(productId);
}

/** Brand and every option type offered by the candidates' matching variants. */
function tapDimensions(candidates: readonly Candidate[]): TapDimension[] {
  const brand: TapDimension = { key: "brand", type: null, buckets: new Map(), coverage: 0 };
  const options = new Map<string, TapDimension>();

  for (const { product, variants } of candidates) {
    if (product.brand !== null) {
      addToBucket(brand.buckets, product.brand.id, product.id);
      brand.coverage += 1;
    }

    const offeredTypeIds = new Set<string>();
    for (const variant of variants) {
      for (const option of variant.options) {
        let dimension = options.get(option.type.id);
        if (dimension === undefined) {
          dimension = {
            key: `${OPTION_KEY_PREFIX}${option.type.id}`,
            type: option.type,
            buckets: new Map(),
            coverage: 0,
          };
          options.set(option.type.id, dimension);
        }
        addToBucket(dimension.buckets, option.value.id, product.id);
        offeredTypeIds.add(option.type.id);
      }
    }
    for (const typeId of offeredTypeIds) {
      const dimension = options.get(typeId);
      if (dimension !== undefined) dimension.coverage += 1;
    }
  }

  return [...options.values(), brand];
}

function largestBucket(dimension: TapDimension): number {
  let largest = 0;
  for (const bucket of dimension.buckets.values()) largest = Math.max(largest, bucket.size);
  return largest;
}

function isEligible(dimension: TapDimension, candidateCount: number): boolean {
  const valueCount = dimension.buckets.size;
  return (
    valueCount >= 2 &&
    valueCount <= MAXIMUM_TAP_VALUES &&
    dimension.coverage * 2 >= candidateCount &&
    largestBucket(dimension) < dimension.coverage
  );
}

function compareDimensions(left: TapDimension, right: TapDimension): number {
  const byBucket = largestBucket(left) - largestBucket(right);
  if (byBucket !== 0) return byBucket;
  if (left.type === null || right.type === null) {
    return (left.type === null ? 1 : 0) - (right.type === null ? 1 : 0);
  }
  const byOrder = left.type.display_order - right.type.display_order;
  if (byOrder !== 0) return byOrder;
  return compareText(left.type.id, right.type.id);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function tapQuestion(
  view: CatalogView,
  dimension: TapDimension,
  candidates: readonly Candidate[],
): GuidedQuestion {
  const countFor = (valueId: string): number => dimension.buckets.get(valueId)?.size ?? 0;

  if (dimension.type === null) {
    return {
      kind: "brand",
      key: "brand",
      title: BRAND_TITLE,
      typeId: null,
      choices: view.brands.flatMap((brand) =>
        dimension.buckets.has(brand.id)
          ? [{ id: brand.id, label: brand.name, productCount: countFor(brand.id) }]
          : [],
      ),
    };
  }

  const type = dimension.type;
  const values = new Map<string, CatalogOptionValue>();
  for (const { variants } of candidates) {
    for (const variant of variants) {
      for (const option of variant.options) {
        if (option.type.id === type.id) values.set(option.value.id, option.value);
      }
    }
  }
  const ordered = [...values.values()].sort(
    (left, right) => left.display_order - right.display_order || compareText(left.id, right.id),
  );

  return {
    kind: "option",
    key: dimension.key,
    title: `Which ${type.name.toLowerCase()}?`,
    typeId: type.id,
    choices: ordered.map((value) => ({
      id: value.id,
      label: value.value,
      productCount: countFor(value.id),
    })),
  };
}

/** Suggestions never repeat an option type already answered: they could narrow nothing. */
function textQuestion(
  candidates: readonly Candidate[],
  answers: readonly GuidedAnswer[],
): GuidedQuestion {
  const answeredTypeIds = new Set(committedAnswers(answers).options.map((pair) => pair.typeId));
  const labels = new Map<string, { label: string; productIds: Set<string> }>();
  for (const { product, variants } of candidates) {
    for (const variant of variants) {
      for (const option of variant.options) {
        if (answeredTypeIds.has(option.type.id)) continue;
        const key = normalizeCatalogSearchText(option.value.value);
        const entry = labels.get(key);
        if (entry === undefined) {
          labels.set(key, { label: option.value.value, productIds: new Set([product.id]) });
        } else {
          entry.productIds.add(product.id);
        }
      }
    }
  }

  // Only values several products share are worth a tap: a value unique to one
  // product (most flavours in a real catalog) is just a product name in disguise.
  const suggestions = [...labels.entries()]
    .filter(([, entry]) => entry.productIds.size >= 2)
    .sort(
      ([leftKey, left], [rightKey, right]) =>
        right.productIds.size - left.productIds.size || compareText(leftKey, rightKey),
    )
    .slice(0, MAXIMUM_SUGGESTIONS)
    .map(([, entry]) => ({ label: entry.label, productCount: entry.productIds.size }));

  return { kind: "text", key: "text", title: TEXT_TITLE, suggestions };
}

function nextQuestion(
  view: CatalogView,
  answers: readonly GuidedAnswer[],
  candidates: readonly Candidate[],
): GuidedQuestion | null {
  const settled = new Set(answers.map(dimensionOf));

  if (!settled.has("category")) {
    const choices = categoryChoices(view, candidates);
    if (choices.length >= 2) {
      return { kind: "category", key: "category", title: CATEGORY_TITLE, typeId: null, choices };
    }
  }

  const [best] = tapDimensions(candidates)
    .filter((dimension) => !settled.has(dimension.key))
    .filter((dimension) => isEligible(dimension, candidates.length))
    .sort(compareDimensions);
  if (best !== undefined) return tapQuestion(view, best, candidates);

  return candidates.length >= 2 ? textQuestion(candidates, answers) : null;
}

export function deriveGuidedResult(
  view: CatalogView,
  answers: readonly GuidedAnswer[],
  term: string,
): GuidedResult {
  const candidates = findCandidates(view, answers);
  const normalizedTerm = normalizeTerm(term);
  const termApplied = normalizedTerm !== null;

  const products = candidates.flatMap(({ product, variants }): GuidedResultItem[] => {
    const matching = termApplied
      ? variants.filter((variant) => variantText(product, variant).includes(normalizedTerm))
      : variants;
    return matching.length > 0
      ? [{ product, matchingVariantIds: matching.map((variant) => variant.id) }]
      : [];
  });

  return {
    products,
    baseCount: candidates.length,
    // While a term is typed the text step stays on screen so it can be edited or cleared.
    question: termApplied
      ? textQuestion(candidates, answers)
      : nextQuestion(view, answers, candidates),
    termApplied,
    noTextMatches: termApplied && products.length === 0 && candidates.length > 0,
  };
}

export function questionForDimension(
  view: CatalogView,
  answers: readonly GuidedAnswer[],
  key: DimensionKey,
): GuidedQuestion | null {
  const candidates = findCandidates(
    view,
    answers.filter((answer) => dimensionOf(answer) !== key),
  );

  if (key === "category") {
    const choices = categoryChoices(view, candidates);
    return choices.length >= 2
      ? { kind: "category", key, title: CATEGORY_TITLE, typeId: null, choices }
      : null;
  }

  const dimension = tapDimensions(candidates).find((candidate) => candidate.key === key);
  if (dimension === undefined) return null;
  const question = tapQuestion(view, dimension, candidates);
  return question.kind !== "text" && question.choices.length >= 2 ? question : null;
}

export function replaceAnswer(
  view: CatalogView,
  answers: readonly GuidedAnswer[],
  index: number,
  next: GuidedAnswer,
): GuidedAnswer[] {
  if (index < 0 || index >= answers.length) return [...answers];

  const replaced = [...answers.slice(0, index), next];
  for (const later of answers.slice(index + 1)) {
    if (later.kind === "skip" || findCandidates(view, [...replaced, later]).length > 0) {
      replaced.push(later);
    }
  }
  return replaced;
}

export function removeAnswer(answers: readonly GuidedAnswer[], index: number): GuidedAnswer[] {
  return answers.filter((_, position) => position !== index);
}

const optionIndexCache = new WeakMap<CatalogView, OptionIndex>();

/** Option types and values the view still exposes through some variant. */
function optionIndexOf(view: CatalogView): OptionIndex {
  const cached = optionIndexCache.get(view);
  if (cached !== undefined) return cached;

  const index: OptionIndex = { types: new Map(), values: new Map() };
  for (const product of view.products) {
    for (const variant of product.variants) {
      for (const option of variant.options) {
        index.types.set(option.type.id, option.type);
        index.values.set(option.value.id, option.value);
      }
    }
  }
  optionIndexCache.set(view, index);
  return index;
}

function isKnownAnswer(view: CatalogView, answer: GuidedAnswer): boolean {
  const options = optionIndexOf(view);
  switch (answer.kind) {
    case "category":
      return view.resolveCategory(answer.categoryId) !== undefined;
    case "brand":
      return view.resolveBrand(answer.brandId) !== undefined;
    case "option":
      return options.values.get(answer.valueId)?.option_type_id === answer.typeId;
    case "skip":
      return (
        !answer.dimension.startsWith(OPTION_KEY_PREFIX) ||
        options.types.has(answer.dimension.slice(OPTION_KEY_PREFIX.length))
      );
  }
}

export function reconcileGuidedAnswers(
  view: CatalogView,
  answers: readonly GuidedAnswer[],
): { answers: GuidedAnswer[]; changed: boolean } {
  let kept = answers.filter((answer) => isKnownAnswer(view, answer));

  while (findCandidates(view, kept).length === 0) {
    let last = -1;
    kept.forEach((answer, position) => {
      if (answer.kind !== "skip") last = position;
    });
    if (last === -1) break;
    kept = removeAnswer(kept, last);
  }

  return { answers: kept, changed: kept.length !== answers.length };
}

export function serializeMatch(
  answers: readonly GuidedAnswer[],
  term: string | null,
): string | null {
  const entries = answers.flatMap((answer) =>
    answer.kind === "option" &&
    MATCH_ID_PATTERN.test(answer.typeId) &&
    MATCH_ID_PATTERN.test(answer.valueId)
      ? [`o.${answer.typeId}.${answer.valueId}`]
      : [],
  );
  const trimmedTerm = term?.trim() ?? "";
  if (normalizeTerm(trimmedTerm) !== null) {
    entries.push(`t.${encodeURIComponent(trimmedTerm)}`);
  }
  return entries.length > 0 ? entries.join(",") : null;
}

function decodeTerm(encoded: string): string | null {
  try {
    const decoded = decodeURIComponent(encoded).trim();
    return normalizeTerm(decoded) === null ? null : decoded;
  } catch {
    return null;
  }
}

export function parseMatch(raw: string | null | undefined): GuidedMatch | null {
  if (raw === null || raw === undefined) return null;

  const options: OptionPair[] = [];
  let term: string | null = null;
  for (const entry of raw.split(",")) {
    if (entry.startsWith("o.")) {
      const parts = entry.slice(2).split(".");
      const [typeId, valueId] = parts;
      if (
        parts.length !== 2 ||
        typeId === undefined ||
        valueId === undefined ||
        !MATCH_ID_PATTERN.test(typeId) ||
        !MATCH_ID_PATTERN.test(valueId)
      ) {
        continue;
      }
      // A variant carries one value per type, so a second value could never match.
      if (!options.some((pair) => pair.typeId === typeId)) options.push({ typeId, valueId });
    } else if (entry.startsWith("t.") && term === null) {
      term = decodeTerm(entry.slice(2));
    }
  }

  return options.length > 0 || term !== null ? { options, term } : null;
}

export function matchingVariantIds(product: CatalogProductView, match: GuidedMatch): string[] {
  const normalizedTerm = normalizeTerm(match.term);
  return product.variants
    .filter((variant) => variantMatches(product, variant, match.options, normalizedTerm))
    .map((variant) => variant.id);
}

export function answerLabel(view: CatalogView, answer: GuidedAnswer): string | null {
  switch (answer.kind) {
    case "category":
      return view.resolveCategory(answer.categoryId)?.name ?? null;
    case "brand":
      return view.resolveBrand(answer.brandId)?.name ?? null;
    case "option": {
      const value = optionIndexOf(view).values.get(answer.valueId);
      return value?.option_type_id === answer.typeId ? value.value : null;
    }
    case "skip":
      return null;
  }
}
