import { ScrollView, View } from "react-native";

import { Screen } from "@/components/layout/screen";
import { Badge, Card, CardContent, CardHeader, CardTitle, Separator, Text } from "@/components/ui";
import { useAuth } from "@/core/auth";

/**
 * Honest stand-in for an experience that has not been built yet.
 *
 * It exists so the foundation is demonstrably wired end to end — sign in, role
 * resolution, routing, theming — without pretending a feature exists. Delete it
 * once the real screens land.
 */
export function FoundationPlaceholder({
  experience,
  nextFeature,
  surfaces,
}: {
  experience: string;
  nextFeature: string;
  surfaces: string[];
}) {
  const { profile, signOut } = useAuth();

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerClassName="gap-6 p-6">
        <View className="gap-2">
          <Badge variant="primary">
            <Text>{experience}</Text>
          </Badge>
          <Text variant="h1">Foundation is ready</Text>
          <Text variant="body" tone="muted">
            Signed in as {profile?.display_name ?? "unknown"} ({profile?.role}). No feature screens
            have been implemented yet.
          </Text>
        </View>

        <Card>
          <CardHeader>
            <CardTitle>Planned surfaces</CardTitle>
          </CardHeader>
          <CardContent className="gap-2">
            {surfaces.map((surface) => (
              <Text key={surface} variant="body" tone="muted">
                • {surface}
              </Text>
            ))}
          </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>Start the next feature</CardTitle>
          </CardHeader>
          <CardContent className="gap-2">
            <Text variant="body" tone="muted">
              Generate the vertical slice, then work through its TODO.md:
            </Text>
            <Text variant="mono" className="text-sm">
              pnpm generate feature {nextFeature}
            </Text>
            <Text variant="caption">Read AGENTS.md before you start.</Text>
          </CardContent>
        </Card>

        <Text
          variant="caption"
          className="underline"
          accessibilityRole="button"
          onPress={() => void signOut()}
        >
          Sign out
        </Text>
      </ScrollView>
    </Screen>
  );
}
