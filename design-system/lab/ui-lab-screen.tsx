import { ScrollView, View } from "react-native";

import { useLayout } from "../foundations/responsive";
import { ContentContainer } from "../layout/content-container";
import { Screen } from "../layout/screen";
import { Eyebrow } from "../patterns/section-heading";
import { Text } from "../primitives/text";
import { ComponentExamples } from "./component-examples";
import { StateExamples } from "./state-examples";
import { ResponsiveExamples, TokenExamples } from "./token-examples";

/**
 * The executable reference for the design system — development builds only.
 * Everything here is the real production component, rendered with example
 * props; nothing is a parallel demo implementation.
 */
export function UiLabScreen() {
  const { isExpanded } = useLayout();
  return (
    <Screen edges={["top", "bottom", "left", "right"]} constrained={false}>
      <ScrollView contentContainerClassName="pb-16">
        <View className="bg-primary">
          <ContentContainer className="gap-3 py-10">
            <Eyebrow rule inverse>
              UI Lab
            </Eyebrow>
            <Text variant="display" tone="inverse" accessibilityRole="header">
              KISOK design system
            </Text>
            <Text className="text-body-lg text-primary-foreground/80">
              Theme, tokens, foundations, primitives, composites, feedback, layout, media and
              patterns — as they render on this device.
            </Text>
          </ContentContainer>
        </View>
        <ContentContainer className="gap-16 pt-12">
          <ResponsiveExamples />
          <TokenExamples />
          <ComponentExamples wide={isExpanded} />
          <StateExamples />
        </ContentContainer>
      </ScrollView>
    </Screen>
  );
}
