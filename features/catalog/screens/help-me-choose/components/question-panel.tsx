import { useMemo } from "react";
import { Pressable, View } from "react-native";

import { Button, Eyebrow, SearchInput, Text } from "@/design-system";

import type { CatalogView } from "../../../model/catalog-view";
import {
  answerLabel,
  questionForDimension,
  type DimensionKey,
  type GuidedAnswer,
  type GuidedChoice,
  type GuidedQuestion,
  type GuidedResult,
} from "../../../model/guided-discovery";
import { productCountLabel } from "../../../model/labels";
import { AnswerChip } from "./answer-chip";
import { ChoiceTile } from "./choice-tile";
import { NoTextMatch } from "./no-text-match";

const MAXIMUM_SUGGESTIONS = 8;

type TapQuestion = Extract<GuidedQuestion, { kind: "category" | "brand" | "option" }>;

export function dimensionOfAnswer(answer: GuidedAnswer): DimensionKey {
  switch (answer.kind) {
    case "category":
      return "category";
    case "brand":
      return "brand";
    case "option":
      return `option:${answer.typeId}`;
    case "skip":
      return answer.dimension;
  }
}

function answerForChoice(question: TapQuestion, choice: GuidedChoice): GuidedAnswer | null {
  switch (question.kind) {
    case "category":
      return { kind: "category", categoryId: choice.id };
    case "brand":
      return { kind: "brand", brandId: choice.id };
    case "option":
      return question.typeId === null
        ? null
        : { kind: "option", typeId: question.typeId, valueId: choice.id };
  }
}

function answeredValueId(answer: GuidedAnswer | undefined): string | null {
  switch (answer?.kind) {
    case "category":
      return answer.categoryId;
    case "brand":
      return answer.brandId;
    case "option":
      return answer.valueId;
    default:
      return null;
  }
}

export function matchCountLabel(count: number): string {
  return `${count} ${count === 1 ? "match" : "matches"}`;
}

export type QuestionPanelProps = {
  view: CatalogView;
  answers: GuidedAnswer[];
  term: string;
  result: GuidedResult;
  editingIndex: number | null;
  catalogChanged: boolean;
  showStartOver: boolean;
  /** A tap answer: appended, or replacing the answer being edited. */
  onAnswer: (answer: GuidedAnswer) => void;
  onEdit: (index: number) => void;
  onCancelEdit: () => void;
  onRemove: (index: number) => void;
  onTermChange: (term: string) => void;
  onStartOver: () => void;
};

/**
 * The guided questions: the answers so far, the one question being asked (or
 * the answer being changed), and the way back to the start. Results live
 * beside or below it and are tappable whatever the panel shows.
 */
export function QuestionPanel({
  view,
  answers,
  term,
  result,
  editingIndex,
  catalogChanged,
  showStartOver,
  onAnswer,
  onEdit,
  onCancelEdit,
  onRemove,
  onTermChange,
  onStartOver,
}: QuestionPanelProps) {
  const chips = useMemo(
    () =>
      answers.flatMap((answer, index) => {
        const label = answerLabel(view, answer);
        if (label === null) return [];
        const editable = questionForDimension(view, answers, dimensionOfAnswer(answer)) !== null;
        return [{ index, label, editable }];
      }),
    [view, answers],
  );

  const editingAnswer = editingIndex === null ? undefined : answers[editingIndex];
  const editQuestion = useMemo(
    () =>
      editingAnswer === undefined
        ? null
        : questionForDimension(view, answers, dimensionOfAnswer(editingAnswer)),
    [view, answers, editingAnswer],
  );
  const editing = editQuestion !== null && editQuestion.kind !== "text";

  const question = editing ? editQuestion : result.question;
  const matchCount = result.products.length;
  const title = question?.title ?? `That's everything — ${matchCountLabel(matchCount)} for you.`;
  const trimmedTerm = term.trim();

  return (
    <View testID="help-me-choose-question" className="gap-6">
      <View className="gap-3">
        <Eyebrow rule>Help me choose</Eyebrow>
        {catalogChanged ? (
          <Text variant="meta" tone="warning" accessibilityLiveRegion="polite">
            Some choices changed because the catalog was updated.
          </Text>
        ) : null}
        <Text variant="h2" accessibilityRole="header">
          {title}
        </Text>
      </View>

      {chips.length > 0 || result.termApplied ? (
        <View className="flex-row flex-wrap gap-2">
          {chips.map((chip) => (
            <AnswerChip
              key={`${chip.index}-${chip.label}`}
              label={chip.label}
              editing={editing && editingIndex === chip.index}
              onChange={chip.editable ? () => onEdit(chip.index) : undefined}
              onRemove={() => onRemove(chip.index)}
            />
          ))}
          {result.termApplied ? (
            <AnswerChip label={`“${trimmedTerm}”`} onRemove={() => onTermChange("")} />
          ) : null}
        </View>
      ) : null}

      {question !== null && question.kind !== "text" ? (
        <View className="gap-4">
          <View className="flex-row flex-wrap gap-3">
            {question.choices.map((choice) => (
              <ChoiceTile
                key={choice.id}
                choice={choice}
                selected={editing && answeredValueId(editingAnswer) === choice.id}
                onPress={(chosen) => {
                  const answer = answerForChoice(question, chosen);
                  if (answer !== null) onAnswer(answer);
                }}
              />
            ))}
          </View>
          {editing ? (
            <Button variant="tonal" size="compact" onPress={onCancelEdit}>
              <Text>Cancel</Text>
            </Button>
          ) : (
            <Button
              variant="tonal"
              size="compact"
              testID="help-me-choose-skip"
              onPress={() => onAnswer({ kind: "skip", dimension: question.key })}
            >
              <Text>No preference</Text>
            </Button>
          )}
        </View>
      ) : null}

      {question?.kind === "text" ? (
        <View className="gap-4">
          <SearchInput
            testID="help-me-choose-term"
            value={term}
            onChangeText={onTermChange}
            accessibilityLabel="Describe what you want"
            placeholder="e.g. mint, ice, 10mg"
          />
          {result.noTextMatches ? (
            <NoTextMatch
              term={trimmedTerm}
              onClear={() => onTermChange("")}
              announce
              testID="help-me-choose-clear-term"
            />
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {question.suggestions.slice(0, MAXIMUM_SUGGESTIONS).map((suggestion) => (
                <Pressable
                  key={suggestion.label}
                  accessibilityRole="button"
                  accessibilityLabel={`${suggestion.label}, ${productCountLabel(suggestion.productCount)}`}
                  onPress={() => onTermChange(suggestion.label)}
                  className="min-h-touch flex-row items-center gap-2 rounded-full border border-border bg-card px-4 active:bg-muted"
                >
                  <Text className="font-sans-semibold text-meta">{suggestion.label}</Text>
                  <Text variant="caption" tone="muted">
                    {suggestion.productCount}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {question === null ? (
        <Text variant="body" tone="muted">
          Tap a result to see its options, or change an answer above.
        </Text>
      ) : null}

      {showStartOver ? (
        <Button variant="text" testID="help-me-choose-start-over" onPress={onStartOver}>
          <Text>Start over</Text>
        </Button>
      ) : null}
    </View>
  );
}
