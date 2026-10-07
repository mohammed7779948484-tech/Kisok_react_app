import { useCallback, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, splitMinWidth, Text, usePageGutter } from "@/design-system";

import { CatalogGrid, type CatalogGridRowInfo } from "../../components/catalog-grid";
import { CatalogShell } from "../../components/catalog-shell";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogLoadingState,
} from "../../components/catalog-state-panel";
import { ProductCard } from "../../components/product-card";
import type { CatalogProductView, CatalogView } from "../../model/catalog-view";
import {
  deriveGuidedResult,
  reconcileGuidedAnswers,
  removeAnswer,
  replaceAnswer,
  serializeMatch,
  type GuidedAnswer,
} from "../../model/guided-discovery";
import { useCatalog } from "../../queries/use-catalog";
import { productDetailHref } from "../product-detail/product-detail-href";
import { NoTextMatch } from "./components/no-text-match";
import { matchCountLabel, QuestionPanel } from "./components/question-panel";

/** The question column beside the results in a split layout. */
const QUESTION_PANEL_WIDTH = 420;

const productKey = (product: CatalogProductView) => product.id;

export type HelpMeChooseScreenProps = {
  /** Open already scoped to a category (from a category page). */
  categoryId?: string;
  /** Open already scoped to a brand (from a brand page). */
  brandId?: string;
};

function scopeAnswers(categoryId?: string, brandId?: string): GuidedAnswer[] {
  const answers: GuidedAnswer[] = [];
  if (categoryId) answers.push({ kind: "category", categoryId });
  if (brandId) answers.push({ kind: "brand", brandId });
  return answers;
}

