import { View } from "react-native";

import { Button, Text } from "@/design-system";
import { cn } from "@/core/utils";

/**
 * A described want that nothing matches alongside the other answers. A
 * normal, recoverable state: it names the words, and clearing them brings the
 * previous results straight back. The other answers are never touched.
 */
export function NoTextMatch({
  term,
  onClear,
  announce = false,
  testID,
  className,
}: {
  term: string;
  onClear: () => void;
  /** Only one copy on screen is a live region, so it is announced once. */
  announce?: boolean;
  testID: string;
  className?: string;
}) {
  return (
    <View className={cn("gap-3", className)}>
      <Text variant="body" accessibilityLiveRegion={announce ? "polite" : "none"}>
        {`No matches for “${term}” with your other choices.`}
      </Text>
      <Button variant="tonal" size="compact" onPress={onClear} testID={testID}>
        <Text>{`Clear “${term}”`}</Text>
      </Button>
    </View>
  );
}
