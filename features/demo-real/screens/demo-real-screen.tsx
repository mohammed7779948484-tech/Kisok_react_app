import { ScrollView, View } from "react-native";

import { EmptyState, ErrorState, SkeletonList } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Text } from "@/components/ui";
import { DemoRealList } from "../components/demo-real-list";
import { useDemoRealList } from "../queries/use-demo-real-list";

/**
 * Composes this feature's UI.
 *
 * The screen may call the feature's query hooks, but never Supabase directly —
 * ESLint enforces that. Handle every state below; a screen that only handles
 * the happy path is not done.
 */
export function DemoRealScreen() {
  const { data, isPending, isError, error, refetch } = useDemoRealList();

  if (isPending) {
    return (
      <Screen>
        <View className="p-6">
          <SkeletonList />
        </View>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (data.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Nothing here yet"
          description="TODO: write the real empty state for this feature."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-6">
        <Text variant="h1">DemoReal</Text>
        <DemoRealList items={data} />
      </ScrollView>
    </Screen>
  );
}