function sameAnswers(left: readonly GuidedAnswer[], right: readonly GuidedAnswer[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Help Me Choose: a few catalog-derived questions for a customer who does not
 * know names, over live results they can open at any moment. Answers, the
 * described want and the edit in progress are screen-local; nothing persists.
 */
export function HelpMeChooseScreen({ categoryId, brandId }: HelpMeChooseScreenProps = {}) {
  const router = useRouter();
  const catalog = useCatalog();
  const gutter = usePageGutter();
  const [width, setWidth] = useState(0);

  const initialAnswers = useMemo(() => scopeAnswers(categoryId, brandId), [categoryId, brandId]);
  const [answers, setAnswers] = useState<GuidedAnswer[]>(initialAnswers);
  const [term, setTerm] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [catalogChanged, setCatalogChanged] = useState(false);
  const [reconciledView, setReconciledView] = useState<CatalogView | undefined>(undefined);

  // A new snapshot may no longer offer an answered value: reconcile once per
  // view (the first one included), during render so stale answers never paint.
  const view = catalog.data;
  if (view !== undefined && view !== reconciledView) {
    setReconciledView(view);
    const reconciled = reconcileGuidedAnswers(view, answers);
    if (reconciled.changed) {
      setAnswers(reconciled.answers);
      setEditingIndex(null);
      // Only a refresh changed the catalog; a starting scope with nothing in
      // stock is simply dropped on first open.
      setCatalogChanged(reconciledView !== undefined);
    }
  }

  const result = useMemo(
    () => (view === undefined ? null : deriveGuidedResult(view, answers, term)),
    [view, answers, term],
  );
  const resultProducts = useMemo(
    () => result?.products.map((item) => item.product) ?? [],
    [result],
  );
  // Card copy only once an answer or the term chose between a product's options.
  const narrowsVariants =
    answers.some((answer) => answer.kind === "option") || !!result?.termApplied;
  const matchingCounts = useMemo(
    () =>
      new Map(
        narrowsVariants
          ? (result?.products ?? []).map((item) => [
              item.product.id,
              item.matchingVariantIds.length,
            ])
          : [],
      ),
    [result, narrowsVariants],
  );

  // Product Detail lists the choices matching these answers first; a term
  // that matched nothing is never passed on.
  const match = serializeMatch(answers, result?.noTextMatches ? null : term);
  const handleProductPress = useCallback(
    (product: CatalogProductView) => {
      router.push(productDetailHref(product.id, "Back to Help me choose", match));
    },
    [router, match],
  );

  const renderCard = useCallback(
    ({ item, onPress }: CatalogGridRowInfo<CatalogProductView>) => {
      const matching = matchingCounts.get(item.id);
      return (
        <ProductCard
          product={item}
          onPress={onPress}
          matchReason={
            matching !== undefined && item.variants.length > 1
              ? {
                  field: "Your choices",
                  value: `${matching} option${matching === 1 ? "" : "s"}`,
                }
              : null
          }
        />
      );
    },
    [matchingCounts],
  );

  if (catalog.isPending) return <CatalogLoadingState destination={null} />;

  if (catalog.isError && !view) {
    return (
      <CatalogErrorState
        destination={null}
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
      />
    );
  }

  if (!view || view.products.length === 0 || result === null) {
    return <CatalogEmptyState destination={null} onRetry={() => void catalog.refetch()} />;
  }

  const startAnswers = reconcileGuidedAnswers(view, initialAnswers).answers;
  const showStartOver = term.length > 0 || !sameAnswers(answers, startAnswers);

  const commitAnswers = (next: GuidedAnswer[]) => {
    setAnswers(next);
    setEditingIndex(null);
    setCatalogChanged(false);
  };

  const handleAnswer = (answer: GuidedAnswer) => {
    commitAnswers(
      editingIndex === null
        ? [...answers, answer]
        : replaceAnswer(view, answers, editingIndex, answer),
    );
  };

  const handleStartOver = () => {
    commitAnswers(startAnswers);
    setTerm("");
  };

  const split = width - gutter * 2 >= splitMinWidth;
  const trimmedTerm = term.trim();

  const panel = (
    <QuestionPanel
      view={view}
      answers={answers}
      term={term}
      result={result}
      editingIndex={editingIndex}
      catalogChanged={catalogChanged}
      showStartOver={showStartOver}
      onAnswer={handleAnswer}
      onEdit={setEditingIndex}
      onCancelEdit={() => setEditingIndex(null)}
      onRemove={(index) => commitAnswers(removeAnswer(answers, index))}
      onTermChange={setTerm}
      onStartOver={handleStartOver}
    />
  );

  const resultsHeader = (
    <View className="pb-5 pt-8">
      <Text variant="h3" accessibilityLiveRegion="polite">
        {matchCountLabel(resultProducts.length)}
      </Text>
    </View>
  );

  const emptyResults = result.noTextMatches ? (
    <NoTextMatch
      term={trimmedTerm}
      onClear={() => setTerm("")}
      testID="help-me-choose-results-clear-term"
      className="items-start py-6"
    />
  ) : (
    <EmptyState
      className="py-12"
      title="Nothing in stock matches these choices"
      description="Remove an answer to widen the results."
      action={showStartOver ? { label: "Start over", onPress: handleStartOver } : undefined}
    />
  );

  const grid = (header: React.ReactElement) => (
    <CatalogGrid
      data={resultProducts}
      renderItem={renderCard}
      keyExtractor={productKey}
      onItemPress={handleProductPress}
      horizontalPadding={gutter}
      maxColumns={4}
      extraData={matchingCounts}
      listHeaderComponent={header}
      listEmptyComponent={emptyResults}
      testID="help-me-choose-results"
    />
  );

  return (
    <CatalogShell currentDestination={null} settings={view.settings}>
      <View
        className="flex-1"
        onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
      >
        {width === 0 ? null : split ? (
          <View className="flex-1 flex-row">
            <ScrollView
              keyboardShouldPersistTaps="handled"
              className="border-r border-border"
              // A ScrollView grows in a row on web; pin the column so the results get the room.
              style={{ width: QUESTION_PANEL_WIDTH + gutter, flexGrow: 0, flexShrink: 0 }}
              contentContainerClassName="pb-12 pt-8 pr-8"
              contentContainerStyle={{ paddingLeft: gutter }}
            >
              {panel}
            </ScrollView>
            <View className="min-w-0 flex-1">{grid(resultsHeader)}</View>
          </View>
        ) : (
          grid(
            <View className="pt-8">
              {panel}
              {resultsHeader}
            </View>,
          )
        )}
      </View>
    </CatalogShell>
  );
}
