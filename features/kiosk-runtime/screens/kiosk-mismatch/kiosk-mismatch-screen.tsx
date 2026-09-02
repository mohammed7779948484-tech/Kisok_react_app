import { ScrollView } from "react-native";

import { Screen } from "@/components/layout/screen";
import { Text } from "@/components/ui";

/**
 * Composes this feature's UI.
 *
 * This screen owns a directory. UI used only by THIS screen belongs in its
 * `components/` folder next door; UI shared by several screens in the feature
 * moves up to `features/kiosk-runtime/components/`; UI reused across
 * features belongs in the design system under root `components/`.
 *
 * The screen may call the feature's own hooks, but never Supabase directly —
 * ESLint enforces that. Handle every state the data can be in; a screen that
 * only handles the happy path is not done.
 */
export function KioskMismatchScreen() {
  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-6">
        <Text variant="h1">KioskMismatch</Text>
        <Text variant="body" tone="muted">
          TODO: build this screen. See features/kiosk-runtime/docs/todo.md.
        </Text>
      </ScrollView>
    </Screen>
  );
}
